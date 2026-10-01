"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { NEWS_CATEGORIES, isNewsCategoryId, newsCategoryHref, type NewsCategory, type NewsCategoryId } from "@/lib/news";
import { CategoryChip } from "./CategoryChip";

/** One post on the listing. Dates are formatted on the server (`content-source.ts`). */
export type NewsCardData = {
  handle: string;
  title: string;
  excerpt: string | null;
  publishedAt: string | null;
  date: string | null;
  image: { url: string; alt: string | null; width: number | null; height: number | null } | null;
  categories: NewsCategory[];
};

/**
 * The selected category lives in the URL (`/blog?category=tours`) so a filtered
 * view can be shared, but it is read on the client: the page itself stays
 * prerendered and every post is in the server HTML. `useSyncExternalStore`
 * renders "all" on the server and during hydration, then switches to the URL's
 * category without a hydration mismatch (and without `setState` in an effect).
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

const readCategory = () => new URLSearchParams(window.location.search).get("category") ?? "all";
const serverCategory = () => "all";

function selectCategory(id: NewsCategoryId | "all"): void {
  const params = new URLSearchParams(window.location.search);
  if (id === "all") params.delete("category");
  else params.set("category", id);
  const query = params.toString();
  // Next.js keeps its router in sync with native history calls.
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  for (const listener of listeners) listener();
}

function CardMeta({ item }: { item: NewsCardData }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {item.categories.map((category) => (
        <CategoryChip key={category.id} category={category} />
      ))}
      {item.date && (
        <time dateTime={item.publishedAt ?? undefined} className="text-xs text-muted">
          {item.date}
        </time>
      )}
    </div>
  );
}

function CardImage({ item, eager, className }: { item: NewsCardData; eager?: boolean; className: string }) {
  if (!item.image) return null;
  return (
    // Shopify CDN (or `public/news/` in mock mode), already sized by
    // `sizedImageUrl`; a plain <img> matches the rest of the content routes.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.image.url}
      alt={item.image.alt ?? ""}
      width={item.image.width ?? undefined}
      height={item.image.height ?? undefined}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      decoding="async"
      className={`w-full rounded-card bg-surface object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02] ${className}`}
    />
  );
}

function LeadCard({ item }: { item: NewsCardData }) {
  return (
    <Link
      href={`/blog/${item.handle}`}
      className={`group grid gap-6 ${item.image ? "md:grid-cols-[1.15fr_1fr] md:items-center md:gap-10" : ""}`}
    >
      {item.image && (
        <div className="overflow-hidden rounded-card">
          <CardImage item={item} eager className="aspect-[4/3]" />
        </div>
      )}
      <div>
        <CardMeta item={item} />
        <h2 className="display mt-4 text-3xl transition-colors group-hover:text-green-deep sm:text-4xl">
          {item.title}
        </h2>
        {item.excerpt && <p className="mt-4 max-w-prose text-base leading-relaxed text-muted">{item.excerpt}</p>}
        <span className="mt-6 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-colors group-hover:bg-ink-2">
          Read the story
        </span>
      </div>
    </Link>
  );
}

function GridCard({ item }: { item: NewsCardData }) {
  return (
    <Link href={`/blog/${item.handle}`} className="group block">
      {item.image && (
        <div className="mb-4 overflow-hidden rounded-card">
          <CardImage item={item} className="aspect-[4/3]" />
        </div>
      )}
      <CardMeta item={item} />
      <h2 className="mt-3 text-lg font-semibold leading-snug transition-colors group-hover:text-green-deep">
        {item.title}
      </h2>
      {item.excerpt && <p className="mt-2 line-clamp-3 text-sm text-muted">{item.excerpt}</p>}
    </Link>
  );
}

/**
 * The News listing below the page heading: category filter chips, the newest
 * post as a large lead story, then the rest in a grid. Only categories that
 * have at least one post get a chip, so a filter never leads to an empty page.
 */
export function NewsListing({ items }: { items: NewsCardData[] }) {
  const requested = useSyncExternalStore(subscribe, readCategory, serverCategory);

  const available = NEWS_CATEGORIES.filter((c) =>
    items.some((item) => item.categories.some((ic) => ic.id === c.id)),
  );
  const active: NewsCategoryId | "all" =
    isNewsCategoryId(requested) && available.some((c) => c.id === requested) ? requested : "all";
  const shown =
    active === "all" ? items : items.filter((item) => item.categories.some((c) => c.id === active));
  const [lead, ...rest] = shown;

  const chips: { id: NewsCategoryId | "all"; label: string; href: string }[] = [
    { id: "all", label: "All", href: "/blog" },
    ...available.map((c) => ({ id: c.id, label: c.label, href: newsCategoryHref(c.id) })),
  ];

  return (
    <>
      <nav aria-label="Filter news by category" className="mt-8">
        <ul className="flex flex-wrap gap-2">
          {chips.map((chip) => {
            const current = chip.id === active;
            return (
              <li key={chip.id}>
                <a
                  href={chip.href}
                  aria-current={current ? "true" : undefined}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                    event.preventDefault();
                    selectCategory(chip.id);
                  }}
                  className={`inline-flex rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    current
                      ? "border-ink bg-ink text-paper"
                      : "border-line bg-paper text-ink hover:border-ink"
                  }`}
                >
                  {chip.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <p className="sr-only" aria-live="polite">
        {`Showing ${shown.length} ${shown.length === 1 ? "post" : "posts"}${
          active === "all" ? "" : ` in ${chips.find((c) => c.id === active)?.label}`
        }`}
      </p>

      {lead && (
        <div className="mt-10">
          <LeadCard item={lead} />
        </div>
      )}

      {rest.length > 0 && (
        <ul className="mt-14 grid gap-x-6 gap-y-12 border-t border-line pt-12 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((item) => (
            <li key={item.handle}>
              <GridCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
