/**
 * Pure quantity maths shared by the product page stepper and the cart drawer.
 *
 * No imports, no `server-only`: a client component can pull these in, and the
 * node --test suite exercises them directly (Node strips the TS types).
 *
 * Stock model
 * -----------
 * Shopify's `ProductVariant.quantityAvailable` is authoritative when the
 * storefront token carries `unauthenticated_read_product_inventory` (it does on
 * this store — verified against the live Storefront API). When it comes back
 * null — a variant that does not track inventory, or a token missing the scope —
 * we fall back to a soft ceiling of FALLBACK_MAX_QUANTITY on any variant that is
 * still `availableForSale`, and lean on Shopify's server-side clamp to catch a
 * genuine over-order.
 */

/** Soft per-add ceiling when Shopify does not report a real stock number. */
export const FALLBACK_MAX_QUANTITY = 10;

/** At or below this many left, the UI shows a "Only N left" nudge. */
export const LOW_STOCK_THRESHOLD = 5;

/**
 * How many units of a variant exist to be sold, as far as the UI should trust.
 * A real (non-negative, finite) `quantityAvailable` wins; otherwise a buyable
 * variant gets the soft fallback and a sold-out one gets 0.
 */
export function stockCeiling(
  quantityAvailable: number | null | undefined,
  availableForSale: boolean,
): number {
  if (
    typeof quantityAvailable === "number" &&
    Number.isFinite(quantityAvailable) &&
    quantityAvailable >= 0
  ) {
    return Math.trunc(quantityAvailable);
  }
  return availableForSale ? FALLBACK_MAX_QUANTITY : 0;
}

/**
 * How many *more* of a variant the shopper may add right now: the stock ceiling
 * minus what the cart already holds, never below 0. When this is 0 the variant
 * is either sold out or already maxed out in the bag.
 */
export function maxAddable(
  quantityAvailable: number | null | undefined,
  availableForSale: boolean,
  inCartQuantity = 0,
): number {
  const ceiling = stockCeiling(quantityAvailable, availableForSale);
  const inCart = Math.max(0, Math.trunc(inCartQuantity) || 0);
  return Math.max(0, ceiling - inCart);
}

/**
 * Clamp a desired quantity into [1, cap]. Returns 0 when `cap` is below 1, i.e.
 * nothing may be added — callers use that to disable the add button.
 */
export function clampQuantity(desired: number, cap: number): number {
  const ceiling = Math.trunc(cap) || 0;
  if (ceiling < 1) return 0;
  const wanted = Math.trunc(desired) || 1;
  return Math.min(Math.max(1, wanted), ceiling);
}

/**
 * True when the stock ceiling is a real, low number worth surfacing to the
 * shopper. A fallback ceiling (unknown stock) never trips this.
 */
export function isLowStock(
  quantityAvailable: number | null | undefined,
  availableForSale: boolean,
): boolean {
  if (
    typeof quantityAvailable !== "number" ||
    !Number.isFinite(quantityAvailable) ||
    quantityAvailable < 0
  ) {
    return false;
  }
  const ceiling = stockCeiling(quantityAvailable, availableForSale);
  return ceiling > 0 && ceiling <= LOW_STOCK_THRESHOLD;
}
