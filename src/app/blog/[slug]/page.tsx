import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { formatArticleDate, getArticleSlugs, getArticleView } from "@/lib/content-source";
import { newsCategoryHref } from "@/lib/news";
import { CategoryChip } from "@/components/news/CategoryChip";
import { PhotoLightbox } from "@/components/news/PhotoLightbox";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildArticleJsonLd, buildBreadcrumbJsonLd } from "@/lib/seo/json-ld";
import { OG_DEFAULTS } from "@/lib/seo/metadata";

/**
 * News post (CLNT-171 blog article). 14 legacy post URLs 308 to `/blog/<slug>`;
 * the migrated `news` blog keeps those handles, so the redirects land on a 200,
 * listed on `/blog` or not (`src/lib/news.ts`).
 *
 * Photos: the featured image is the cover, and every image in the body becomes
 * part of a gallery (consecutive ones as a grid) that opens full screen; see
 * `src/lib/article-gallery.ts`. YouTube and Vimeo players inserted in Shopify
 * are kept (`sanitizeContentHtml(..., { videos: true })`).
 *
 * `dynamicParams` stays at its default (`true`) so an article published after
 * the last deploy resolves on demand. An unknown slug is still a hard 404: the
 * explicit `notFound()` below does that work, and it is needed regardless —
 * the root layout reads the cart cookie, so every route renders dynamically and
 * `dynamicParams: false` alone would not enforce the list.
 */
export const dynamicParams = true;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return (await getArticleSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleView(slug);
  if (!article) return { title: "Not found · ProSporter" };

  const description = article.description ?? undefined;
  return {
    title: article.seoTitle || `${article.title} · ProSporter`,
    description,
    alternates: { canonical: `/blog/${article.handle}` },
    openGraph: {
      ...OG_DEFAULTS,
      type: "article",
      url: `/blog/${article.handle}`,
      title: article.seoTitle || article.title,
      description,
      publishedTime: article.publishedAt ?? undefined,
      // An article shares with its featured image; without one it falls
      // through to the site default in OG_DEFAULTS.
      ...(article.image
        ? {
            images: [
              {
                url: article.image.url,
                ...(article.image.width && article.image.height
                  ? { width: article.image.width, height: article.image.height }
                  : {}),
                ...(article.image.alt ? { alt: article.image.alt } : {}),
              },
            ],
          }
        : {}),
    },
  };
}

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getArticleView(slug);
  if (!article) notFound();

  const date = formatArticleDate(article.publishedAt);

  /**
   * Article structured data. The byline carries the author's display name only,
   * exactly as it is rendered below — `authorV2.email` is never fetched by the
   * data layer and must never appear here. Shopify's Storefront API exposes no
   * article `updatedAt`, so `dateModified` falls back to `publishedAt`.
   */
  const articleJsonLd = buildArticleJsonLd({
    path: `/blog/${article.handle}`,
    headline: article.title,
    description: article.description,
    images: article.photos.map((photo) => photo.src),
    sections: article.categories.map((category) => category.label),
    datePublished: article.publishedAt,
    authorName: article.author,
  });

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "News & Events", path: "/blog" },
    { name: article.title, path: `/blog/${article.handle}` },
  ]);

  return (
    <article className="mx-auto max-w-[760px] px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
      <JsonLd data={[articleJsonLd, breadcrumbJsonLd]} />
      <Link href="/blog" className="eyebrow text-muted transition-colors hover:text-ink">
        ← News &amp; Events
      </Link>

      {article.categories.length > 0 && (
        <ul aria-label="Categories" className="mt-6 flex flex-wrap gap-2">
          {article.categories.map((category) => (
            <li key={category.id}>
              <CategoryChip category={category} href={newsCategoryHref(category.id)} />
            </li>
          ))}
        </ul>
      )}
      <h1 className={`display text-3xl sm:text-5xl ${article.categories.length > 0 ? "mt-4" : "mt-6"}`}>
        {article.title}
      </h1>

      <p className="mt-4 text-sm text-muted">
        {date && <time dateTime={article.publishedAt ?? undefined}>{date}</time>}
        {date && article.author && <span aria-hidden="true"> · </span>}
        {article.author}
      </p>

      {article.unavailable ? (
        <p className="mt-8 text-sm text-muted">
          This article is not available right now. Please try again shortly.
        </p>
      ) : (
        <PhotoLightbox photos={article.photos}>
          {article.image && (
            <button
              type="button"
              data-gallery-index="0"
              aria-label={
                article.image.alt
                  ? `View photo 1 of ${article.photos.length}: ${article.image.alt}`
                  : `View photo 1 of ${article.photos.length}`
              }
              className="mt-8 block w-full cursor-zoom-in overflow-hidden rounded-card"
            >
              {/* The cover is the LCP element: eager, high priority, intrinsic size set. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={article.image.url}
                alt={article.image.alt ?? ""}
                width={article.image.width ?? undefined}
                height={article.image.height ?? undefined}
                fetchPriority="high"
                className="max-h-[75vh] w-full bg-surface object-cover sm:max-h-[640px]"
              />
            </button>
          )}
          <div
            className="page-content mt-8 text-base leading-relaxed text-muted"
            // Sanitised in `src/lib/content-html.ts`, gallery markup added by
            // `src/lib/article-gallery.ts`, before it reaches the DOM.
            dangerouslySetInnerHTML={{ __html: article.html }}
          />
        </PhotoLightbox>
      )}

      <div className="mt-16 flex flex-wrap gap-3 border-t border-line pt-8">
        <Link
          href="/blog"
          className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-surface"
        >
          All news
        </Link>
        <Link
          href="/shop"
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-ink-2"
        >
          Shop all
        </Link>
      </div>
    </article>
  );
}
