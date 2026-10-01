import "server-only";

/**
 * Content source selection (CLNT-171), the editorial twin of `catalog-source.ts`.
 *
 * Routes import this module and nothing else for page and article data. When
 * the Shopify environment variables are present every read goes to the
 * Storefront API through `src/lib/shopify/content.ts` (force-cache + cache
 * tags). When they are not — CI builds with `SHOPIFY_OPTIONAL=1`, or a fresh
 * clone with no `.env.local` — the legacy paths still resolve, but render a
 * short "content unavailable" notice instead of copy we would have to invent.
 * The one exception is News: `mock-data/articles.json` holds the real first
 * post (client-supplied facts and photos) so the section can be previewed.
 *
 * Nothing here calls `shopifyFetch` directly.
 */
import mockArticlesJson from "../../mock-data/articles.json";
import redirectsJson from "../../docs/redirects/redirects.json";
import { buildArticleGallery, sizedImageUrl, PHOTO_WIDTH, type GalleryImage } from "./article-gallery";
import { dropLeadingTitle, htmlToText, sanitizeContentHtml } from "./content-html";
import { log, errorFields } from "./log";
import { categoriesFromTags, type NewsCategory } from "./news";
import {
  DEFAULT_BLOG_HANDLE,
  getAllArticleHandles,
  getAllPageHandles,
  getArticle,
  getBlogArticles,
  getPage,
  isDuplicateHandle,
  type ArticleCard,
  type ContentArticle,
} from "./shopify/content";
import { isShopifyConfigured } from "./shopify";
import type { SitemapEntry } from "./site.ts";

export type ContentSource = "shopify" | "mock";

export function contentSource(): ContentSource {
  return isShopifyConfigured() ? "shopify" : "mock";
}

export { DEFAULT_BLOG_HANDLE };

/**
 * Static segments that own their path. A Shopify page with one of these handles
 * (`blog`, `shop`, ... — the migration loaded a "Blog" and a "Shop" page) can
 * never be reached through `/[handle]`, because Next.js always prefers the
 * static route, so prerendering it would only produce a dead output.
 */
const RESERVED_HANDLES = new Set(["blog", "shop", "product", "search", "cart", "api", "home"]);

/**
 * Legacy WordPress paths that `docs/redirects/redirect-map.csv` preserves as
 * `same_url` 200s rather than redirects, so they never appear in
 * `redirects.json`. They are the handles this route must resolve, and the set
 * the mock fallback prerenders when Shopify is unconfigured.
 */
export const LEGACY_PAGE_HANDLES = [
  "about",
  "contact",
  "faq",
  "privacy-policy",
  "refund-policy",
  "size-guide",
  "terms-of-service",
] as const;

/**
 * The one page that gets an interactive component alongside its migrated copy:
 * the contact form (`src/components/content/ContactSection.tsx`), replacing the
 * Contact Form 7 block that `content-html.ts` strips. See `docs/forms.md`.
 */
export const CONTACT_PAGE_HANDLE = "contact";

/**
 * Local preview posts for mock mode (`mock-data/articles.json`), in the
 * Storefront `Article` shape so they go through exactly the mapping a Shopify
 * post does. Today that is the first real News post, the Xiamen trip, with its
 * photos under `public/news/`; the copy is the same as the ready-to-paste
 * version in `docs/news/2026-10-xiamen-val-elite.md`. Never read in Shopify mode.
 */
const MOCK_ARTICLES = mockArticlesJson as ContentArticle[];

/** Blog slugs the legacy redirect map points at, read straight from the map. */
export const LEGACY_ARTICLE_SLUGS: string[] = Array.from(
  new Set(
    (redirectsJson as { destination: string }[])
      .map((rule) => rule.destination)
      .filter((destination) => destination.startsWith("/blog/"))
      .map((destination) => destination.slice("/blog/".length))
      .filter((slug) => slug !== "" && !slug.includes("/")),
  ),
).sort();

// ---------------------------------------------------------------- view model

export type ContentPageView = {
  handle: string;
  title: string;
  /** Sanitised HTML, ready for `dangerouslySetInnerHTML`. Empty when unavailable. */
  html: string;
  description: string | null;
  seoTitle: string | null;
  /** True when Shopify is unconfigured and only the shell can be rendered. */
  unavailable: boolean;
};

