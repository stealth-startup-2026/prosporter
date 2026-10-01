# Handoff: News & Events launch (for Kevin)

Prepared by Violet (purpl), 1 Oct 2026. Branch `feat/news-events`, PR #1. Everything on our side is done; what's left needs the Shopify admin login and your review.

## What Mladen asked for

WhatsApp, 1 Oct 2026, with 4 photos:

> "As per the conversation can we have the part on ProSporter website for the Events where we can publish the news, photos, events As ProSporter will have tournaments, and Tours."
>
> "This one is the VAL Elite Amateur League in Xiamen October 2026. Volleyball Club Sydney United supported by ProSporter."

## What's built (this branch)

- **News & Events section** at `/blog` ("News" in the top nav, "News & Events" in the mobile menu and footer). Old WordPress `/blog` links keep working.
- **Source:** the Shopify blog with handle **`news`** (`DEFAULT_BLOG_HANDLE`), via the existing Storefront API code. No new CMS: staff post in Shopify admin.
- **Categories from article tags:** `News`, `Tournaments`, `Tours`, `Events`, with filter chips. Only posts carrying one of these tags are listed, which keeps the 15 old WordPress filler posts off the page (their URLs still resolve).
- **Post page:** cover image, body, photo grid with a full-screen viewer, optional YouTube or Vimeo embed (allowed in the CSP in its own commit `a7c0998`, easy to drop).
- **Cache:** articles revalidate every 5 minutes (no publish webhook).
- **Mock data:** without Shopify keys, `mock-data/articles.json` serves the Xiamen post so the section previews locally.
- **Checks:** lint, typecheck, 143 unit tests and build pass. Playwright (chromium) at 390 and 1280 clean.

## Assets

- **Xiamen photos (web-sized, ready to upload to Shopify):** `public/news/xiamen-val-elite-championship-2026/`
  - `01-team-at-the-championship-backdrop.jpg`: the cover
  - `02-warm-up-on-court.jpg`, `03-player-in-prosporter-kit.jpg`, `04-arena-banner.jpg`: the gallery. The banner photo was mirrored in the original (taken from behind the banner) and has been flipped so the text reads correctly.
- **Full-size originals:** on Violet's laptop, `~/Documents/Provolley-assets/prosporter/news/2026-10 Xiamen VAL Elite/`. Ask if you want them.
- **Post copy, ready to paste:** [`2026-10-xiamen-val-elite.md`](./2026-10-xiamen-val-elite.md). It has no scores, results or quotes on purpose.
- **Publishing guide for staff:** [`README.md`](./README.md).

## To finish (in order)

1. **Review PR #1.**
2. **CI:** the GitHub check fails only at `npm audit`, and it fails the same way on `main` (critical advisory in `next` 16.3.5's `next/og`, which the site doesn't use; high in `brace-expansion`). Fix it in a separate PR first (`npm audit fix`, or bump `next` to the patched release), then rebase this branch.
3. **Shopify admin:** check a blog with handle `news` exists (Online Store → Blog posts → Manage blogs). Create it if not.
4. **Mladen to confirm** the club name ("Volleyball Club Sydney United") and that the players are fine with the photos online.
5. **Publish the Xiamen post** in Shopify from `2026-10-xiamen-val-elite.md`: blog `news`, tags `Tournaments` and `Tours`, cover = photo 01, gallery = 02, 03, 04. Do this right at merge, or the live page shows "No news yet".
6. **Merge PR #1**, then check prosporter.com.au/blog and the post on a phone and a laptop.
7. **Tell Mladen** it's live and how to post the next one (point him at `docs/news/README.md`).

## Decisions for you

- Keep the YouTube/Vimeo CSP change (`a7c0998`) or drop it.
- The 5-minute article cache: fine, or add a Shopify webhook later for instant updates.
- The old WordPress posts stay in the store and sitemap (hiding them would 404 their old redirects).
- Desktop nav spacing was tightened below 1280px so "News" fits; `main` already wrapped below about 1148px.

## Rules

- Vercel: only the **stealthstartup2026** account (one shared seat). A preview that redirects to `vercel.com/sso-api` is the login wall; sign in as stealthstartup.
- Don't publish anything in Shopify or merge without checking with Kevin/Violet first.

## Kick-off prompt for Claude

From the repo root:

```bash
git fetch origin && git checkout feat/news-events && git pull
claude "Read docs/news/HANDOFF.md and help me finish the ProSporter News & Events launch. Work through 'To finish' in order, starting with the npm audit fix as its own PR. Ask me before you publish anything in Shopify or merge any PR."
```
