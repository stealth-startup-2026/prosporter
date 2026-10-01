/**
 * News post photo gallery (`src/lib/article-gallery.ts`). `npm test`.
 * Inputs are in the shape `sanitizeContentHtml` emits.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildArticleGallery, sizedImageUrl } from "../article-gallery.ts";
import { sanitizeContentHtml } from "../content-html.ts";

const CDN = "https://cdn.shopify.com/s/files/1/0001/files";
const img = (name, alt = "") => `<img src="${CDN}/${name}.jpg?v=1" alt="${alt}" width="1536" height="2048" />`;

test("sizes Shopify CDN images and leaves other URLs alone", () => {
  assert.equal(sizedImageUrl(`${CDN}/a.jpg?v=1`, 800), `${CDN}/a.jpg?v=1&width=800`);
  assert.equal(sizedImageUrl("/news/a.jpg", 800), "/news/a.jpg");
  assert.equal(sizedImageUrl("https://example.com/a.jpg", 800), "https://example.com/a.jpg");
});

test("photos on consecutive lines become one grid", () => {
  const { html, images } = buildArticleGallery(`<p>Story.</p><p>${img("a")}</p>\n<p>${img("b")}</p><div>${img("c")}<br /></div>`);
  assert.equal(images.length, 3);
  assert.equal((html.match(/class="article-gallery"/g) ?? []).length, 1);
  assert.match(html, /^<p>Story\.<\/p><div class="article-gallery">(<button [^>]*><img [^>]*\/><\/button>){3}<\/div>$/);
  assert.match(html, /a\.jpg\?v=1&amp;width=800/);
});

test("a photo on its own stays in place at full width", () => {
  const { html } = buildArticleGallery(`<p>One.</p><p>${img("a")}</p><p>Two.</p><p>${img("b")}</p>`);
  assert.doesNotMatch(html, /article-gallery/);
  assert.match(html, /^<p>One\.<\/p><p><button[^>]*><img[^>]*width=1600[^>]*\/><\/button><\/p><p>Two\.<\/p>/);
});

test("two images in one paragraph are a grid too", () => {
  const { html } = buildArticleGallery(`<p>${img("a")}${img("b")}</p>`);
  assert.match(html, /^<div class="article-gallery">/);
});

test("numbers photos after the cover and labels them for screen readers", () => {
  const { html, images } = buildArticleGallery(`<p>${img("a", "Warm-up")}</p><p>${img("b")}</p>`, { startIndex: 1 });
  assert.match(html, /data-gallery-index="1" aria-label="View photo 2 of 3: Warm-up"/);
  assert.match(html, /data-gallery-index="2" aria-label="View photo 3 of 3"/);
  assert.deepEqual(images[0], { src: `${CDN}/a.jpg?v=1&width=2048`, alt: "Warm-up", width: 1536, height: 2048 });
});

test("adds lazy loading and keeps intrinsic size to avoid layout shift", () => {
  const { html } = buildArticleGallery(`<p>${img("a")}</p>`);
  assert.match(html, /width="1536" height="2048" loading="lazy" decoding="async"/);
});

test("a linked photo keeps its link and stays out of the viewer", () => {
  const linked = `<p><a href="/shop">${img("a")}</a></p>`;
  const { html, images } = buildArticleGallery(`${linked}<p>${img("b")}</p>`);
  assert.equal(images.length, 1);
  assert.ok(html.startsWith(linked));
  assert.match(html, /data-gallery-index="0"/);
});

test("an inline image inside text is wrapped in place, not moved", () => {
  const { html } = buildArticleGallery(`<p>Before ${img("a")} after</p>`);
  assert.match(html, /^<p>Before <button[^>]*><img[^>]*\/><\/button> after<\/p>$/);
});

test("works on real sanitiser output from the Shopify editor", () => {
  const body = sanitizeContentHtml(
    `<p>Story.</p><p><img src="${CDN}/a.jpg?v=1" alt="" style="float:none"></p><p><img src="${CDN}/b.jpg?v=1" alt="Team &amp; coach"></p>`,
  );
  const { html, images } = buildArticleGallery(body);
  assert.equal(images[1].alt, "Team & coach");
  assert.match(html, /<div class="article-gallery">/);
  assert.match(html, /alt="Team &amp; coach"/);
});

test("empty input", () => {
  assert.deepEqual(buildArticleGallery(""), { html: "", images: [] });
});

test("placeholder characters in the input cannot crash the render", () => {
  for (const mark of ["", "", ""]) {
    const { html, images } = buildArticleGallery(`<p>a${mark}5${mark}b</p>${img("x")}`);
    assert.match(html, /^<p>a5b<\/p><button/);
    assert.equal(images.length, 1);
  }
});