export type ArticleImage = {
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
};

export type ArticleView = {
  handle: string;
  title: string;
  /** Sanitised body with the photo gallery applied (`article-gallery.ts`). */
  html: string;
  excerpt: string | null;
  publishedAt: string | null;
  author: string | null;
  /** The cover: Shopify's featured image, sized for the article column. */
  image: ArticleImage | null;
  /** Every photo the viewer steps through: the cover first, then the body's. */
  photos: GalleryImage[];
  /** News categories from the post's tags; empty for an unlisted post. */
  categories: NewsCategory[];
  description: string | null;
  seoTitle: string | null;
  unavailable: boolean;
};

export type ArticleListItem = {
  handle: string;
  title: string;
  excerpt: string | null;
  publishedAt: string | null;
  image: ArticleImage | null;
  categories: NewsCategory[];
};

function titleFromHandle(handle: string): string {
  return handle
    .split("-")
    .map((word) => (word.length > 3 ? word[0].toUpperCase() + word.slice(1) : word.toUpperCase()))
    .join(" ");
}

function unavailablePage(handle: string): ContentPageView {
  return {
    handle,
    title: titleFromHandle(handle),
    html: "",
    description: null,
    seoTitle: null,
    unavailable: true,
  };
}

function articleImage(article: ArticleCard, width: number): ArticleImage | null {
  if (!article.image) return null;
  return {
    url: sizedImageUrl(article.image.url, width),
    alt: article.image.altText,
    width: article.image.width,
    height: article.image.height,
  };
}

function cardToListItem(article: ArticleCard): ArticleListItem {
  return {
    handle: article.handle,
    title: article.title,
    excerpt: article.excerpt?.trim() || null,
    publishedAt: article.publishedAt,
    image: articleImage(article, PHOTO_WIDTH.tile),
    categories: categoriesFromTags(article.tags),
  };
}

function articleToView(article: ContentArticle): ArticleView {
  const sanitised = sanitizeContentHtml(article.contentHtml, { videos: true });
  const cover: GalleryImage[] = article.image
    ? [
        {
          src: sizedImageUrl(article.image.url, PHOTO_WIDTH.full),
          alt: article.image.altText ?? "",
          width: article.image.width,
          height: article.image.height,
        },
      ]
    : [];
  const body = buildArticleGallery(sanitised, { startIndex: cover.length });
  const excerpt = article.excerpt?.trim() || null;
  return {
    handle: article.handle,
    title: article.title,
    html: body.html,
    excerpt,
    publishedAt: article.publishedAt,
    author: article.authorV2?.name?.trim() || null,
    image: articleImage(article, PHOTO_WIDTH.single),
    photos: [...cover, ...body.images],
    categories: categoriesFromTags(article.tags),
    description: article.seo?.description?.trim() || excerpt || htmlToText(sanitised, 200) || null,
    seoTitle: article.seo?.title?.trim() || null,
    unavailable: false,
  };
}

// --------------------------------------------------------------------- pages

/** Null when no such page exists; the route turns that into a 404. */
export async function getContentPage(handle: string): Promise<ContentPageView | null> {
  if (RESERVED_HANDLES.has(handle)) return null;

  if (contentSource() === "mock") {
    return (LEGACY_PAGE_HANDLES as readonly string[]).includes(handle)
      ? unavailablePage(handle)
      : null;
  }

  const page = await getPage(handle);
  if (!page) return null;

  const html = dropLeadingTitle(sanitizeContentHtml(page.body), page.title);
  return {
    handle: page.handle,
    title: page.title,
    html,
    description: page.seo?.description?.trim() || page.bodySummary?.trim() || htmlToText(html, 200) || null,
    seoTitle: page.seo?.title?.trim() || null,
    unavailable: false,
  };
}

/**
 * Handles to prerender. In mock mode that is the preserved legacy set, so those
 * paths still answer 200. Empty (not a thrown error) when the Storefront API is
 * unreachable, so a build never fails on content availability.
 */
