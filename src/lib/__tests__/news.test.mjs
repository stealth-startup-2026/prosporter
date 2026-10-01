/**
 * News categories from Shopify article tags (`src/lib/news.ts`). `npm test`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { categoriesFromTags, isNewsCategoryId, newsCategoryHref } from "../news.ts";

const ids = (tags) => categoriesFromTags(tags).map((c) => c.id);

test("maps the four category tags in a fixed order", () => {
  assert.deepEqual(ids(["Tours", "Tournaments"]), ["tournaments", "tours"]);
  assert.deepEqual(ids(["Events", "News"]), ["news", "events"]);
});

test("ignores case, spaces and a missing plural, and drops repeats", () => {
  assert.deepEqual(ids([" tournament", "TOURNAMENTS", "tour ", "Event"]), ["tournaments", "tours", "events"]);
});

test("ignores every other tag, so migrated WordPress posts are not listed", () => {
  assert.deepEqual(ids(["gel", "polish", "Blog", "Uncategorized"]), []);
  assert.deepEqual(ids([]), []);
  assert.deepEqual(ids(null), []);
});

test("validates category ids and builds filter links", () => {
  assert.equal(isNewsCategoryId("tours"), true);
  assert.equal(isNewsCategoryId("Tours"), false);
  assert.equal(isNewsCategoryId(undefined), false);
  assert.equal(newsCategoryHref("events"), "/blog?category=events");
});
