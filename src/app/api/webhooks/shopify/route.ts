import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";

import { errorFields, log } from "@/lib/log";
import { shopifyFetch } from "@/lib/shopify/client";
import { PRODUCT_METAFIELD_IDENTIFIERS } from "@/lib/shopify/fragments";
import * as Q from "@/lib/shopify/queries";
import {
  consistencyProbe,
  isCaughtUp,
  topicToTags,
  verifyShopifyHmac,
  type ConsistencyProbe,
  type ProbeObservation,
  type RevalidationPlan,
} from "@/lib/shopify/webhooks";

/**
 * Shopify webhook receiver.
 *
 * Shopify POSTs a JSON body signed with the app's client secret. We verify the
 * signature over the raw bytes, check the shop domain, then expire the cache
 * tags in `src/lib/shopify/tags.ts` for the affected resource. The storefront
 * holds no Admin token: this route only ever invalidates caches.
 *
 * Shopify retries any response that is not 2xx and gives up after ~48 hours,
 * so the handler answers 200 straight away and does the slow part — waiting
 * for the Storefront API to catch up with the admin write, then expiring the
 * tags — in `after()`, once the response has gone out.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Room for the post-response settle loop (SETTLE_TIMEOUT_MS) plus the probes. */
export const maxDuration = 30;

/** How long to wait for the Storefront API to reflect the write before expiring anyway. */
const SETTLE_TIMEOUT_MS = 20_000;
/** Gap between Storefront API probes. */
const SETTLE_POLL_MS = 1_500;
/** Fixed wait when there is nothing addressable to probe (inventory, no handle). */
const SETTLE_FIXED_DELAY_MS = 4_000;

/**
 * The probes send the SAME query text and variables as the page that renders
 * the resource (`getProduct` / `getCollectionPage` with default options), not
 * a slimmer one. Shopify caches Storefront API responses per query, and a
 * slim probe was observed reporting "caught up" while the page's own query
 * still returned the previous version — the page then re-cached stale data.
 * Probing with the page's query means "fresh here" implies "fresh for the
 * page" (same edge, same cache key). The page-size constant mirrors
 * `PAGE_SIZE` in `src/lib/shopify/index.ts`.
 */
