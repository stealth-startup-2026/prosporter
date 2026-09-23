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