export async function getContentPageHandles(): Promise<string[]> {
  if (contentSource() === "mock") return [...LEGACY_PAGE_HANDLES];
  try {
    return (await getAllPageHandles())
      .map((p) => p.handle)
      .filter((handle) => !RESERVED_HANDLES.has(handle));
  } catch (err) {
    log.warn("content.static_params_failed", { route: "page", ...errorFields(err) });
    return [];
  }
}

// ------------------------------------------------------------------ articles

/**
 * The News listing: posts filed under at least one News category tag, newest
 * first. Untagged posts (the 15 migrated WordPress posts) are left out but keep
 * resolving at `/blog/<handle>`; see `src/lib/news.ts`. Empty when the
 * Storefront API is unreachable. Mock mode lists `mock-data/articles.json`.
 */
export async function getArticleList(first = 100): Promise<ArticleListItem[]> {
  const listed = (items: ArticleListItem[]) => items.filter((item) => item.categories.length > 0);
  if (contentSource() === "mock") {
    return listed(
      [...MOCK_ARTICLES]
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        .map(cardToListItem),
    );
  }
  try {
    return listed((await getBlogArticles(DEFAULT_BLOG_HANDLE, first)).map(cardToListItem));
  } catch (err) {
    log.warn("content.article_list_failed", { blog: DEFAULT_BLOG_HANDLE, ...errorFields(err) });
    return [];
  }
}

export async function getArticleView(slug: string): Promise<ArticleView | null> {
  if (contentSource() === "mock") {
    const mock = MOCK_ARTICLES.find((a) => a.handle === slug);
    if (mock) return articleToView(mock);
    if (!LEGACY_ARTICLE_SLUGS.includes(slug)) return null;
    return {
      handle: slug,
      title: titleFromHandle(slug),
      html: "",
      excerpt: null,
      publishedAt: null,
      author: null,
      image: null,
      photos: [],
      categories: [],
      description: null,
      seoTitle: null,
      unavailable: true,
    };
  }

  const article = await getArticle(DEFAULT_BLOG_HANDLE, slug);
  return article ? articleToView(article) : null;
}

/** Slugs to prerender for `/blog/[slug]`; the legacy set plus the preview posts in mock mode. */
export async function getArticleSlugs(): Promise<string[]> {
  if (contentSource() === "mock") {
    return [...MOCK_ARTICLES.map((a) => a.handle), ...LEGACY_ARTICLE_SLUGS];
  }
  try {
    return (await getAllArticleHandles(DEFAULT_BLOG_HANDLE))
      .map((a) => a.handle)
      .filter((handle) => !isDuplicateHandle(handle));
  } catch (err) {
    log.warn("content.static_params_failed", { route: "blog", ...errorFields(err) });
    return [];
  }
}

/** Long-form date for article bylines and listings. */
export function formatArticleDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(date);
}

// ----------------------------------------------------------------- sitemap

/**
 * Content URLs for `src/app/sitemap.ts`, with Shopify's `updatedAt` /
 * `publishedAt` as `lastmod`. Empty in mock mode and on a Storefront failure,
 * for the same reasons as the catalog entries in `catalog-source.ts`.
 *
 * Reserved handles are dropped (they can never be reached through `/[handle]`)
 * and so are the `-2` duplicates left by the WooCommerce export, which would
 * otherwise advertise two URLs for one piece of content.
 */
export async function getContentPageSitemapEntries(): Promise<SitemapEntry[]> {
  if (contentSource() === "mock") return [];
  try {
    return (await getAllPageHandles())
      .filter((p) => !RESERVED_HANDLES.has(p.handle) && !isDuplicateHandle(p.handle))
      .map((p) => ({ path: `/${p.handle}`, lastModified: p.updatedAt || null }));
  } catch (err) {
    log.warn("content.sitemap_failed", { route: "page", ...errorFields(err) });
    return [];
  }
}

export async function getArticleSitemapEntries(): Promise<SitemapEntry[]> {
  if (contentSource() === "mock") return [];
  try {
    return (await getAllArticleHandles(DEFAULT_BLOG_HANDLE))
      .filter((a) => !isDuplicateHandle(a.handle))
      .map((a) => ({ path: `/blog/${a.handle}`, lastModified: a.publishedAt || null }));
  } catch (err) {
    log.warn("content.sitemap_failed", { route: "blog", ...errorFields(err) });
    return [];
  }
}