const PROBE_PAGE_SIZE = 250;
const PROBE_QUERIES: Record<"product" | "collection", (handle: string) => { query: string; variables: Record<string, unknown> }> = {
  product: (handle) => ({
    query: Q.GET_PRODUCT_BY_HANDLE,
    variables: { handle, metafieldIdentifiers: PRODUCT_METAFIELD_IDENTIFIERS },
  }),
  collection: (handle) => ({
    query: Q.GET_COLLECTION_BY_HANDLE,
    variables: { handle, first: PROBE_PAGE_SIZE, after: null, sortKey: null, reverse: null, filters: null },
  }),
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** One uncached read of the affected resource through the page's own query. */
async function observe(probe: Exclude<ConsistencyProbe, { kind: "delay" }>): Promise<ProbeObservation> {
  const { query, variables } = PROBE_QUERIES[probe.kind](probe.handle);
  const data = await shopifyFetch<Record<string, { updatedAt?: string | null } | null>>({
    query,
    variables,
    cache: "no-store",
    retry: false,
    operation: `webhook.probe.${probe.kind}`,
  });
  const node = data[probe.kind];
  return { exists: node !== null && node !== undefined, updatedAt: node?.updatedAt ?? null };
}

/**
 * Expire the plan's tags once the Storefront API reflects the write.
 *
 * Runs after the 200 has been sent. Polls the Storefront API (uncached) until
 * `isCaughtUp`, or gives up at SETTLE_TIMEOUT_MS and expires regardless — a
 * late-but-correct expiry beats leaving the caches alone. Probe failures are
 * logged and treated as "not yet".
 */
type Meta = Record<string, string | number | boolean | null | undefined>;

async function settleAndExpire(plan: RevalidationPlan, payload: unknown, meta: Meta) {
  const probe = consistencyProbe(plan, payload);
  const started = Date.now();
  let probes = 0;
  let outcome: "caught_up" | "timeout" | "delayed" = "caught_up";

  if (probe.kind === "delay") {
    outcome = "delayed";
    await sleep(SETTLE_FIXED_DELAY_MS);
  } else {
    for (;;) {
      probes += 1;
      try {
        if (isCaughtUp(probe, await observe(probe))) break;
      } catch (error) {
        log.warn("shopify.webhook.probe_failed", { ...meta, probes, ...errorFields(error) });
      }
      if (Date.now() - started >= SETTLE_TIMEOUT_MS) {
        outcome = "timeout";
        break;
      }
      await sleep(SETTLE_POLL_MS);
    }
  }

  try {
    expire(plan);
    // Second pass: on Vercel a single purge was observed not taking effect on
    // the page cache roughly one time in three, with the stale copy then
    // living out its full hour. A repeat a few seconds later also covers a
    // regeneration that raced the first purge. Cheap: it only costs a second
    // refetch on the next visit.
    await sleep(SECOND_PASS_DELAY_MS);
    expire(plan);
  } catch (error) {
    log.error("shopify.webhook.revalidate_failed", { ...meta, ...errorFields(error) });
    return;
  }

  log.info("shopify.webhook.revalidated", {
    ...meta,
    tags: plan.tags.length,
    paths: pathsFor(plan).join(","),
    outcome,
    probes,
    waitedMs: Date.now() - started,
  });
}

/** Gap between the first and second purge. */
const SECOND_PASS_DELAY_MS = 5_000;

/** The page(s) that render this resource directly. Listings are covered by the coarse tags. */
function pathsFor(plan: RevalidationPlan): string[] {
  if (!plan.handle) return [];
  if (plan.topic.startsWith("products/")) return [`/product/${plan.handle}`];
  if (plan.topic.startsWith("collections/")) return [`/shop/${plan.handle}`];
  return [];
}

/** Expire by tag (data + every page that used it) and by path (the page itself). */
function expire(plan: RevalidationPlan): void {
  for (const tag of plan.tags) {
    // `{ expire: 0 }` expires the tagged entries immediately, so the very next
    // visit refetches from Shopify. The "max" profile would instead serve the
    // stale copy once and refresh in the background, which made admin edits
    // look like they took minutes to appear.
    revalidateTag(tag, { expire: 0 });
  }
  for (const path of pathsFor(plan)) revalidatePath(path);
}

/** Known aliases for this store. The internal domain is what Shopify actually sends. */
const KNOWN_SHOPS = ["ihuvab-u2.myshopify.com", "prosporter.myshopify.com"];

/**
 * Best-effort duplicate suppression.
 *
 * Shopify redelivers on timeouts, so the same `X-Shopify-Webhook-Id` can arrive
 * twice. This is a per-process LRU: it is NOT shared across instances or across
 * a cold start, so multi-instance dedupe is explicitly out of scope. A missed
 * dedupe only costs a redundant revalidation, which is harmless.
 */
const SEEN_LIMIT = 512;
const SEEN_TTL_MS = 10 * 60 * 1000;
const seen = new Map<string, number>();

function seenBefore(webhookId: string): boolean {
  if (!webhookId) return false;
  const now = Date.now();
  const previous = seen.get(webhookId);
  if (previous !== undefined && now - previous < SEEN_TTL_MS) {
    seen.delete(webhookId);
    seen.set(webhookId, now);
    return true;
  }
  seen.delete(webhookId);
  seen.set(webhookId, now);
  while (seen.size > SEEN_LIMIT) {
    const oldest = seen.keys().next().value;
    if (oldest === undefined) break;
    seen.delete(oldest);
  }
  return false;
}

/** Shop domains this receiver accepts, lower-cased. */
function allowedShops(): Set<string> {
  const configured = (process.env.SHOPIFY_WEBHOOK_ALLOWED_SHOPS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (configured.length > 0) return new Set(configured);

  const shops = new Set(KNOWN_SHOPS);
  const fromEnv = (process.env.SHOPIFY_STORE_DOMAIN ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  if (fromEnv) shops.add(fromEnv);
  return shops;
}

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const topicHeader = request.headers.get("x-shopify-topic") ?? "";
  const webhookId = request.headers.get("x-shopify-webhook-id") ?? "";
  const shop = (request.headers.get("x-shopify-shop-domain") ?? "").trim().toLowerCase();

  const secret = (process.env.SHOPIFY_WEBHOOK_SECRET ?? "").trim();
  if (!secret) {
    // Never answer 200 here: a 500 makes Shopify retry, so events survive a
    // misconfigured deploy instead of being silently dropped.
    log.error("shopify.webhook.misconfigured", {
      reason: "SHOPIFY_WEBHOOK_SECRET is not set",
      topic: topicHeader,
      webhookId,
    });
    return json(500, { ok: false, error: "webhook receiver not configured" });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (error) {
    log.warn("shopify.webhook.body_unreadable", { topic: topicHeader, webhookId, ...errorFields(error) });
    return json(400, { ok: false, error: "unreadable body" });
  }

  // Signature first: everything below this line trusts the headers.
  if (!verifyShopifyHmac(rawBody, request.headers.get("x-shopify-hmac-sha256"), secret)) {
    log.warn("shopify.webhook.rejected", {
      reason: "invalid_hmac",
      topic: topicHeader,
      webhookId,
      shop,
    });
    return json(401, { ok: false, error: "invalid signature" });
  }

  if (!allowedShops().has(shop)) {
    log.warn("shopify.webhook.rejected", { reason: "unexpected_shop", topic: topicHeader, webhookId, shop });
    return json(403, { ok: false, error: "unexpected shop" });
  }

  if (seenBefore(webhookId)) {
    log.info("shopify.webhook.duplicate", { topic: topicHeader, webhookId, shop });
    return json(200, { ok: true, duplicate: true });
  }

  let payload: unknown = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    // A signed body that is not JSON is odd but not actionable; the coarse tag
    // still gets revalidated from the topic alone.
    log.warn("shopify.webhook.unparsable_payload", { topic: topicHeader, webhookId, shop });
  }

  const plan = topicToTags(topicHeader, payload);
  if (!plan.known) {
    log.info("shopify.webhook.ignored", { topic: plan.topic, webhookId, shop });
    return json(200, { ok: true, ignored: true });
  }

  const meta = { topic: plan.topic, webhookId, shop, handle: plan.handle };
  log.info("shopify.webhook.accepted", meta);
  after(() => settleAndExpire(plan, payload, meta));
  return json(200, { ok: true, topic: plan.topic, tags: plan.tags });
}
