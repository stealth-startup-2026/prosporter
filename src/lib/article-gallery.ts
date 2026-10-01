/**
 * Photo gallery for News posts (`/blog/[slug]`).
 *
 * Staff add photos to a post in Shopify admin with the editor's "Insert image"
 * button; there is no separate gallery field to learn. This module turns the
 * images in an article body into something that reads as a gallery:
 *
 *   - two or more photos in a row (each on its own line, nothing but line
 *     breaks between them) become one grid, `.article-gallery` in `globals.css`;
 *   - a photo on its own stays where it was put, full column width;
 *   - every photo becomes a button that opens the full-screen viewer
 *     (`src/components/news/PhotoLightbox.tsx`), which steps through every photo
 *     in the post, cover first;
 *   - a photo the editor linked somewhere (`<a><img></a>`) keeps its link and is
 *     left out of the viewer, because a control cannot sit inside a link.
 *
 * It runs on HTML that `sanitizeContentHtml` (`content-html.ts`) has already
 * cleaned, so every `<img>` arrives as `<img src="…" alt="…" width="…" height="…" />`
 * with double-quoted, entity-escaped values and nothing else; the patterns below
 * rely on that shape. The classes it adds are ours, applied after sanitising.
 *
 * Pure module: no `server-only`, no env. Covered by
 * `src/lib/__tests__/article-gallery.test.mjs`.
 */

export type GalleryImage = {
  /** Full-size URL for the viewer. */
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
};

/** Widths requested from Shopify's image CDN, in CSS px x2 for dense screens. */
export const PHOTO_WIDTH = {
  /** A grid tile: at most a third of the 760 px column. */
  tile: 800,
  /** A photo on its own, full column width. */
  single: 1600,
  /** The full-screen viewer. */
  full: 2048,
} as const;

/**
 * Shopify's CDN resizes on the fly with a `width` query parameter (the same
 * transform `Image.url(transform:)` emits), so a 6 MB phone photo is never sent
 * to a phone. Any other URL — the local mock photos under `public/news/` — is
 * returned unchanged.
 */
export function sizedImageUrl(src: string, width: number): string {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return src;
  }
  if (url.hostname !== "cdn.shopify.com") return src;
  url.searchParams.set("width", String(width));
  return url.toString();
}

const IMG = /<img\b[^>]*\/>/g;
/** Nothing but whitespace and line breaks. */
const GAP = /^(?:\s|<br \/>)*$/;
const LINKED_IMAGES = /<a\b[^>]*>(?:\s|<br \/>)*(?:<img\b[^>]*\/>(?:\s|<br \/>)*)+<\/a>/g;

/** Private-use code points as placeholders; never present in editorial copy. */
const LINK_MARK = "\uE001";
const PHOTO_MARK = "\uE002";
const PHOTO = new RegExp(`${PHOTO_MARK}(\\d+)${PHOTO_MARK}`, "g");
/** A `<p>`, `<div>` or `<figure>` holding nothing but photos and line breaks. */
const PHOTO_BLOCK = new RegExp(
  `<(p|div|figure)>(?:\\s|<br \\/>)*(?:${PHOTO_MARK}\\d+${PHOTO_MARK}(?:\\s|<br \\/>)*)+<\\/\\1>`,
  "g",
);

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
}

function decodeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function dimension(tag: string, name: string): number | null {
  const n = Number.parseInt(attr(tag, name) ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The article body, ready for `dangerouslySetInnerHTML`, plus the photos in the
 * order the viewer shows them. `startIndex` is how many photos come before the
 * body in the viewer (1 when the post has a cover image).
 */
export function buildArticleGallery(
  html: string,
  { startIndex = 0 }: { startIndex?: number } = {},
): { html: string; images: GalleryImage[] } {
  if (!html) return { html: "", images: [] };

  // 1. Linked images keep their link and stay out of the viewer.
  const linked: string[] = [];
  let out = html.replace(LINKED_IMAGES, (match) => {
    linked.push(match);
    return `${LINK_MARK}${linked.length - 1}${LINK_MARK}`;
  });

  // 2. Every remaining image, in document order, becomes a numbered photo.
  const tags: string[] = [];
  out = out.replace(IMG, (tag) => {
    tags.push(tag);
    return `${PHOTO_MARK}${tags.length - 1}${PHOTO_MARK}`;
  });

  // 3. Runs of image-only blocks become one grid when they hold two or more.
  const blocks = [...out.matchAll(PHOTO_BLOCK)];
  const runs: { start: number; end: number; photos: number[] }[] = [];
  for (const m of blocks) {
    const start = m.index;
    const end = start + m[0].length;
    const photos = [...m[0].matchAll(PHOTO)].map((p) => Number(p[1]));
    const last = runs[runs.length - 1];
    if (last && GAP.test(out.slice(last.end, start))) {
      last.end = end;
      last.photos.push(...photos);
    } else {
      runs.push({ start, end, photos });
    }
  }
  for (const run of runs.reverse()) {
    if (run.photos.length < 2) continue;
    const grid = run.photos.map((i) => `${PHOTO_MARK}${i}${PHOTO_MARK}`).join("");
    out = `${out.slice(0, run.start)}<div class="article-gallery">${grid}</div>${out.slice(run.end)}`;
  }
  const inGrid = new Set(runs.filter((r) => r.photos.length >= 2).flatMap((r) => r.photos));

  // 4. Render each photo as a viewer button around a lazy, CDN-sized image.
  const count = startIndex + tags.length;
  const images: GalleryImage[] = tags.map((tag) => {
    const src = decodeAttr(attr(tag, "src") ?? "");
    return {
      src: sizedImageUrl(src, PHOTO_WIDTH.full),
      alt: decodeAttr(attr(tag, "alt") ?? ""),
      width: dimension(tag, "width"),
      height: dimension(tag, "height"),
    };
  });
  out = out.replace(PHOTO, (_m, n: string) => {
    const i = Number(n);
    const tag = tags[i];
    const image = images[i];
    const position = startIndex + i;
    const display = sizedImageUrl(decodeAttr(attr(tag, "src") ?? ""), inGrid.has(i) ? PHOTO_WIDTH.tile : PHOTO_WIDTH.single);
    const size =
      image.width && image.height ? ` width="${image.width}" height="${image.height}"` : "";
    const label = image.alt
      ? `View photo ${position + 1} of ${count}: ${image.alt}`
      : `View photo ${position + 1} of ${count}`;
    return (
      `<button type="button" class="article-photo" data-gallery-index="${position}" aria-label="${escapeAttr(label)}">` +
      `<img src="${escapeAttr(display)}" alt="${escapeAttr(image.alt)}"${size} loading="lazy" decoding="async" />` +
      `</button>`
    );
  });

  // 5. Put the linked images back untouched.
  out = out.replace(new RegExp(`${LINK_MARK}(\\d+)${LINK_MARK}`, "g"), (_m, n: string) => linked[Number(n)]);

  return { html: out, images };
}
