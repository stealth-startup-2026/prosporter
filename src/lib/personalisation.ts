/**
 * Jersey personalisation: the club / team / number questions the old
 * WooCommerce site asked on every club jersey (PPOM add-on fields), rebuilt as
 * Shopify line-item attributes.
 *
 * Pure module, no React: the product page renders the fields this module says
 * are visible, validates with `validatePersonalisation`, and passes
 * `personalisationAttributes` to the cart. Each answer then lands on the order
 * line in Shopify admin ("Club player: Yes · Junior division: U17 · …"), which
 * is what lets staff tag jersey orders without asking the buyer afterwards.
 *
 * The club and Premier trees started as a copy of the old site (see
 * docs/personalisation/README.md, recovered from Wayback snapshots) and were
 * adjusted with Mladen on 23 Oct 2026: a single team question on the Premier
 * jersey, a number for club players in no team, 1-99 for anyone not in a
 * team, and a Kids tree.
 */

export type PersonalisationRule = { field: string; equals: string };

export type PersonalisationField = {
  /** Stable id, the key in the answers map. */
  key: string;
  /** The question as the shopper reads it. */
  label: string;
  /** Line-item attribute key: what staff read on the order. Short and stable. */
  attribute: string;
  type: "select" | "number" | "text";
  options?: string[];
  /** Required whenever the field is visible. */
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  /** Hidden unless every `all` rule and at least one `any` rule holds. */
  showWhen?: { all?: PersonalisationRule[]; any?: PersonalisationRule[] };
  /** Validation message; a generic one is derived when absent. */
  error?: string;
  /** Helper text under the field. */
  hint?: string;
};

export type PersonalisationTree = {
  id: "club" | "premier" | "kids";
  /** Club named in the first question, for the heading. */
  club: string;
  fields: PersonalisationField[];
};

export type PersonalisationAnswers = Record<string, string>;

export const YES = "Yes";
export const NO = "No";

/** Team numbers, assigned by the club ("Please enter your confirmed jersey number (1-60)"). */
const CLUB_NUMBER = { min: 1, max: 60 };
/** Anyone not in a team (non-members, members in no team) picks any two-digit number. */
const ANY_NUMBER = { min: 1, max: 99 };

const numberField = (
  key: string,
  label: string,
  attribute: string,
  range: { min: number; max: number },
  showWhen: PersonalisationField["showWhen"],
): PersonalisationField => ({
  key,
  label,
  attribute,
  type: "number",
  required: true,
  ...range,
  showWhen,
  error: `${label} (${range.min}-${range.max})`,
});

/**
 * The number questions every tree ends with, for shoppers in a team: has the
 * club confirmed a number, then the number or three preferences (all 1-60).
 */
function teamNumberFields(confirmedWhen: PersonalisationField["showWhen"]): PersonalisationField[] {
  return [
    {
      key: "numberConfirmed",
      label: "Has your jersey number been confirmed by the Club?",
      attribute: "Number confirmed by club",
      type: "select",
      options: [NO, YES],
      required: true,
      showWhen: confirmedWhen,
      error: "Yes or No",
    },
    numberField("confirmedNumber", "Enter your confirmed jersey number", "Confirmed number", CLUB_NUMBER, {
      all: [{ field: "numberConfirmed", equals: YES }],
    }),
    numberField("pref1", "Jersey number preference #1", "Number preference 1", CLUB_NUMBER, {
      all: [{ field: "numberConfirmed", equals: NO }],
    }),
    numberField("pref2", "Jersey number preference #2", "Number preference 2", CLUB_NUMBER, {
      all: [{ field: "numberConfirmed", equals: NO }],
    }),
    numberField("pref3", "Jersey number preference #3", "Number preference 3", CLUB_NUMBER, {
      all: [{ field: "numberConfirmed", equals: NO }],
    }),
  ];
}

const playerField = (club: string): PersonalisationField => ({
  key: "player",
  label: `Are you ${/^[aeiou]/i.test(club) ? "an" : "a"} ${club} player?`,
  attribute: "Club player",
  type: "select",
  options: [YES, NO],
  required: true,
  error: "Yes or No",
});

/**
 * Tree A: ProVolley and Inner West club jerseys. Identical on the old site
 * apart from the club named in the first question.
 */
