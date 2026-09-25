"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  findVariant,
  isSizeOption,
  type CatalogProductDetail,
} from "@/lib/catalog-view";
import { formatPrice, formatPriceRange, swatchFor } from "@/lib/format";
import { clampQuantity, isLowStock, maxAddable, stockCeiling } from "@/lib/cart-quantity";
import { useCart } from "@/components/cart/CartProvider";
import { track, viewItemParams } from "@/lib/analytics";
import { PLACEHOLDER_IMAGE } from "@/components/product/placeholder";
import { CheckIcon, ChevronDown, MinusIcon, PlusIcon } from "@/components/icons";

/** Disclosure: button and panel wired together with aria-expanded/controls. */
function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const uid = useId();
  const buttonId = `accordion-button-${uid}`;
  const panelId = `accordion-panel-${uid}`;
  return (
    <div className="border-b border-line">
      <h2>
        <button
          type="button"
          id={buttonId}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between py-4 text-left"
          aria-expanded={open}
          aria-controls={panelId}
        >
          <span className="text-sm font-semibold text-ink">{title}</span>
          <ChevronDown
            width={18}
            height={18}
            aria-hidden="true"
            className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </h2>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
        className="pb-4 text-sm leading-relaxed text-muted"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Pre-selects the options of the one purchasable variant, when there is exactly
 * one (QA defect D9). Anything ambiguous — no options, several variants in
 * stock, or a variant that does not name every option — starts unselected, so
 * the shopper still makes the choice the product actually offers.
 */
function defaultSelection(product: CatalogProductDetail): Record<string, string> {
  if (product.options.length === 0) return {};
  const purchasable = product.variants.filter((v) => v.available);
  if (purchasable.length !== 1) return {};
  const only = purchasable[0];
  const selection: Record<string, string> = {};
  for (const option of product.options) {
    const chosen = only.selectedOptions.find((o) => o.name === option.name);
    if (!chosen) return {};
    selection[option.name] = chosen.value;
  }
  return selection;
}

export function ProductDetail({ product }: { product: CatalogProductDetail }) {
  const { add, addVariant, isPending, lines } = useCart();
  const [selection, setSelection] = useState<Record<string, string>>(() =>
    defaultSelection(product),
  );
  // Null until the shopper picks a thumbnail; a variant image wins until then.
  const [pickedImage, setPickedImage] = useState<number | null>(null);
  const zoomRef = useRef<HTMLDivElement | null>(null);
  const [added, setAdded] = useState(false);
  // Desired add quantity. Kept as the raw value the shopper asked for; the
  // stock-aware clamp happens during render (`qty` below), and `choose` resets
  // it to 1 whenever the variant changes.
  const [quantity, setQuantity] = useState(1);
  const uid = useId();
  const hintId = `pdp-hint-${uid}`;
  const qtyId = `pdp-qty-${uid}`;
  const stockHintId = `pdp-stock-${uid}`;

  /**
   * GA4 view_item (CLNT-179): once per product, not once per variant click.
   * The handle in a ref is what makes that true — the effect re-runs on a
   * client-side navigation to another product (same component instance, new
   * props) but not on a size or colour change, and Strict Mode's double
   * invocation in development sends nothing extra. A single-variant product
   * reports that variant so `item_id` is its SKU; a multi-variant one reports
   * product-level identity, because no variant has been chosen yet.
   */
  const viewedHandle = useRef<string | null>(null);
  useEffect(() => {
    if (viewedHandle.current === product.handle) return;
    viewedHandle.current = product.handle;
    track(
      "view_item",
      viewItemParams(product, product.variants.length === 1 ? product.variants[0] : null),
    );
  }, [product]);

  const variant = findVariant(product, selection);
  const needsSelection = product.options.length > 0;
  const complete = product.options.every((o) => selection[o.name]);
  const images = product.images.length ? product.images : product.image ? [product.image] : [];
  const hero =
    (pickedImage === null ? variant?.image : null) ?? images[pickedImage ?? 0] ?? images[0] ?? null;

  const price = variant?.price ?? product.price;
  const compareAt = variant?.compareAtPrice ?? product.compareAtPrice;
  const inStock = variant ? variant.available : product.inStock;
  const sizeOption = product.options.find((o) => isSizeOption(o.name));

  /**
   * "Add to bag" stays disabled until a purchasable variant is on the table
   * (QA defect D9). Before, the button was live and a click did nothing except
   * push a message into the live region; now the button label carries the same
   * instruction where a sighted shopper reads it, and the live region below
   * still announces the variant once the choice is complete.
   */
  const optionNames = product.options.map((o) => o.name.toLowerCase());
  const chooseHint = `Choose ${optionNames.join(" and ")}`;
  const awaitingSelection = needsSelection && !complete;
  const canAdd = inStock && !awaitingSelection;

  /**
   * Quantity ceiling. `quantityAvailable` is authoritative when Shopify reports
   * it (this store's token has the inventory scope); it falls back to a soft
   * max on any buyable variant otherwise. We subtract what the bag already holds
   * of this exact variant so cart qty + new qty can never exceed stock.
   */
  const variantId = variant?.id ?? product.variantId;
  const inCart = variantId
    ? lines.reduce((n, l) => (l.merchandise.id === variantId ? n + l.quantity : n), 0)
    : 0;
  const variantStock = variant ? variant.quantityAvailable : null;
  const stockCap = maxAddable(variantStock, inStock, inCart);
  // Clamp during render rather than in an effect (react-hooks/set-state-in-effect);
  // a shrinking cap (e.g. after adding from the drawer) corrects the display here.
  const qty = clampQuantity(quantity, stockCap);
  const addable = canAdd && stockCap > 0;
  // In stock and selected, but every unit is already in the bag.
  const atCapacity = canAdd && stockCap === 0;
  const totalStock = stockCeiling(variantStock, inStock);
  const lowStock = variant ? isLowStock(variant.quantityAvailable, variant.available) : false;
  const maxedMessage =
    atCapacity && totalStock > 0
      ? `You already have all ${totalStock} in your bag.`
      : null;
  const lowStockHint =
    addable && lowStock && totalStock > 0 ? `Only ${totalStock} left` : null;

  /** Does any purchasable variant carry this option value? */
  const valueAvailable = (optionName: string, value: string) => {
    if (product.variants.length === 0) return true;
    return product.variants.some(
      (v) =>
        v.available &&
        v.selectedOptions.some((o) => o.name === optionName && o.value === value),
    );
  };

  const choose = (option: string, value: string) => {
    setSelection((s) => ({ ...s, [option]: value }));
    setPickedImage(null);
    // A new variant has its own stock; start the stepper back at one.
    setQuantity(1);
  };

  const handleAdd = () => {
    // Belt and braces: the button is disabled in this state, so this only
    // guards a programmatic click.
    if (!addable) return;
    if (variantId) {
      addVariant(variantId, qty);
    } else {
      // Mock catalog: no Shopify variant to add, so the drawer shim runs.
      add({
        slug: product.handle,
        name: product.title,
        price,
        image: hero?.url ?? PLACEHOLDER_IMAGE,
        size: product.options.map((o) => selection[o.name]).filter(Boolean).join(" / ") || null,
        qty,
      });
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  };

  // Announced when the shopper's selection changes the price or availability.
  const selectionStatus = variant
    ? `${variant.title === product.title ? "Selected" : variant.title}: ${formatPrice(
        price,
        product.currency,
      )}, ${variant.available ? "in stock" : "sold out"}.`
    : needsSelection
      ? "No variant selected yet."
      : `${formatPrice(price, product.currency)}, ${inStock ? "in stock" : "sold out"}.`;

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
      {/* Gallery.
          `min-w-0` is load-bearing: a grid item's automatic minimum size is its
          min-content width, and the thumbnail strip below is a nowrap flex row
          of 80 px tiles, so without it a product with several images widens the
          whole document instead of scrolling inside the strip (QA defect D1). */}
      <div className="min-w-0">
        {/* Hover zoom: on a mouse (pointer-fine) the photo scales 2x and pans
            with the cursor by moving transform-origin. Touch devices skip it. */}
        <div
          className={`group relative aspect-[4/5] overflow-hidden rounded-card bg-surface ${
            hero ? "pointer-fine:cursor-zoom-in" : ""
          }`}
          onMouseMove={(e) => {
            const zoom = zoomRef.current;
            if (!zoom || !hero) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            zoom.style.transformOrigin = `${x}% ${y}%`;
          }}
        >
          <div
            ref={zoomRef}
            className={`absolute inset-0 transition-transform duration-200 ease-out ${
              hero ? "pointer-fine:group-hover:scale-[2]" : ""
            }`}
          >
            <Image
              src={hero?.url ?? PLACEHOLDER_IMAGE}
              alt={hero ? hero.alt || product.title : "No photo available yet"}
              fill
              unoptimized={!hero}
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
          {product.onSale && (
            <span className="absolute left-4 top-4 rounded-full bg-green-deep px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-paper">
              Sale
            </span>
          )}
        </div>
        {images.length > 1 && (
          <ul
            aria-label={`${product.title} images`}
            className="mt-3 flex w-full max-w-full gap-3 overflow-x-auto pb-1"
          >
            {images.map((img, i) => {
              const current = hero?.url === img.url;
              return (
                <li key={img.url} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setPickedImage(i)}
                    aria-label={`Show image ${i + 1} of ${images.length}${
                      img.alt ? `: ${img.alt}` : ""
                    }`}
                    aria-current={current ? "true" : undefined}
                    aria-pressed={current}
                    className={`relative block aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-card bg-surface ring-inset transition-all ${
                      current ? "ring-2 ring-ink" : "ring-1 ring-line hover:ring-muted"
                    }`}
                  >
                    <Image src={img.url} alt="" fill sizes="80px" className="object-cover" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Info */}
      <div className="lg:py-2">
        <p className="eyebrow text-subtle">{product.categoryLabel}</p>
        <h1 className="mt-2 display text-3xl sm:text-4xl">{product.title}</h1>
        <p className="mt-4 flex items-baseline gap-3 text-2xl font-semibold tabular-nums">
          <span>
            {variant
              ? formatPrice(price, product.currency)
              : formatPriceRange(product.price, product.maxPrice, product.currency)}
          </span>
          {compareAt != null && compareAt > price && (
            <span className="text-base font-normal text-subtle line-through">
              <span className="sr-only">Was </span>
              {formatPrice(compareAt, product.currency)}
            </span>
          )}
        </p>

        {/* Price / availability for the current selection. */}
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {selectionStatus}
        </p>

        {/* Tags */}
        <div className="mt-4 flex flex-wrap gap-2">
          {product.surface && (
            <span className="rounded-full border border-line px-3 py-1 text-xs font-medium capitalize text-muted">
              {product.surface}
            </span>
          )}
          {product.gender
            .filter((g) => g.toLowerCase() !== "unisex")
            .map((g) => (
              <span
                key={g}
                className="rounded-full border border-line px-3 py-1 text-xs font-medium capitalize text-muted"
              >
                {g}
              </span>
            ))}
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              inStock ? "bg-green-deep/10 text-green-deep" : "bg-surface-2 text-muted"
            }`}
          >
            {inStock ? "In stock" : "Sold out"}
          </span>
        </div>

        {/* Options — a simple product has none and shows no selector.
            Each option is a radio group: one tab stop, arrow keys move between
            values, and the inputs are visually hidden behind styled labels. */}
        {product.options.map((option, optionIndex) => {
          const swatches =
            product.colours.length > 0 && option.values.every((v) => product.colours.includes(v));
          const groupName = `option-${uid}-${optionIndex}`;
          return (
            <fieldset key={option.name} className="mt-6">
              {/* Visually hidden legend names the group; the visible heading is
                  aria-hidden so the option name is not announced twice. */}
              <legend className="sr-only">{option.name}</legend>
              <div className="mb-2 flex items-center justify-between">
                <p className="eyebrow text-ink" aria-hidden="true">
                  {option.name}
                  {selection[option.name] && (
                    <span className="text-subtle"> · {selection[option.name]}</span>
                  )}
                </p>
                {isSizeOption(option.name) && (
                  <Link
                    href="/size-guide"
                    className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
                  >
                    Size guide
                  </Link>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {option.values.map((value) => {
                  const active = selection[option.name] === value;
                  const soldOut = !valueAvailable(option.name, value);
                  const input = (
                    <input
                      type="radio"
                      name={groupName}
                      value={value}
                      checked={active}
                      onChange={() => choose(option.name, value)}
                      className="peer sr-only"
                    />
                  );
                  return swatches ? (
                    <label key={value} className="cursor-pointer" title={value}>
                      {input}
                      <span className="sr-only">
                        {value}
                        {soldOut ? " (sold out)" : ""}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`block h-8 w-8 rounded-full ring-inset transition-all peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-green-deep ${
                          active
                            ? "ring-2 ring-ink ring-offset-2 ring-offset-paper"
                            : "ring-1 ring-line hover:ring-muted"
                        } ${soldOut ? "opacity-40" : ""}`}
                        style={{ background: option.swatches?.[value] ?? swatchFor(value) }}
                      />
                    </label>
                  ) : (
                    <label key={value} className="cursor-pointer">
                      {input}
                      <span
                        className={`block min-w-[52px] rounded-md border px-3 py-2.5 text-center text-sm font-medium transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-green-deep ${
                          active
                            ? "border-ink bg-ink text-paper"
                            : "border-line bg-paper text-ink hover:border-muted"
                        } ${soldOut && !active ? "text-subtle line-through" : ""}`}
                      >
                        {value}
                        {soldOut && <span className="sr-only"> (sold out)</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
        {awaitingSelection && (
          <p id={hintId} className="mt-3 text-xs font-medium text-muted">
            {chooseHint} to add this to your bag.
          </p>
        )}

        {/* Quantity stepper — real number input flanked by −/+ buttons, styled
            to match the size chips. Shown only once a purchasable variant is on
            the table and there is headroom to add; when the bag already holds
            all the stock, the maxed message below replaces it. */}
        {addable && (
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor={qtyId} className="eyebrow text-ink">
                Quantity
              </label>
              {lowStockHint && (
                <span id={stockHintId} className="text-xs font-medium text-green-deep">
                  {lowStockHint}
                </span>
              )}
            </div>
            <div className="inline-flex items-center rounded-full border border-line">
              <button
                type="button"
                onClick={() => setQuantity(clampQuantity(qty - 1, stockCap))}
                disabled={qty <= 1}
                aria-disabled={qty <= 1}
                aria-label="Decrease quantity"
                className="grid h-11 w-11 place-items-center rounded-full text-ink transition-colors hover:text-green-deep disabled:opacity-40"
              >
                <MinusIcon width={16} height={16} aria-hidden="true" />
              </button>
              <input
                id={qtyId}
                type="number"
                inputMode="numeric"
                min={1}
                max={stockCap}
                step={1}
                value={qty}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (Number.isFinite(next)) setQuantity(next);
                }}
                // Normalise a mid-edit value (blank, over the cap) on blur.
                onBlur={() => setQuantity(qty)}
                aria-label="Quantity"
                aria-describedby={lowStockHint ? stockHintId : undefined}
                className="w-12 border-0 bg-transparent text-center text-sm font-medium tabular-nums text-ink outline-none [appearance:textfield] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-deep [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <button
                type="button"
                onClick={() => setQuantity(clampQuantity(qty + 1, stockCap))}
                disabled={qty >= stockCap}
                aria-disabled={qty >= stockCap}
                aria-label="Increase quantity"
                className="grid h-11 w-11 place-items-center rounded-full text-ink transition-colors hover:text-green-deep disabled:opacity-40"
              >
                <PlusIcon width={16} height={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
        {maxedMessage && (
          <p id={stockHintId} className="mt-6 text-sm font-medium text-muted">
            {maxedMessage}
          </p>
        )}

        {/* Add to cart */}
        <button
          type="button"
          onClick={handleAdd}
          disabled={!addable || isPending}
          aria-disabled={!addable || isPending}
          aria-busy={isPending}
          aria-describedby={
            awaitingSelection ? hintId : atCapacity ? stockHintId : undefined
          }
          className={`mt-7 flex w-full items-center justify-center gap-2 rounded-full px-6 py-4 text-sm font-semibold transition-colors ${
            !addable
              ? "cursor-not-allowed bg-surface-2 text-subtle"
              : added
                ? "bg-green-deep text-paper"
                : "bg-ink text-paper hover:bg-ink-2"
          }`}
        >
          {!inStock ? (
            "Sold out"
          ) : awaitingSelection ? (
            chooseHint
          ) : atCapacity ? (
            "All in your bag"
          ) : isPending ? (
            "Adding…"
          ) : added ? (
            <>
              <CheckIcon width={18} height={18} aria-hidden="true" /> Added to bag
            </>
          ) : (
            `Add ${qty > 1 ? `${qty} ` : ""}to bag · ${formatPrice(price * qty, product.currency)}`
          )}
        </button>

        {/* Details */}
        <div className="mt-8">
          <Accordion title="Product details">
            {product.descriptionHtml ? (
              <div
                className="product-description"
                dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
              />
            ) : (
              <p>{product.description || product.seo.description || product.title}</p>
            )}
          </Accordion>
          {product.details.personalisation && (
            <Accordion title="Personalisation">
              {product.details.personalisation.join(", ")}
            </Accordion>
          )}
          <Accordion title="Shipping &amp; returns">
            <div className="space-y-3">
              <p>
                <strong className="font-semibold text-ink">
                  Free standard shipping
                </strong>{" "}
                on orders over $150.
              </p>
              <p>
                <strong className="font-semibold text-ink">
                  7-day change-of-mind returns
                </strong>{" "}
                on unworn items with tags attached.
              </p>
              <p>
                A{" "}
                <strong className="font-semibold text-ink">
                  $20 fee applies per jersey printed with a number and/or
                  surname
                </strong>{" "}
                for change-of-mind returns or exchanges.
              </p>
              <p>
                This fee does not apply to remedies required under Australian
                Consumer Law. Your statutory rights are unaffected.
              </p>
              <p>Checkout is securely completed on prosporter.com.au.</p>
            </div>
          </Accordion>
          <Accordion title="Sizing">
            {product.details.size_guide ? (
              product.details.size_guide.join(" ")
            ) : (
              <>
                Available sizes:{" "}
                {sizeOption ? sizeOption.values.join(", ") : "One size"}. Not sure? Check the size
                guide above or get in touch with the team.
              </>
            )}
          </Accordion>
        </div>
      </div>
    </div>
  );
}
