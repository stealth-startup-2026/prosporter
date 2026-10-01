import Link from "next/link";
import type { Metadata } from "next";

import { formatArticleDate, getArticleList } from "@/lib/content-source";
import { NewsListing, type NewsCardData } from "@/components/news/NewsListing";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/seo/json-ld";
import { OG_DEFAULTS } from "@/lib/seo/metadata";

/**
 * News & Events (CLNT-171 blog index, relabelled for the client's news
 * section). Every legacy `/category/<slug>/` and `/tag/<slug>/` archive plus the
 * preserved `/blog` path lands here, so the route must always answer 200 —
 * including when Shopify is unconfigured or nothing is published yet, where it
 * shows the empty state.
 *
 * Posts come from the Shopify `news` blog, newest first, and only those tagged
 * News, Tournaments, Tours or Events are listed (`src/lib/news.ts`). The
 * category filter runs on the client against the full list, so the page stays
 * prerendered; `?category=` links are shareable but the canonical is `/blog`.
 * Staff guide: `docs/news/README.md`.
 */
const NEWS_TITLE = "News & Events · ProSporter";
const NEWS_DESCRIPTION =
  "Tournaments, tours, events and team news from ProSporter, volleyball teamwear built for the Australian game.";

export const metadata: Metadata = {
  title: NEWS_TITLE,
  description: NEWS_DESCRIPTION,
  alternates: { canonical: "/blog" },
  openGraph: {
    ...OG_DEFAULTS,
    type: "website",
    url: "/blog",
    title: NEWS_TITLE,
    description: NEWS_DESCRIPTION,
  },
};

export default async function NewsIndex() {
  const articles = await getArticleList();
  const items: NewsCardData[] = articles.map((article) => ({
    ...article,
    date: formatArticleDate(article.publishedAt),
  }));

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
      <JsonLd
        data={buildBreadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "News & Events", path: "/blog" },
        ])}
      />
      <p className="eyebrow text-muted">News &amp; Events</p>
      <h1 className="display mt-3 text-4xl sm:text-5xl lg:text-6xl">On court with ProSporter</h1>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
        Tournaments, tours, events and team news from the clubs and players we kit out.
      </p>

      {items.length === 0 ? (
        <div className="mt-12 rounded-card border border-line bg-surface px-6 py-14 text-center sm:px-10">
          <p className="display text-2xl sm:text-3xl">No news yet</p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
            Tournament reports, tours and event photos will appear here as they happen. Check back
            soon.
          </p>
          <Link
            href="/shop"
            className="mt-6 inline-flex rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-ink-2"
          >
            Shop all
          </Link>
        </div>
      ) : (
        <NewsListing items={items} />
      )}
    </div>
  );
}