function clubTree(club: string): PersonalisationTree {
  return {
    id: "club",
    club,
    fields: [
      playerField(club),
      {
        key: "junior",
        label: "Junior team?",
        attribute: "Junior team",
        type: "select",
        options: [NO, YES],
        required: true,
        showWhen: { all: [{ field: "player", equals: YES }] },
        error: "Please select if you play in a Junior team.",
      },
      {
        key: "juniorDivision",
        label: "Select your Junior team",
        attribute: "Junior division",
        type: "select",
        options: ["U15", "U17", "U19"],
        required: true,
        showWhen: { all: [{ field: "junior", equals: YES }] },
        error: "Select your Junior team",
      },
      {
        key: "senior",
        label: "Senior team?",
        attribute: "Senior team",
        type: "select",
        options: [NO, YES],
        required: true,
        showWhen: { all: [{ field: "player", equals: YES }] },
        error: "Please select if you play in a Senior team.",
      },
      {
        key: "seniorDivision",
        label: "Select your Senior team",
        attribute: "Senior division",
        type: "select",
        options: ["Division 1", "Division 2", "Division 3"],
        required: true,
        showWhen: { all: [{ field: "senior", equals: YES }] },
        error: "Select your Senior team",
      },
      numberField("preferredNumber", "Enter your preferred jersey number", "Preferred number", ANY_NUMBER, {
        all: [{ field: "player", equals: NO }],
      }),
      // A member in neither team has no club number either, so they pick one
      // like a non-member. Same attribute: the two never show together.
      numberField("noTeamNumber", "Enter your preferred jersey number", "Preferred number", ANY_NUMBER, {
        all: [
          { field: "junior", equals: NO },
          { field: "senior", equals: NO },
        ],
      }),
      ...teamNumberFields({
        any: [
          { field: "junior", equals: YES },
          { field: "senior", equals: YES },
        ],
      }),
    ],
  };
}

/**
 * Tree B: the Premier ProVolley Jersey, which also prints the player's name.
 * One team question (a player in two teams buys a jersey per team).
 */
function premierTree(): PersonalisationTree {
  return {
    id: "premier",
    club: "ProVolley",
    fields: [
      {
        key: "lastName",
        label: "Last name (back of jersey)",
        attribute: "Name on back",
        type: "text",
        required: true,
        maxLength: 30,
        error: "Enter the last name to print on the jersey",
      },
      {
        key: "player",
        label: "Do you play Premier League Volley 2026/27 for ProVolley?",
        attribute: "Premier League player",
        type: "select",
        options: [YES, NO],
        required: true,
        error: "Yes or No",
      },
      {
        key: "team",
        label: "Select your team",
        attribute: "Team",
        type: "select",
        options: ["U19", "Reserves", "Premier"],
        required: true,
        showWhen: { all: [{ field: "player", equals: YES }] },
        error: "Select your team",
      },
      numberField("preferredNumber", "Enter your preferred jersey number", "Preferred number", ANY_NUMBER, {
        all: [{ field: "player", equals: NO }],
      }),
      ...teamNumberFields({ all: [{ field: "player", equals: YES }] }),
    ],
  };
}

/**
 * Tree C: ProVolley kids jerseys. The club flow with the kids' teams in place
 * of junior and senior (not on the old site; agreed with Mladen 23 Oct 2026).
 */
function kidsTree(): PersonalisationTree {
  return {
    id: "kids",
    club: "ProVolley",
    fields: [
      playerField("ProVolley"),
      {
        key: "team",
        label: "Select your team",
        attribute: "Team",
        type: "select",
        options: ["Beginner", "Intermediate", "Advance"],
        required: true,
        showWhen: { all: [{ field: "player", equals: YES }] },
        error: "Select your team",
      },
      numberField("preferredNumber", "Enter your preferred jersey number", "Preferred number", ANY_NUMBER, {
        all: [{ field: "player", equals: NO }],
      }),
      ...teamNumberFields({ all: [{ field: "player", equals: YES }] }),
    ],
  };
}

/** Club ids as the catalog carries them (`club:` tags / `prosporter.club` metafield / mock taxonomy). */
const CLUB_IDS = {
  provolley: "provolley-academy",
  innerWest: "inner-west-volley",
} as const;

/**
 * Values of the optional `prosporter.personalisation` product metafield. Set it
 * in Shopify admin to force a tree on (or off) regardless of title and club.
 */
export type PersonalisationOverride = "none" | "premier" | "kids" | "provolley" | "inner-west";

export type PersonalisationSubject = {
  title: string;
  /** Primary category id, e.g. "jerseys". */
  categoryId: string;
  clubs: string[];
  /** `prosporter.*` metafields keyed by metafield key. */
  details?: Record<string, string[]>;
};

