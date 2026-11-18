/**
 * Catalog view model — the single product shape the storefront UI renders.
 *
 * Both catalog sources normalise into these types: the Shopify Storefront API
 * (`src/lib/shopify`) when the store is configured, and the mock catalog
 * (`src/lib/catalog.ts`) otherwise. The mapping lives in `catalog-source.ts`
 * (server-only); this module holds the types and the pure helpers so client
 * components can import them without pulling in the mock JSON or `server-only`.
 */

export type CatalogImage = {
  url: string;
  alt: string;
  /** Intrinsic size when the source knows it; null for local mock assets. */
  width: number | null;
  height: number | null;
};

export type CatalogProduct = {
  /** Storefront handle / mock slug. Unique, so it doubles as the React key. */
  handle: string;
  title: string;
  /** Shopify `Product.vendor`, trimmed. Null when the source has none (mock catalog). */
  vendor: string | null;
  image: CatalogImage | null;
  /** Lowest variant price. */
  price: number;
  /** Highest variant price; equal to `price` for single-price products. */
  maxPrice: number;
  /** Struck-through price when the product is discounted. */
  compareAtPrice: number | null;
  currency: string;
  onSale: boolean;
  inStock: boolean;
  categoryId: string;
  categoryLabel: string;
  surface: string | null;
  clubs: string[];
  gender: string[];
  colours: string[];
  sizes: string[];
  /** Set only for single-variant products, so a card can quick-add. */
  variantId: string | null;
  /** Epoch milliseconds; higher is newer. Drives the "Newest" sort. */
  createdAt: number;
};

export type CatalogOption = {
  name: string;
  values: string[];
  /** Shopify option-value swatches (hex) keyed by value, when the merchant has set them. */
  swatches?: Record<string, string>;
};

export type CatalogVariant = {
  id: string;
  title: string;
  /** Merchant SKU, when set. Feeds the product page's structured data. */
  sku: string | null;
  available: boolean;
  /**
   * Units Shopify says are in stock, or null when it does not report a number
   * (untracked variant, or a token without `unauthenticated_read_product_inventory`).
   * The product page uses it to cap the quantity stepper; see `src/lib/cart-quantity.ts`.
   */
  quantityAvailable: number | null;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  selectedOptions: { name: string; value: string }[];
  image: CatalogImage | null;
};

export type CatalogProductDetail = CatalogProduct & {
  images: CatalogImage[];
  /** Store-authored HTML. Empty string when the source has none. */
  descriptionHtml: string;
  /** Plain-text description, used when there is no HTML body. */
  description: string;
  seo: { title: string | null; description: string | null };
  /** Buyer-facing options only: a lone "Title / Default Title" option is dropped. */
  options: CatalogOption[];
  variants: CatalogVariant[];
  /** `prosporter.*` metafield values keyed by metafield key. */
  details: Record<string, string[]>;
  breadcrumb: { href: string; label: string };
};

/** Shopify's placeholder option for products without real options. */
export const DEFAULT_OPTION_NAME = "Title";
export const DEFAULT_OPTION_VALUE = "Default Title";

const COLOUR_OPTION_NAMES = new Set(["colour", "color"]);
const SIZE_OPTION_NAMES = new Set(["size", "sizes"]);

export function isColourOption(name: string): boolean {
  return COLOUR_OPTION_NAMES.has(name.trim().toLowerCase());
}

export function isSizeOption(name: string): boolean {
  return SIZE_OPTION_NAMES.has(name.trim().toLowerCase());
}

/** True for the single placeholder option Shopify gives simple products. */
export function isDefaultOption(option: CatalogOption): boolean {
  return (
    option.name === DEFAULT_OPTION_NAME &&
    option.values.length === 1 &&
    option.values[0] === DEFAULT_OPTION_VALUE
  );
}

/** The variant matching a full option selection, or null while incomplete. */
export function findVariant(
  product: Pick<CatalogProductDetail, "options" | "variants">,
  selection: Record<string, string>,
): CatalogVariant | null {
  if (product.variants.length === 0) return null;
  if (product.options.some((o) => !selection[o.name])) return null;
  return (
    product.variants.find((v) =>
      v.selectedOptions.every((o) => selection[o.name] === undefined || selection[o.name] === o.value),
    ) ?? null
  );
}

/**
 * How an option value stands, given the options chosen *before* it.
 *
 * Options are ordered (Size, then Custom, …), as Shopify orders them. The first
 * option always lists every value; each later one only offers the values that
 * exist alongside the earlier choices. So with Size S chosen on a jersey whose S
 * variants are only "#8 - De Cecco" and "#15 - De Cecco", every other player
 * name is "missing" and the picker hides it, while a name whose S variants are
 * all out of stock is "soldOut" and stays visible, crossed out.
 *
 * Later choices are ignored on purpose: switching Size must never hide a size.
 * With no variants (the mock catalog) every value is "available".
 */
