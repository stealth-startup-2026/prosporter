import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import { promoToRender } from "@/lib/promo";
import { PromoGate } from "./PromoGate";

/**
 * Home-page banner for a time-limited sale (CLNT-595): the client's poster set
 * in the site's own type. The offer on the left, the discount tiers as a list on
 * the right, the exclusions underneath. Sits between the hero and the category
 * grid, and leaves no gap behind when the sale ends.
 */
export function PromoBanner() {
  const promo = promoToRender();
  if (!promo) return null;
  const { banner } = promo;

  return (
    <PromoGate id="promo-banner" window={promo.window}>
      <section
        aria-labelledby="promo-banner-heading"
        className="mx-auto max-w-[1400px] px-4 pt-10 sm:px-6 sm:pt-16 lg:px-8"
      >
        <div className="grid gap-x-14 gap-y-8 rounded-card bg-ink p-6 text-paper sm:p-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center lg:p-12">
          <div>
            <p className="eyebrow text-neon">{banner.eyebrow}</p>
            <h2 id="promo-banner-heading" className="display mt-3 text-4xl sm:text-5xl lg:text-6xl">
              {banner.heading}
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-surface-2">{banner.body}</p>
            <Link
              href={promo.href}
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-paper px-6 py-3.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-2"
            >
              {banner.ctaLabel}
              <ArrowRight width={18} height={18} />
            </Link>
          </div>

          <dl className="divide-y divide-paper/15 border-y border-paper/15">
            {banner.tiers.map((tier) => (
              <div
                key={tier.discount}
                className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-4 py-3.5 sm:grid-cols-[7rem_minmax(0,1fr)]"
              >
                <dt className="display text-lg text-neon sm:text-xl">{tier.discount}</dt>
                <dd className="text-sm leading-relaxed text-surface-2">{tier.items}</dd>
              </div>
            ))}
          </dl>

          <p className="text-xs leading-relaxed text-subtle lg:col-span-2">{banner.finePrint}</p>
        </div>
      </section>
    </PromoGate>
  );
}
