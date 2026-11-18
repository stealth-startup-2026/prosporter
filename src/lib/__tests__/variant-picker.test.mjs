/**
 * Unit tests for the product page's dependent option picker: which values an
 * option offers once earlier options are chosen, and how a new pick tidies the
 * options after it.
 *
 * Fixture modelled on the Modena 2025 Men's Jersey as set up in Shopify admin
 * (reported by the client on 2026-11-18): Size S exists only for "#8 - De Cecco"
 * and "#15 - De Cecco"; the other player names only come in L, and Rinaldi is
 * sold out. Before the fix, choosing S still offered Gutierrez and Stankovic
 * and "Add to bag" stayed live on a combination with no variant.
 *
 * Plain Node, zero dependencies: `npm test`. Requires Node >= 22.18 (type stripping).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { chooseOption, findVariant, optionValueState } from "../catalog-view.ts";

const SIZE = "Size";
const CUSTOM = "Custom";
const NAMES = ["#90 - Rinaldi", "#22 - Gutierrez", "#7 - Stankovic", "#8 - De Cecco", "#15 - De Cecco"];

const variant = (size, name, available = true) => ({
  id: `gid://shopify/ProductVariant/${size}-${name}`,
  title: `${size} / ${name}`,
  sku: null,
  available,
  quantityAvailable: available ? 2 : 0,
  price: 120,
  compareAtPrice: null,
  currency: "AUD",
  selectedOptions: [
    { name: SIZE, value: size },
    { name: CUSTOM, value: name },
  ],
  image: null,
});

const modena = {
  options: [
    { name: SIZE, values: ["S", "L"] },
    { name: CUSTOM, values: NAMES },
  ],
  variants: [
    variant("S", "#8 - De Cecco"),
    variant("S", "#15 - De Cecco"),
    variant("L", "#90 - Rinaldi", false),
    variant("L", "#22 - Gutierrez"),
    variant("L", "#7 - Stankovic"),
    variant("L", "#8 - De Cecco"),
  ],
};

const offered = (product, selection, option) =>
  product.options
    .find((o) => o.name === option)
    .values.filter((v) => optionValueState(product, selection, option, v) !== "missing");

test("with S chosen, only the player names made in S are offered", () => {
  assert.deepEqual(offered(modena, { [SIZE]: "S" }, CUSTOM), ["#8 - De Cecco", "#15 - De Cecco"]);
});

test("with L chosen, its names are offered and a sold-out one is crossed out, not hidden", () => {
  assert.deepEqual(offered(modena, { [SIZE]: "L" }, CUSTOM), [
    "#90 - Rinaldi",
    "#22 - Gutierrez",
    "#7 - Stankovic",
    "#8 - De Cecco",
  ]);
  assert.equal(optionValueState(modena, { [SIZE]: "L" }, CUSTOM, "#90 - Rinaldi"), "soldOut");
  assert.equal(optionValueState(modena, { [SIZE]: "L" }, CUSTOM, "#7 - Stankovic"), "available");
});

test("before a size is chosen, every name that exists in some size is offered", () => {
  assert.deepEqual(offered(modena, {}, CUSTOM), NAMES);
});

test("the first option always offers every value, whatever is chosen after it", () => {
  const selection = { [SIZE]: "L", [CUSTOM]: "#7 - Stankovic" };
  assert.deepEqual(offered(modena, selection, SIZE), ["S", "L"]);
});

test("switching to S drops a player name S does not come in", () => {
  const next = chooseOption(modena, { [SIZE]: "L", [CUSTOM]: "#7 - Stankovic" }, SIZE, "S");
  assert.deepEqual(next, { [SIZE]: "S" });
  assert.equal(findVariant(modena, next), null);
});

test("switching size keeps a player name that exists in both sizes", () => {
  const next = chooseOption(modena, { [SIZE]: "L", [CUSTOM]: "#8 - De Cecco" }, SIZE, "S");
  assert.deepEqual(next, { [SIZE]: "S", [CUSTOM]: "#8 - De Cecco" });
  assert.equal(findVariant(modena, next)?.id, "gid://shopify/ProductVariant/S-#8 - De Cecco");
});

test("a later option left with one existing value is chosen for the shopper", () => {
  const product = {
    options: modena.options,
    variants: [variant("S", "#8 - De Cecco"), ...modena.variants.filter((v) => v.title.startsWith("L"))],
  };
  assert.deepEqual(chooseOption(product, {}, SIZE, "S"), { [SIZE]: "S", [CUSTOM]: "#8 - De Cecco" });
});

test("picking a later option leaves earlier choices alone", () => {
  const next = chooseOption(modena, { [SIZE]: "L" }, CUSTOM, "#22 - Gutierrez");
  assert.deepEqual(next, { [SIZE]: "L", [CUSTOM]: "#22 - Gutierrez" });
});

test("products without variants (mock catalog) offer every value and keep every pick", () => {
  const mock = { options: modena.options, variants: [] };
  assert.equal(optionValueState(mock, { [SIZE]: "S" }, CUSTOM, "#7 - Stankovic"), "available");
  assert.deepEqual(chooseOption(mock, { [CUSTOM]: "#7 - Stankovic" }, SIZE, "S"), {
    [SIZE]: "S",
    [CUSTOM]: "#7 - Stankovic",
  });
});
