"use client";

import { useSyncExternalStore } from "react";
import {
  isPromoActive,
  msUntilPromoChange,
  promoGuardScript,
  type PromoWindow,
} from "@/lib/promo";

/** setTimeout cannot count past 2^31 ms; a far-off change is re-armed in hops. */
const MAX_TIMER_MS = 2_000_000_000;

/**
 * True while the sale is on, by the shopper's own clock. The server always
 * answers true (it only renders a promo before its end), so the markup matches
 * during hydration and the real answer takes over straight after. No state is
 * set in an effect: the clock is an external store with one timer on it.
 */
function usePromoActive(window: PromoWindow): boolean {
  return useSyncExternalStore(
    (onChange) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const arm = () => {
        const wait = msUntilPromoChange(window, Date.now());
        if (wait === null) return;
        timer = setTimeout(
          () => {
            onChange();
            arm();
          },
          Math.min(wait, MAX_TIMER_MS),
        );
      };
      arm();
      return () => clearTimeout(timer);
    },
    () => isPromoActive(window, Date.now()),
    () => true,
  );
}

interface PromoGateProps {
  /** DOM id of the wrapper; the inline guard finds the element by it. */
  id: string;
  window: PromoWindow;
  className?: string;
  /** Set on a body-level promo so an open drawer or menu can inert it, as it
   *  does the header, main and footer. */
  modalBackground?: boolean;
  children: React.ReactNode;
}

/**
 * Shows its children only inside a sale's window (CLNT-595).
 *
 * The children are server-rendered markup passed straight through; this island
 * adds nothing to them but the clock. See `src/lib/promo.ts` for why the window
 * is checked here as well as on the server.
 */
export function PromoGate({
  id,
  window,
  className,
  modalBackground = false,
  children,
}: PromoGateProps) {
  const active = usePromoActive(window);
  if (!active) return null;
  return (
    // The inline guard below may set `hidden` before React hydrates.
    <div
      id={id}
      className={className}
      data-modal-background={modalBackground ? "" : undefined}
      suppressHydrationWarning
    >
      {children}
      <script dangerouslySetInnerHTML={{ __html: promoGuardScript(id, window) }} />
    </div>
  );
}
