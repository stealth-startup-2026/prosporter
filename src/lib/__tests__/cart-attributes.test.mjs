import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_ATTRIBUTES, sanitiseLineAttributes } from "../cart-attributes.ts";

test("keeps well-formed pairs, trimmed, in order", () => {
  assert.deepEqual(
    sanitiseLineAttributes([
      { key: " Club player ", value: "Yes " },
      { key: "Junior division", value: "U17" },
    ]),
    [
      { key: "Club player", value: "Yes" },
      { key: "Junior division", value: "U17" },
    ],
  );
});

test("drops non-arrays, non-objects, empty and non-string parts, and duplicate keys", () => {
  assert.deepEqual(sanitiseLineAttributes(undefined), []);
  assert.deepEqual(sanitiseLineAttributes("Club player: Yes"), []);
  assert.deepEqual(
    sanitiseLineAttributes([
      null,
      42,
      { key: "", value: "x" },
      { key: "k", value: "" },
      { key: "k", value: 7 },
      { key: "Club player", value: "Yes" },
      { key: "Club player", value: "No" },
    ]),
    [{ key: "Club player", value: "Yes" }],
  );
});

test("bounds length and count, and flattens control characters", () => {
  const out = sanitiseLineAttributes([
    { key: "k".repeat(500), value: "line1\nline2\u0000end" },
  ]);
  assert.equal(out[0].key.length, 100);
  assert.equal(out[0].value, "line1 line2 end");
  const many = Array.from({ length: MAX_ATTRIBUTES + 5 }, (_, i) => ({ key: `k${i}`, value: "v" }));
  assert.equal(sanitiseLineAttributes(many).length, MAX_ATTRIBUTES);
});
