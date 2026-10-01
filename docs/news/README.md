# News & Events: publishing a post

The storefront's **News & Events** section (`/blog`, "News" in the top menu) shows
posts from the Shopify blog called **News**. Staff write and publish them in Shopify
admin; there is no other CMS and nothing to deploy. This page is the guide for
whoever posts (Mladen, Kevin, anyone with Online Store access).

Code: `src/app/blog/` (routes), `src/lib/news.ts` (categories),
`src/lib/article-gallery.ts` (photos), `src/lib/content-html.ts` (body clean-up and
video), `src/components/news/` (listing, filter, photo viewer).

## Publish a post, step by step

1. Shopify admin → **Online Store → Blog posts → Create blog post** (the button may
   read "Add blog post").
2. **Title.** Short and specific: who, what, where. It becomes the page heading.
3. **Content.** Write the story first: a few short paragraphs.
   - Add photos with the editor's **Insert image** button. Put each photo **on its
     own line, one after another, after the text**. Two or more photos in a row show
     as a photo grid; a single photo between paragraphs shows full width. Every
     photo opens full screen when tapped, and the viewer steps through all of them.
   - Give every photo **alt text** (the image's description field). It is read out
     to screen-reader users and shown as the caption in the full-screen viewer.
   - Don't add the cover photo to the content as well; it already shows at the top.
   - Optional video: insert a **YouTube or Vimeo** video with the editor's video
     button (link or embed code). Other embeds (Instagram, Facebook, TikTok, maps)
     are removed by the site; link to them instead.
4. **Excerpt** (the "Excerpt" box, sometimes behind "Add excerpt"). One or two
   sentences. It is the summary on the News page and the description Google and
   social shares use unless the SEO description below is filled in.
5. **Image** (featured image). This is the **cover**: top of the post, the card on
   the News page and the picture when the link is shared. Add alt text here too.
   The News page crops it to 4:3, so keep the people near the middle.
6. **Organization:**
   - **Blog: News.** Posts in any other blog never appear on the site.
   - **Tags:** at least one of the four category tags below. **A post without one
     is published but not listed on the News page.**
   - **Author:** the name chosen here is printed under the title.
7. **Search engine listing** (optional). Check the URL handle reads well (it becomes
   `prosporter.com.au/blog/<handle>`) and add a meta description if the excerpt is
   not a good fit for Google.
8. **Visibility: Visible**, then **Save**. "Hidden" keeps it as a draft.

The post's own page works as soon as it is saved as visible. The **News page list
refreshes within about 5 minutes**, so a new post can take that long to appear there.

## Category tags

| Tag | Use it for |
| --- | --- |
| `News` | Company and product news, announcements |
| `Tournaments` | Tournaments the teams we support play in, results reports |
| `Tours` | Team trips and tours, at home or overseas |
| `Events` | Clinics, launches, community and club events |

- A post can have more than one (a tournament overseas is `Tournaments` + `Tours`).
- Capitals don't matter and the singular works too (`tournament`, `Tour`).
- Each tag gets a filter chip on the News page once at least one post uses it, so
  an empty category never shows.
- Any other tag is ignored by the site.

## Taking a post down

- **Unlist it:** remove all four category tags. The page still works for anyone
  with the link.
- **Remove it:** set Visibility to **Hidden**. The page stops working (404).

## Posts migrated from the old WordPress site

The News blog also holds 15 posts carried over from WordPress (2019 theme demo posts
such as "Superfood Beauty" and 2024 "sport merchant" articles). None has a category
tag, so none is listed on the News page, but their old addresses still redirect to
them (`docs/redirects/`). Hiding or deleting them in Shopify would turn those
redirects into 404s; that is a separate decision for Kevin.

## Local preview

With no Shopify environment (`SHOPIFY_OPTIONAL=1`, CI, a fresh clone) the section
reads `mock-data/articles.json`, which holds the first real post
([2026-10-xiamen-val-elite.md](./2026-10-xiamen-val-elite.md)) with web-sized
copies of its photos in `public/news/`. Delete the mock entry once the post is live
in Shopify if it is no longer useful for local work.
