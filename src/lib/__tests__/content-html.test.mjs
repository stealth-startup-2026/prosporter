/**
 * Unit tests for the migrated-page clean-up in `content-html.ts`.
 *
 * Plain Node, zero dependencies: `npm test`. Requires Node >= 22.18, which
 * strips the TypeScript types from the imported module without a build step.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { dropLeadingTitle, sanitizeContentHtml } from "../content-html.ts";

const FOOTER = `
  <div class="elementor-element"><img src="https://cdn.shopify.com/s/files/1/Prosporter-Logo_Colour-1024x154.png" alt="" />
  <h6><a href="https://prosporter.com.au/terms-of-service/">TERMS &amp; SERVICES</a></h6>
  <h6 class="elementor-heading-title">PROSPORTER.COM.AU  |  © Copyright 2024</h6></div>`;

test("strips the legacy Elementor footer and keeps the body", () => {
  const html = sanitizeContentHtml(`<div><h4>Refund Process</h4><p>Contact us.</p></div>${FOOTER}`);
  assert.match(html, /Refund Process/);
  assert.doesNotMatch(html, /Copyright 2024|TERMS|<img/);
});

test("keeps a logo that is not followed by the copyright line", () => {
  const html = sanitizeContentHtml(`<p>Our brand</p><img src="/Prosporter-Logo_Colour.png" alt="logo" />`);
  assert.match(html, /<img/);
});

test("keeps a real Copyright section that has no footer logo", () => {
  const html = sanitizeContentHtml(`<h4>Copyright</h4><p>All design are under the copyright of prosporter.com.au.</p>`);
  assert.match(html, /All design/);
});

test("drops trailing <br /> runs inside paragraphs", () => {
  assert.equal(sanitizeContentHtml("<p>Text.<br /><br /></p>"), "<p>Text.</p>");
});

test("collapses a list that repeats one image to a single logo", () => {
  const item = `<li class="item"><img src="/CLIENT-1.png" alt="carousel image" /></li>`;
  assert.equal(
    sanitizeContentHtml(`<ul class="slides">${item.repeat(8)}</ul><p>x</p>`),
    `<figure class="logo-strip"><img src="/CLIENT-1.png" alt="carousel image" /></figure><p>x</p>`,
  );
  const gallery = `<ul><li><img src="/a.png" alt="" /></li><li><img src="/b.png" alt="" /></li></ul>`;
  assert.match(sanitizeContentHtml(gallery), /a\.png[\s\S]*b\.png/);
});

test("turns sentence-length headings into lead paragraphs, but not questions", () => {
  const intro = "Welcome to our website, your one-stop destination for high-quality sport clothing and products.";
  assert.equal(sanitizeContentHtml(`<h2>${intro}</h2>`), `<p class="lead">${intro}</p>`);
  const question = "<h5>Can I make changes to my order after it has been placed?</h5>";
  assert.equal(sanitizeContentHtml(question), question);
  assert.equal(sanitizeContentHtml("<h4>Refund Process</h4>"), "<h4>Refund Process</h4>");
});

test("drops paragraphs that only hold a non-breaking space", () => {
  assert.equal(sanitizeContentHtml("<p>a</p><p>&nbsp;</p><p> </p><p>b</p>"), "<p>a</p><p>b</p>");
});

test("drops a leading <h2> that repeats the page title", () => {
  assert.equal(dropLeadingTitle(sanitizeContentHtml("<h2>ABOUT</h2><p>Body</p>"), "About"), "<p>Body</p>");
});

test("drops a leading <h1> that repeats the page title", () => {
  const html = sanitizeContentHtml("<div><div><h1><b>Refund Policy</b></h1></div><p>Body</p></div>");
  assert.equal(dropLeadingTitle(html, "Refund Policy"), "<div><div></div><p>Body</p></div>");
  assert.equal(dropLeadingTitle("<h1>Welcome</h1><p>x</p>", "About"), "<h1>Welcome</h1><p>x</p>");
});

// ---------------------------------------------------------------- videos

const YT = `<p><iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=abc123" title="Finals day" frameborder="0" allow="accelerometer; autoplay" allowfullscreen></iframe></p>`;

test("drops every iframe by default, video players included", () => {
  assert.equal(sanitizeContentHtml(`<p>a</p>${YT}`), "<p>a</p>");
});

test("rebuilds a YouTube embed as a nocookie player when videos are on", () => {
  const html = sanitizeContentHtml(`<p>a</p>${YT}`, { videos: true });
  assert.equal(
    html,
    `<p>a</p><div class="video-embed"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="Finals day" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`,
  );
});

test("keeps an unlisted Vimeo hash and nothing else from the query", () => {
  const html = sanitizeContentHtml(
    `<iframe src="https://player.vimeo.com/video/76979871?h=8272103f6e&amp;autoplay=1" onload="x()"></iframe>`,
    { videos: true },
  );
  assert.match(html, /src="https:\/\/player\.vimeo\.com\/video\/76979871\?h=8272103f6e"/);
  assert.match(html, /title="Vimeo video"/);
  assert.doesNotMatch(html, /autoplay=1|onload/);
});

test("still drops iframes from any other origin when videos are on", () => {
  const html = sanitizeContentHtml(
    `<p>x</p><iframe src="https://evil.example/embed/dQw4w9WgXcQ"></iframe><iframe src="https://www.google.com/maps/embed?pb=1"></iframe>`,
    { videos: true },
  );
  assert.equal(html, "<p>x</p>");
});

test("escapes a hostile iframe title", () => {
  const html = sanitizeContentHtml(
    `<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title='"><script>alert(1)</script>'></iframe>`,
    { videos: true },
  );
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /title="&quot;&gt;&lt;script&gt;/);
});

test("encodes attribute entities exactly once", () => {
  assert.equal(
    sanitizeContentHtml(`<a href="/search?q=a&amp;b=1">x</a><img src="/a.jpg" alt="Team &amp; coach" />`),
    `<a href="/search?q=a&amp;b=1">x</a><img src="/a.jpg" alt="Team &amp; coach" />`,
  );
});

test("never restores a video player inside an attribute value", () => {
  const html = sanitizeContentHtml(
    `<img src="/a.jpg" alt="<iframe src='https://www.youtube.com/embed/dQw4w9WgXcQ'></iframe>" />`,
    { videos: true },
  );
  assert.doesNotMatch(html, /iframe|video-embed/);
  assert.match(html, /^<img src="\/a\.jpg" alt="[^"]*" \/>$/);
});

test("placeholder characters in the input are dropped, not treated as players", () => {
  for (const mark of ["", "", ""]) {
    const html = sanitizeContentHtml(`<p>a${mark}7${mark}b</p>`, { videos: true });
    assert.equal(html, "<p>a7b</p>");
  }
});