export type OptionValueState = "available" | "soldOut" | "missing";

export function optionValueState(
  product: Pick<CatalogProductDetail, "options" | "variants">,
  selection: Record<string, string>,
  optionName: string,
  value: string,
): OptionValueState {
  if (product.variants.length === 0) return "available";
  const index = product.options.findIndex((o) => o.name === optionName);
  const earlier = product.options
    .slice(0, Math.max(index, 0))
    .filter((o) => selection[o.name] !== undefined);
  const has = (v: CatalogVariant, name: string, val: string) =>
    v.selectedOptions.some((o) => o.name === name && o.value === val);
  const matches = product.variants.filter(
    (v) => has(v, optionName, value) && earlier.every((o) => has(v, o.name, selection[o.name])),
  );
  if (matches.length === 0) return "missing";
  return matches.some((v) => v.available) ? "available" : "soldOut";
}

/**
 * Applies a shopper's pick and tidies the options after it.
 *
 * Any later choice that no longer exists with the new earlier choices is
 * dropped (S + "#7 - Stankovic" becomes just S), so the page never sits on a
 * combination Shopify has no variant for. When a later option is left with
 * exactly one existing value, that value is chosen for the shopper.
 */
export function chooseOption(
  product: Pick<CatalogProductDetail, "options" | "variants">,
  selection: Record<string, string>,
  optionName: string,
  value: string,
): Record<string, string> {
  const next: Record<string, string> = { ...selection, [optionName]: value };
  if (product.variants.length === 0) return next;
  const index = product.options.findIndex((o) => o.name === optionName);
  for (const option of product.options.slice(index + 1)) {
    const existing = option.values.filter(
      (v) => optionValueState(product, next, option.name, v) !== "missing",
    );
    const current = next[option.name];
    if (current !== undefined && !existing.includes(current)) delete next[option.name];
    if (next[option.name] === undefined && existing.length === 1) next[option.name] = existing[0];
  }
  return next;
}

const SIZE_ORDER = ["4XS", "3XS", "2XS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "S/M", "M/L"];

/**
 * Build facet options from a specific product set so counts reflect the
 * current scope. Moved here from `catalog.ts` so both sources share it.
 */
export function buildFacets(products: CatalogProduct[]) {
  const tally = (vals: string[]) => {
    const m = new Map<string, number>();
    for (const v of vals) m.set(v, (m.get(v) ?? 0) + 1);
    return m;
  };

  const categories = tally(products.map((p) => p.categoryId));
  const categoryLabels = new Map(products.map((p) => [p.categoryId, p.categoryLabel]));
  const genders = tally(products.flatMap((p) => p.gender));
  const surfaces = tally(products.flatMap((p) => (p.surface ? [p.surface] : [])));
  const colours = tally(products.flatMap((p) => p.colours));
  const sizes = tally(products.flatMap((p) => p.sizes));

  const orderedSizes = [...sizes.keys()].sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b));
  const prices = products.map((p) => p.price);

  return {
    // Driven by the product's `type:` tag (see fromShopifyCard), so it matches the card label.
    category: [...categories.entries()]
      .map(([value, count]) => ({ value, label: categoryLabels.get(value) ?? value, count }))
      .sort((a, b) => b.count - a.count),
    gender: [...genders.entries()].map(([value, count]) => ({ value, count })),
    surface: [...surfaces.entries()].map(([value, count]) => ({ value, count })),
    colour: [...colours.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count),
    size: orderedSizes.map((value) => ({ value, count: sizes.get(value)! })),
    priceMin: prices.length ? Math.floor(Math.min(...prices)) : 0,
    priceMax: prices.length ? Math.ceil(Math.max(...prices)) : 0,
  };
}

export type Facets = ReturnType<typeof buildFacets>;

export type ListingKind = "all" | "category" | "surface" | "club" | "new" | "sale" | "collection";

export type ListingScope = {
  title: string;
  kind: ListingKind;
  description?: string;
  products: CatalogProduct[];
  facets: Facets;
};

export type CategoryTile = {
  id: string;
  label: string;
  href: string;
  count: number | null;
  image: CatalogImage | null;
};

export type HomeCatalog = {
  newArrivals: CatalogProduct[];
  popular: CatalogProduct[];
  categories: CategoryTile[];
  surfaces: CategoryTile[];
  clubs: CategoryTile[];
};
