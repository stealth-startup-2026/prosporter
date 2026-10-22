/**
 * Server-side guard for line-item attributes before they reach Shopify.
 *
 * The product page builds attributes from `personalisation.ts`, but the server
 * action is a public endpoint: anything can call it with anything. This keeps
 * the payload to plain, bounded strings with unique keys so a malformed call
 * can neither break the cart mutation nor stuff an order with junk.
 */

export const MAX_ATTRIBUTES = 24;
export const MAX_ATTRIBUTE_KEY = 100;
export const MAX_ATTRIBUTE_VALUE = 255;

export type LineAttribute = { key: string; value: string };

const flat = (value: unknown, max: number): string =>
  typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max)
    : "";

/** Drop everything that is not a non-empty key/value string pair; first key wins. */
export function sanitiseLineAttributes(input: unknown): LineAttribute[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: LineAttribute[] = [];
  for (const item of input) {
    if (out.length >= MAX_ATTRIBUTES) break;
    if (!item || typeof item !== "object") continue;
    const key = flat((item as { key?: unknown }).key, MAX_ATTRIBUTE_KEY);
    const value = flat((item as { value?: unknown }).value, MAX_ATTRIBUTE_VALUE);
    if (!key || !value || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, value });
  }
  return out;
}
