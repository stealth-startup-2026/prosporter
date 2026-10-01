import Link from "next/link";
import type { NewsCategory } from "@/lib/news";

const CHIP =
  "inline-flex rounded-full bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-green-deep";

/**
 * Small uppercase News category label. A plain label on listing cards (the
 * whole card is already a link); a link to the filtered listing on a post.
 */
export function CategoryChip({ category, href }: { category: NewsCategory; href?: string }) {
  return href ? (
    <Link href={href} className={`${CHIP} transition-colors hover:bg-surface-2`}>
      {category.label}
    </Link>
  ) : (
    <span className={CHIP}>{category.label}</span>
  );
}
