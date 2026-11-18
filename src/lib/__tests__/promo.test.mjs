/**
 * Unit tests for the sale promo's window (CLNT-595): before, during and after,
 * in Sydney time, plus the inline guard that hides the promo on cached pages.
 *
 * Plain Node, zero dependencies: `npm test`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BLACK_FRIDAY_2026,
  hasPromoEnded,
  isPromoActive,
  msUntilPromoChange,
  promoGuardScript,
  promoToRender,
} from "../promo.ts";

/** A Sydney wall-clock time in November/December 2026 (AEDT, UTC+11) as an instant. */
const sydney = (local) => Date.parse(`${local}+11:00`);
const { window } = BLACK_FRIDAY_2026;

test("the window is midnight to midnight in Sydney", () => {
  assert.equal(window.startsAt, Date.parse("2026-11-15T13:00:00Z"));
  assert.equal(window.endsAt, Date.parse("2026-11-30T13:00:00Z"));
});

test("before the window: nothing shows on 15 Nov, Sydney time", () => {
  assert.equal(isPromoActive(window, sydney("2026-11-15T23:59:59")), false);
  assert.equal(hasPromoEnded(window, sydney("2026-11-15T23:59:59")), false);
});

test("during the window: from the first second of 16 Nov to the last of 30 Nov", () => {
  assert.equal(isPromoActive(window, sydney("2026-11-16T00:00:00")), true);
  assert.equal(isPromoActive(window, sydney("2026-11-18T23:30:00")), true);
  assert.equal(isPromoActive(window, sydney("2026-11-30T23:59:59")), true);
});

test("after the window: nothing shows from midnight ending 30 Nov, Sydney time", () => {
  assert.equal(isPromoActive(window, sydney("2026-12-01T00:00:00")), false);
  assert.equal(hasPromoEnded(window, sydney("2026-12-01T00:00:00")), true);
  assert.equal(isPromoActive(window, sydney("2026-12-14T09:00:00")), false);
});

test("the end is an instant, not a calendar day in the shopper's zone", () => {
  // 1 Dec 00:30 in Sydney is still 30 Nov 9:30 pm in Perth: the sale is over there too.
  assert.equal(isPromoActive(window, Date.parse("2026-11-30T21:30:00+08:00")), false);
  // 30 Nov 11:00 pm in Sydney is 8:00 pm in Perth: still on.
  assert.equal(isPromoActive(window, Date.parse("2026-11-30T20:00:00+08:00")), true);
});

test("an open tab is told when the window closes", () => {
  assert.equal(msUntilPromoChange(window, sydney("2026-11-30T23:59:00")), 60_000);
  assert.equal(msUntilPromoChange(window, sydney("2026-11-15T23:00:00")), 3_600_000);
  assert.equal(msUntilPromoChange(window, sydney("2026-12-01T00:00:00")), null);
});

test("the inline guard hides the element outside the window and leaves it inside", () => {
  const run = (now) => {
    const el = { hidden: false };
    new Function("Date", "document", promoGuardScript("promo-bar", window))(
      { now: () => now },
      { getElementById: (id) => (id === "promo-bar" ? el : null) },
    );
    return el.hidden;
  };
  assert.equal(run(sydney("2026-11-15T23:59:59")), true);
  assert.equal(run(sydney("2026-11-30T23:59:59")), false);
  assert.equal(run(sydney("2026-12-01T00:00:00")), true);
});

test("the server stops rendering the promo once the sale is over", () => {
  assert.equal(promoToRender(sydney("2026-11-30T23:59:59"))?.id, "black-friday-2026");
  assert.equal(promoToRender(sydney("2026-12-01T00:00:00")), null);
  // Before the start it is still rendered: the browser gate holds it back, so
  // a page cached ahead of a sale shows the promo the moment the sale opens.
  assert.equal(promoToRender(sydney("2026-11-15T12:00:00"))?.id, "black-friday-2026");
});

test("the copy says selected gear and never store wide", () => {
  const all = JSON.stringify(BLACK_FRIDAY_2026).toLowerCase();
  assert.equal(all.includes("store wide"), false);
  assert.equal(all.includes("storewide"), false);
  assert.match(BLACK_FRIDAY_2026.bar.text, /up to 40% off selected training gear/);
  assert.match(BLACK_FRIDAY_2026.bar.shortText, /up to 40% off/);
  assert.match(BLACK_FRIDAY_2026.bar.shortText, /16 to 30 Nov/);
});

test("the link is an internal path, and not the empty sale collection", () => {
  assert.equal(BLACK_FRIDAY_2026.href, "/shop");
});
