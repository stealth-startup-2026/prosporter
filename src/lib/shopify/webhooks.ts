/**
 * Pure helpers for the Shopify webhook receiver.
 *
 * Deliberately free of `server-only`, `next/*`, env reads and I/O: the route
 * handler at `src/app/api/webhooks/shopify/route.ts` owns all of that. Keeping
 * this module plain means `node --test` can import it directly (Node >= 22.18
 * strips the TypeScript types), so the security-critical logic is unit tested
 * without booting Next.
 *
 * The `./tags.ts` specifier carries its extension on purpose — it is what lets
 * plain Node resolve the import (`allowImportingTsExtensions` in tsconfig.json
 * permits it; bundlers resolve explicit extensions fine).
 */
import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";

import { CACHE_TAGS } from "./tags.ts";

/** Length in bytes of a SHA-256 digest. */
const DIGEST_BYTES = 32;

/**
 * Constant-time verification of the `X-Shopify-Hmac-Sha256` header.
 *
 * Shopify signs the *raw* request body with the app's client secret and sends
 * the digest base64-encoded. The body must never be re-serialised before this
 * runs — `JSON.parse` + `JSON.stringify` changes bytes and breaks the digest.
 *
 * Returns false (never throws) for a missing header, a missing secret, a
 * malformed base64 value, or a mismatch.
 */
export function verifyShopifyHmac(
  rawBody: string | Uint8Array,
  headerValue: string | null | undefined,
  secret: string,
): boolean {
  if (!headerValue || !secret) return false;

  const provided = Buffer.from(headerValue.trim(), "base64");
  // `Buffer.from` silently drops invalid base64 rather than throwing, so the
  // length check doubles as the malformed-input guard.
  if (provided.length !== DIGEST_BYTES) return false;

  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : Buffer.from(rawBody);
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(expected, provided);
}

/** What a topic means for the cache. `known: false` marks a no-op topic. */
export type RevalidationPlan = {
  /** Normalised topic, e.g. `products/update`. */
  topic: string;
  /** Cache tags to revalidate, deduplicated and stable in order. */
  tags: string[];
  /** Handle found in the payload, when the topic carries one. */
  handle: string | null;
  /** False when the topic is not one we map; the route answers 200 and no-ops. */
  known: boolean;
};

const PRODUCT_TOPICS = new Set(["products/create", "products/update", "products/delete"]);
const COLLECTION_TOPICS = new Set([
  "collections/create",
  "collections/update",
  "collections/delete",
]);
const INVENTORY_TOPICS = new Set(["inventory_levels/update", "inventory_items/update"]);

/** Pull a non-empty `handle` string out of an unknown JSON payload. */
function readHandle(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const handle = (payload as Record<string, unknown>).handle;
  if (typeof handle !== "string") return null;
  const trimmed = handle.trim();
  return trimmed.length > 0 && trimmed.length <= 200 ? trimmed : null;
}

/**
 * Map an `X-Shopify-Topic` plus its payload onto the cache tags to revalidate.
 *
 * Delete topics usually arrive with only an id, so the fine-grained tag is
 * skipped and the coarse tag alone does the work.
 */
export function topicToTags(topic: string, payload: unknown): RevalidationPlan {
  const normalised = (topic ?? "").trim().toLowerCase();
  const handle = readHandle(payload);

  if (PRODUCT_TOPICS.has(normalised)) {
    const tags: string[] = [CACHE_TAGS.products];
    if (handle) tags.push(CACHE_TAGS.product(handle));
    return { topic: normalised, tags, handle, known: true };
  }

  if (COLLECTION_TOPICS.has(normalised)) {
    const tags: string[] = [CACHE_TAGS.collections];
    if (handle) tags.push(CACHE_TAGS.collection(handle));
    return { topic: normalised, tags, handle, known: true };
  }

  if (INVENTORY_TOPICS.has(normalised)) {
    // Availability is rendered on product pages and listings, so an inventory
    // change has to drop the product caches as well as the inventory tag.
    return {
      topic: normalised,
      tags: [CACHE_TAGS.inventory, CACHE_TAGS.products],
      handle: null,
      known: true,
    };
  }

  return { topic: normalised, tags: [], handle, known: false };
}

// ------------------------------------------------------------------ settling
//
// Shopify fires the webhook the moment the admin write commits, but the
// Storefront API (and its edge cache) can lag that write by a few seconds. If
// the cache is expired while Shopify is still behind, the next visitor's
// refetch stores the OLD data again, and it then sits there for the full
// CATALOG_REVALIDATE_SECONDS window — observed in production as "the edit
// never showed up". So before expiring the tags, the route probes the Storefront
// API until it reports an `updatedAt` at or after the webhook's `updated_at`
// (or, for a delete, until the resource is gone). The helpers below decide
// *what* to probe and *when* it is caught up; the route owns the polling.

/** What the route has to observe on the Storefront API before it may expire the cache. */
export type ConsistencyProbe =
  | {
      kind: "product" | "collection";
      handle: string;
      /** The webhook's `updated_at`, ISO 8601, when the payload carried one. */
      updatedAt: string | null;
      /** True for delete topics: caught up once the Storefront API returns null. */
      deleted: boolean;
    }
  | {
      /** Nothing addressable to probe (inventory topics, payloads without a handle). */
      kind: "delay";
    };

/** Pull an ISO-8601 `updated_at` out of an unknown JSON payload. */
function readUpdatedAt(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = (payload as Record<string, unknown>).updated_at;
  if (typeof value !== "string") return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

/** Decide how the route should wait for Shopify to catch up with this event. */
export function consistencyProbe(plan: RevalidationPlan, payload: unknown): ConsistencyProbe {
  if (!plan.known || !plan.handle) return { kind: "delay" };
  const [resource, verb] = plan.topic.split("/");
  if (resource !== "products" && resource !== "collections") return { kind: "delay" };
  return {
    kind: resource === "products" ? "product" : "collection",
    handle: plan.handle,
    updatedAt: readUpdatedAt(payload),
    deleted: verb === "delete",
  };
}

/** What one Storefront API probe saw. `exists` false means the query returned null. */
export type ProbeObservation = { exists: boolean; updatedAt: string | null };

/**
 * True once the Storefront API reflects the webhook's write.
 *
 * - delete: the resource must be gone.
 * - create/update with a payload timestamp: the resource must exist and its
 *   `updatedAt` must be at or after the webhook's `updated_at`.
 * - create/update without a timestamp: existence is the best signal available.
 */
export function isCaughtUp(probe: ConsistencyProbe, observed: ProbeObservation): boolean {
  if (probe.kind === "delay") return true;
  if (probe.deleted) return !observed.exists;
  if (!observed.exists) return false;
  if (!probe.updatedAt) return true;
  if (!observed.updatedAt) return false;
  const seen = Date.parse(observed.updatedAt);
  const wanted = Date.parse(probe.updatedAt);
  if (!Number.isFinite(seen) || !Number.isFinite(wanted)) return false;
  return seen >= wanted;
}

/** Every topic this receiver acts on. Kept in sync with scripts/webhooks/register_webhooks.py. */
export const HANDLED_TOPICS: readonly string[] = [
  ...PRODUCT_TOPICS,
  ...COLLECTION_TOPICS,
  ...INVENTORY_TOPICS,
];
