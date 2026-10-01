/**
 * News categories for `/blog` (the "News" section).
 *
 * Staff publish posts in Shopify admin (Online Store > Blog posts, blog "News")
 * and file them with article **tags**. Four tags are categories:
 *
 *   News · Tournaments · Tours · Events
 *
 * A post can carry more than one (a tournament abroad is both Tournaments and
 * Tours). Matching ignores case, surrounding spaces and a missing plural, so
 * "tournament" and " Tournaments" land in the same place. Any other tag is
 * ignored here.
 *
 * A post with none of the four is not listed on `/blog`. That keeps the 15 posts
 * migrated from WordPress (template beauty posts and "sport merchant" filler,
 * tagged `gel`, `polish`, `waxes` and so on) off the News page without touching
 * the store, while their URLs keep answering 200 for the legacy redirects in
 * `docs/redirects/redirects.json`. Adding a category tag in Shopify lists a post;
 * removing every category tag unlists it. `docs/news/README.md` is the staff guide.
 *
 * Pure module: no `server-only`, no env, no imports. It is shared by the data
 * layer, the client-side filter and `src/lib/__tests__/news.test.mjs`.
 */

export const NEWS_CATEGORIES = [
  { id: "news", label: "News" },
  { id: "tournaments", label: "Tournaments" },
  { id: "tours", label: "Tours" },
  { id: "events", label: "Events" },
] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];
export type NewsCategoryId = NewsCategory["id"];

/** Tag spellings accepted for each category, all lower-case. */
const TAG_ALIASES: Record<string, NewsCategoryId> = {
  news: "news",
  tournament: "tournaments",
  tournaments: "tournaments",
  tour: "tours",
  tours: "tours",
  event: "events",
  events: "events",
};

export function isNewsCategoryId(value: unknown): value is NewsCategoryId {
  return typeof value === "string" && NEWS_CATEGORIES.some((c) => c.id === value);
}

/** The categories a post's tags name, in the fixed order above, without repeats. */
export function categoriesFromTags(tags: readonly string[] | null | undefined): NewsCategory[] {
  const ids = new Set<NewsCategoryId>();
  for (const tag of tags ?? []) {
    const id = TAG_ALIASES[tag.trim().toLowerCase()];
    if (id) ids.add(id);
  }
  return NEWS_CATEGORIES.filter((c) => ids.has(c.id));
}

/** Path of the News listing filtered to one category. */
export function newsCategoryHref(id: NewsCategoryId): string {
  return `/blog?category=${id}`;
}