/**
 * Which tree a product gets, or null for everything that is not a club jersey.
 * The metafield wins; otherwise the product must be a jersey (category or
 * title) and be attributed to a club by tag, metafield or title.
 */
export function personalisationFor(product: PersonalisationSubject): PersonalisationTree | null {
  const override = (product.details?.personalisation?.[0] ?? "").trim().toLowerCase();
  switch (override) {
    case "none":
      return null;
    case "premier":
      return premierTree();
    case "kids":
      return kidsTree();
    case "provolley":
      return clubTree("ProVolley");
    case "inner-west":
    case "innerwest":
    case "inner west":
      return clubTree("Inner West Volley");
    default:
      break;
  }

  const title = product.title.toLowerCase();
  const isJersey = product.categoryId === "jerseys" || /\bjersey\b/.test(title);
  if (!isJersey) return null;

  if (/\bpremier\b/.test(title)) return premierTree();
  if (product.clubs.includes(CLUB_IDS.innerWest) || /inner\s*west/.test(title)) {
    return clubTree("Inner West Volley");
  }
  if (product.clubs.includes(CLUB_IDS.provolley) || /pro\s*volley/.test(title)) {
    return /\bkids?\b/.test(title) ? kidsTree() : clubTree("ProVolley");
  }
  return null;
}

function ruleHolds(rule: PersonalisationRule, answers: PersonalisationAnswers): boolean {
  return (answers[rule.field] ?? "") === rule.equals;
}

/**
 * Whether a field is on screen for these answers. Rules read the answers as
 * given, not the visible subset, which matches the old site: hiding a parent
 * hides its children because the parent's answer no longer equals anything
 * that would show them only when the shopper changes it.
 */
export function isFieldVisible(
  field: PersonalisationField,
  answers: PersonalisationAnswers,
  tree?: PersonalisationTree,
): boolean {
  const when = field.showWhen;
  if (!when) return true;
  const all = when.all ?? [];
  const any = when.any ?? [];
  const parentVisible = (name: string) => {
    if (!tree) return true;
    const parent = tree.fields.find((f) => f.key === name);
    return parent ? isFieldVisible(parent, answers, tree) : true;
  };
  const holds = (rule: PersonalisationRule) => parentVisible(rule.field) && ruleHolds(rule, answers);
  if (!all.every(holds)) return false;
  if (any.length > 0 && !any.some(holds)) return false;
  return true;
}

export function visibleFields(
  tree: PersonalisationTree,
  answers: PersonalisationAnswers,
): PersonalisationField[] {
  return tree.fields.filter((f) => isFieldVisible(f, answers, tree));
}

const clean = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Error message per visible field that fails; empty object means ready to add. */
export function validatePersonalisation(
  tree: PersonalisationTree,
  answers: PersonalisationAnswers,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of visibleFields(tree, answers)) {
    const value = clean(answers[field.key]);
    const message = field.error ?? `${field.label} is required`;
    if (!value) {
      if (field.required) errors[field.key] = message;
      continue;
    }
    if (field.type === "select" && !(field.options ?? []).includes(value)) {
      errors[field.key] = message;
    } else if (field.type === "number") {
      const n = Number(value);
      const whole = /^\d+$/.test(value) && Number.isInteger(n);
      const min = field.min ?? 0;
      const max = field.max ?? Number.MAX_SAFE_INTEGER;
      if (!whole || n < min || n > max) errors[field.key] = message;
    } else if (field.type === "text" && field.maxLength && value.length > field.maxLength) {
      errors[field.key] = `Keep it under ${field.maxLength} characters`;
    }
  }
  return errors;
}

/**
 * The answers as Shopify line attributes, in question order, visible fields
 * only. Call after `validatePersonalisation` returns no errors.
 */
export function personalisationAttributes(
  tree: PersonalisationTree,
  answers: PersonalisationAnswers,
): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  for (const field of visibleFields(tree, answers)) {
    const value = clean(answers[field.key]);
    if (!value) continue;
    out.push({
      key: field.attribute,
      value: field.type === "number" ? String(Number(value)) : value,
    });
  }
  return out;
}

/** "Club player: Yes · Junior division: U17" for the bag drawer and order summaries. */
export function summariseAttributes(attributes: { key: string; value: string }[]): string | null {
  const parts = attributes
    .filter((a) => a.key && a.value && !a.key.startsWith("_"))
    .map((a) => `${a.key}: ${a.value}`);
  return parts.length ? parts.join(" · ") : null;
}
