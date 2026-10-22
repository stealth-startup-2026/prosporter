/**
 * Jersey personalisation rules: which tree a product gets, which questions are
 * visible for a set of answers, validation, and the attributes sent to Shopify.
 * The expected trees are the old WooCommerce site's PPOM forms
 * (docs/personalisation/README.md).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NO,
  YES,
  isFieldVisible,
  personalisationAttributes,
  personalisationFor,
  summariseAttributes,
  validatePersonalisation,
  visibleFields,
} from "../personalisation.ts";

const jersey = (title, extra = {}) => ({
  title,
  categoryId: "jerseys",
  clubs: [],
  ...extra,
});

const keys = (fields) => fields.map((f) => f.key);

// ---------------------------------------------------------------- selection

test("ProVolley club jersey gets the club tree naming ProVolley", () => {
  const tree = personalisationFor(jersey("ProVolley Men Jersey 2026/27 – SVL/YSVL Sydney"));
  assert.equal(tree?.id, "club");
  assert.equal(tree?.club, "ProVolley");
  assert.equal(tree?.fields[0].label, "Are you a ProVolley player?");
});

test("Inner West jersey (by club tag) gets the club tree naming Inner West Volley", () => {
  const tree = personalisationFor(
    jersey("Women’s Jersey 2026/27 – SVL/YSVL Sydney", { clubs: ["inner-west-volley"] }),
  );
  assert.equal(tree?.club, "Inner West Volley");
  assert.equal(tree?.fields[0].label, "Are you an Inner West Volley player?");
});

test("Inner West beats ProVolley when a title names both (an IWV jersey sold under the ProVolley club)", () => {
  const tree = personalisationFor(
    jersey("Inner West Volley Men’s Jersey 2026/27", { clubs: ["provolley-academy"] }),
  );
  assert.equal(tree?.club, "Inner West Volley");
});

test("Premier ProVolley Jersey gets the premier tree with the name field first", () => {
  const tree = personalisationFor(jersey("Premier ProVolley Jersey 2026/27"));
  assert.equal(tree?.id, "premier");
  assert.equal(tree?.fields[0].key, "lastName");
  assert.deepEqual(
    tree?.fields.find((f) => f.key === "seniorTeam")?.options,
    ["Reserves", "Premier"],
  );
});

test("teamwear and non-club jerseys get no questions", () => {
  assert.equal(personalisationFor(jersey("Modena Volley Jersey")), null);
  assert.equal(personalisationFor(jersey("Italian Volleyball Club Jersey")), null);
  assert.equal(
    personalisationFor({ title: "ProVolley Kids Training T-Shirt", categoryId: "tops", clubs: ["provolley-academy"] }),
    null,
  );
});

test("a jersey is recognised by title when the category is something else", () => {
  const tree = personalisationFor({
    title: "ProVolley Women’s Jersey 2026/27",
    categoryId: "shop",
    clubs: [],
  });
  assert.equal(tree?.club, "ProVolley");
});

test("the prosporter.personalisation metafield overrides the heuristics", () => {
  const off = personalisationFor(jersey("ProVolley Men Jersey", { details: { personalisation: ["none"] } }));
  assert.equal(off, null);
  const on = personalisationFor({
    title: "Club Hoodie",
    categoryId: "hoodies-jackets",
    clubs: [],
    details: { personalisation: ["inner-west"] },
  });
  assert.equal(on?.club, "Inner West Volley");
  const premier = personalisationFor(jersey("Some Jersey", { details: { personalisation: ["Premier"] } }));
  assert.equal(premier?.id, "premier");
});

// --------------------------------------------------------------- visibility

const club = personalisationFor(jersey("ProVolley Men Jersey 2026/27"));

test("only the first question shows before anything is answered", () => {
  assert.deepEqual(keys(visibleFields(club, {})), ["player"]);
});

test("a non-member is asked only for a preferred number", () => {
  assert.deepEqual(keys(visibleFields(club, { player: NO })), ["player", "preferredNumber"]);
});

test("a member is asked junior and senior; a junior picks a division and whether the number is confirmed", () => {
  assert.deepEqual(keys(visibleFields(club, { player: YES })), ["player", "junior", "senior"]);
  assert.deepEqual(keys(visibleFields(club, { player: YES, junior: YES, senior: NO })), [
    "player",
    "junior",
    "juniorDivision",
    "senior",
    "numberConfirmed",
  ]);
});

test("a confirmed number asks for the number; an unconfirmed one asks for three preferences", () => {
  const base = { player: YES, junior: NO, senior: YES, seniorDivision: "Division 2" };
  assert.deepEqual(keys(visibleFields(club, { ...base, numberConfirmed: YES })), [
    "player",
    "junior",
    "senior",
    "seniorDivision",
    "numberConfirmed",
    "confirmedNumber",
  ]);
  assert.deepEqual(keys(visibleFields(club, { ...base, numberConfirmed: NO })), [
    "player",
    "junior",
    "senior",
    "seniorDivision",
    "numberConfirmed",
    "pref1",
    "pref2",
    "pref3",
  ]);
});

test("a member in neither team is asked nothing more (as on the old site)", () => {
  assert.deepEqual(keys(visibleFields(club, { player: YES, junior: NO, senior: NO })), [
    "player",
    "junior",
    "senior",
  ]);
});

test("switching back to non-member hides the whole team branch even with stale answers", () => {
  const stale = { player: NO, junior: YES, juniorDivision: "U17", numberConfirmed: YES, confirmedNumber: "7" };
  assert.deepEqual(keys(visibleFields(club, stale)), ["player", "preferredNumber"]);
  const confirmed = club.fields.find((f) => f.key === "confirmedNumber");
  assert.equal(isFieldVisible(confirmed, stale, club), false);
});

// --------------------------------------------------------------- validation

test("required questions are flagged only while visible", () => {
  assert.deepEqual(validatePersonalisation(club, {}), { player: "Yes or No" });
  const errors = validatePersonalisation(club, { player: YES });
  assert.deepEqual(Object.keys(errors), ["junior", "senior"]);
  assert.deepEqual(validatePersonalisation(club, { player: YES, junior: NO, senior: NO }), {});
});

test("numbers must be whole and within range: 1-99 for non-members, 1-60 for club numbers", () => {
  assert.deepEqual(Object.keys(validatePersonalisation(club, { player: NO, preferredNumber: "12" })), []);
  assert.deepEqual(Object.keys(validatePersonalisation(club, { player: NO, preferredNumber: "100" })), ["preferredNumber"]);
  assert.deepEqual(Object.keys(validatePersonalisation(club, { player: NO, preferredNumber: "0" })), ["preferredNumber"]);
  assert.deepEqual(Object.keys(validatePersonalisation(club, { player: NO, preferredNumber: "7.5" })), ["preferredNumber"]);
  assert.deepEqual(Object.keys(validatePersonalisation(club, { player: NO, preferredNumber: "abc" })), ["preferredNumber"]);
  const senior = { player: YES, junior: NO, senior: YES, seniorDivision: "Division 1", numberConfirmed: YES };
  assert.deepEqual(Object.keys(validatePersonalisation(club, { ...senior, confirmedNumber: "60" })), []);
  assert.deepEqual(Object.keys(validatePersonalisation(club, { ...senior, confirmedNumber: "61" })), ["confirmedNumber"]);
});

test("a select answer outside its options is rejected", () => {
  assert.deepEqual(Object.keys(validatePersonalisation(club, { player: "Maybe" })), ["player"]);
  assert.deepEqual(
    Object.keys(validatePersonalisation(club, { player: YES, junior: YES, juniorDivision: "U21", senior: NO })),
    ["juniorDivision", "numberConfirmed"],
  );
});

test("premier: last name is required and capped at 30 characters", () => {
  const premier = personalisationFor(jersey("Premier ProVolley Jersey 2026/27"));
  assert.deepEqual(Object.keys(validatePersonalisation(premier, { player: NO, preferredNumber: "9" })), ["lastName"]);
  const long = "A".repeat(31);
  assert.deepEqual(
    Object.keys(validatePersonalisation(premier, { lastName: long, player: NO, preferredNumber: "9" })),
    ["lastName"],
  );
  assert.deepEqual(validatePersonalisation(premier, { lastName: " Stankovic ", player: NO, preferredNumber: "9" }), {});
});

// --------------------------------------------------------------- attributes

test("attributes carry visible answers only, in question order, with staff-facing keys", () => {
  const answers = {
    player: YES,
    junior: YES,
    juniorDivision: "U17",
    senior: NO,
    numberConfirmed: YES,
    confirmedNumber: "07",
    // stale from an earlier path, must not leak
    preferredNumber: "99",
    pref1: "1",
  };
  assert.deepEqual(personalisationAttributes(club, answers), [
    { key: "Club player", value: "Yes" },
    { key: "Junior team", value: "Yes" },
    { key: "Junior division", value: "U17" },
    { key: "Senior team", value: "No" },
    { key: "Number confirmed by club", value: "Yes" },
    { key: "Confirmed number", value: "7" },
  ]);
});

test("premier attributes include the name on the back, trimmed", () => {
  const premier = personalisationFor(jersey("Premier ProVolley Jersey 2026/27"));
  assert.deepEqual(
    personalisationAttributes(premier, { lastName: " Stankovic ", player: NO, preferredNumber: "9" }),
    [
      { key: "Name on back", value: "Stankovic" },
      { key: "Premier League player", value: "No" },
      { key: "Preferred number", value: "9" },
    ],
  );
});

test("summary joins attributes for the bag drawer and skips hidden (_) keys", () => {
  assert.equal(
    summariseAttributes([
      { key: "Club player", value: "Yes" },
      { key: "_internal", value: "x" },
      { key: "Junior division", value: "U17" },
    ]),
    "Club player: Yes · Junior division: U17",
  );
  assert.equal(summariseAttributes([]), null);
});
