import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import { promoToRender } from "@/lib/promo";
import { PromoGate } from "./PromoGate";

/**
 * Site-wide bar for a time-limited sale (CLNT-595).
 *
 * It sits above the sticky header rather than inside it, so it leads every page
 * and then scrolls away: the header keeps its height and nothing covers the
 * menu. One sentence that ends in its link, and the whole bar is that link, so
 * it is an easy target on a phone.
 */
export function PromoBar() {
  const promo = promoToRender();
  if (!promo) return null;

  return (
    <PromoGate id="promo-bar" window={promo.window} className="bg-ink text-paper" modalBackground>
      <Link href={promo.href} className="group block">
        <span className="mx-auto flex min-h-11 max-w-[1400px] items-center justify-center px-4 py-2 sm:px-6 lg:px-8">
          <span className="text-center text-sm text-balance">
            <span className="font-medium sm:hidden">{promo.bar.shortText}</span>
            <span className="hidden font-medium sm:inline">{promo.bar.text}</span>{" "}
            <span className="ml-1 inline-flex items-center gap-1 font-semibold whitespace-nowrap text-neon underline-offset-4 group-hover:underline">
              {promo.bar.linkLabel}
              <ArrowRight width={16} height={16} />
            </span>
          </span>
        </span>
      </Link>
    </PromoGate>
  );
}
