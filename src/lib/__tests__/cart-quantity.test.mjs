/**
 * Unit tests for the pure quantity maths behind the product-page stepper and
 * the cart drawer's +/- controls.
 *
 * Plain Node, zero dependencies: `npm test` (or `node --test
 * src/lib/__tests__/*.test.mjs`). Requires Node >= 22.18, which strips the
 * TypeScript types from the imported module without a build step.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FALLBACK_MAX_QUANTITY,
  LOW_STOCK_THRESHOLD,
  clampQuantity,
  isLowStock,
  maxAddable,
  stockCeiling,
} from "../cart-quantity.ts";

test("stockCeiling trusts a real quantityAvailable", () => {
  assert.equal(stockCeiling(3, true), 3);
  assert.equal(stockCeiling(0, true), 0);
  assert.equal(stockCeiling(7.9, true), 7); // truncated, never rounded up
});

test("stockCeiling falls back when quantityAvailable is unknown", () => {
  assert.equal(stockCeiling(null, true), FALLBACK_MAX_QUANTITY);
  assert.equal(stockCeiling(undefined, true), FALLBACK_MAX_QUANTITY);
  assert.equal(stockCeiling(null, false), 0); // sold out, no fallback
  assert.equal(stockCeiling(-4, true), FALLBACK_MAX_QUANTITY); // garbage negative
});

test("maxAddable subtracts what the cart already holds", () => {
  assert.equal(maxAddable(3, true, 0), 3);
  assert.equal(maxAddable(3, true, 1), 2);
  assert.equal(maxAddable(3, true, 3), 0); // fully maxed
  assert.equal(maxAddable(3, true, 5), 0); // never negative
});

test("maxAddable uses the fallback ceiling when stock is unknown", () => {
  assert.equal(maxAddable(null, true, 0), FALLBACK_MAX_QUANTITY);
  assert.equal(maxAddable(null, true, 4), FALLBACK_MAX_QUANTITY - 4);
  assert.equal(maxAddable(null, false, 0), 0);
});

test("clampQuantity keeps the desired value inside [1, cap]", () => {
  assert.equal(clampQuantity(1, 3), 1);
  assert.equal(clampQuantity(2, 3), 2);
  assert.equal(clampQuantity(9, 3), 3); // over the cap -> cap
  assert.equal(clampQuantity(0, 3), 1); // below the floor -> 1
  assert.equal(clampQuantity(-2, 3), 1);
  assert.equal(clampQuantity(2.7, 3), 2); // truncated
});

test("clampQuantity returns 0 when nothing may be added", () => {
  assert.equal(clampQuantity(1, 0), 0);
  assert.equal(clampQuantity(5, -3), 0);
});

test("isLowStock trips only on a real, small ceiling", () => {
  assert.equal(isLowStock(LOW_STOCK_THRESHOLD, true), true);
  assert.equal(isLowStock(1, true), true);
  assert.equal(isLowStock(0, true), false); // sold out is not "low"
  assert.equal(isLowStock(LOW_STOCK_THRESHOLD + 1, true), false);
  assert.equal(isLowStock(null, true), false); // unknown stock never nudges
});
