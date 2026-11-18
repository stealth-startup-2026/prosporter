/**
 * Time-limited sale promo (CLNT-595, Black Friday 2026).
 *
 * The site-wide bar and the home banner for a sale, tied to a start and an end
 * instant. The end is the point of this module: a sale banner somebody has to
 * remember to take down is a banner that is still up after the sale.
 *
 * Why the window is checked in the browser as well as on the server. Home,
 * shop and product pages are prerendered and revalidated by tag, so a page
 * rendered on the sale's last day can be served for days afterwards. The server
 * check keeps the promo out of anything rendered after the end; the browser
 * check (`isPromoActive` against the shopper's clock, plus the inline guard
 * from `promoGuardScript`) keeps it off pages rendered before the end and
 * served after it. Neither needs a deploy.
 *
 * Deliberately not `server-only`: it holds no secret, and the window maths is
 * unit-tested with plain Node (`src/lib/__tests__/promo.test.mjs`).
 */

export interface PromoWindow {
  /** First instant the promo shows (epoch ms). */
  startsAt: number;
  /** Exclusive: the promo is gone from this instant on (epoch ms). */
  endsAt: number;
}

export interface PromoTier {
  /** The headline of the row, e.g. "40% off". */
  discount: string;
  /** What it applies to, in the client's own words. */
  items: string;
}

export interface SalePromo {
  id: string;
  window: PromoWindow;
  /** Internal path the bar and the banner link to. */
  href: string;
  bar: { text: string; shortText: string; linkLabel: string };
  banner: {
    eyebrow: string;
    heading: string;
    body: string;
    tiers: PromoTier[];
    finePrint: string;
    ctaLabel: string;
  };
}

/**
 * Black Friday 2026, 16 to 30 November. Every line is from the client's poster.
 *
 * The window is midnight starting 16 November to midnight ending 30 November in
 * Sydney, written with its UTC offset (AEDT, +11:00) so it is the same instant
 * for a shopper in Perth or abroad.
 *
 * It is "selected training gear", not the whole store: playing jerseys and
 * shorts are excluded. The link goes to the shop index because the discounted
 * lines sit across Tops, Accessories and Hoodies & Jackets, and `/shop/sale`
 * only lists products with a compare-at price, which these do not have (the
 * discount is applied in the bag).
 */
export const BLACK_FRIDAY_2026: SalePromo = {
  id: "black-friday-2026",
  window: {
    startsAt: Date.parse("2026-11-16T00:00:00+11:00"),
    endsAt: Date.parse("2026-12-01T00:00:00+11:00"),
  },
  href: "/shop",
  bar: {
    text: "Black Friday Sale: up to 40% off selected training gear, 16 to 30 Nov",
    shortText: "Black Friday: up to 40% off selected gear, 16 to 30 Nov",
    linkLabel: "Shop now",
  },
  banner: {
    eyebrow: "Black Friday · 16 to 30 Nov",
    heading: "Up to 40% off",
    body: "Selected training gear and kit offers. Training kits from $35.",
    tiers: [
      { discount: "40% off", items: "Training shirts" },
      { discount: "30% off", items: "NINE Zero 2 tee, New Shield knee pads" },
      { discount: "25% off", items: "Brione tracksuits, Net sleeves, Jump Spin socks" },
      {
        discount: "20% off",
        items: "Cinque tees, sleeves, elbow pads, knee pads, Jump socks",
      },
    ],
    finePrint:
      "Excludes playing jerseys and shorts. While stocks last. The discount is applied in your bag.",
    ctaLabel: "Shop now",
  },
};

/** The promo this build carries. Null when there is none. */
export const CURRENT_PROMO: SalePromo | null = BLACK_FRIDAY_2026;

/**
 * The promo a server component should render right now, or null: none is
 * configured, or its sale is over. A server component renders once per request
 * or per revalidation, so reading the clock here is what keeps a finished sale
 * out of every page built after it; the browser half is `PromoGate`.
 */
export function promoToRender(now: number = Date.now()): SalePromo | null {
  const promo = CURRENT_PROMO;
  if (!promo || hasPromoEnded(promo.window, now)) return null;
  return promo;
}

/** True from the start instant up to, but not including, the end instant. */
export function isPromoActive(window: PromoWindow, now: number): boolean {
  return now >= window.startsAt && now < window.endsAt;
}

/** True once the sale is over. A promo that has ended is never rendered. */
export function hasPromoEnded(window: PromoWindow, now: number): boolean {
  return now >= window.endsAt;
}

/**
 * Milliseconds until the window next opens or closes, or null when it never
 * changes again. Lets an open tab drop the promo at the end without a reload.
 */
export function msUntilPromoChange(window: PromoWindow, now: number): number | null {
  if (now < window.startsAt) return window.startsAt - now;
  if (now < window.endsAt) return window.endsAt - now;
  return null;
}

/**
 * The inline guard printed straight after a promo element. It runs while the
 * page is still being parsed, so a cached page opened outside the window never
 * paints the promo at all, rather than showing it until React wakes up and
 * removes it. Only numbers and the element id are interpolated.
 */
export function promoGuardScript(elementId: string, window: PromoWindow): string {
  const start = String(Math.trunc(window.startsAt));
  const end = String(Math.trunc(window.endsAt));
  return `(function(){var n=Date.now();if(n<${start}||n>=${end}){var b=document.getElementById(${JSON.stringify(elementId)});if(b)b.hidden=true}})()`;
}
