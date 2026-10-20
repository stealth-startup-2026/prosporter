"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * The modal-dialog behaviour shared by the cart drawer, the mobile filter sheet
 * and the mobile menu (CLNT-171 accessibility pass).
 *
 * Everything here is imperative — no `setState` in the effect body, so
 * `react-hooks/set-state-in-effect` stays happy. The caller still owns the
 * markup (`role="dialog"`, `aria-modal`, `aria-labelledby`, `tabIndex={-1}` on
 * the panel and `inert` on the off-canvas root); this hook only owns the
 * behaviour that is identical in all three places:
 *
 *  - remember what was focused, then move focus to the panel itself so a screen
 *    reader announces the dialog name first;
 *  - trap Tab / Shift+Tab inside the panel and pull focus back if it escapes;
 *  - close on Escape;
 *  - lock body scroll;
 *  - optionally mark the page's own background regions `inert` (out of the tab
 *    order and hidden from assistive tech) — only siblings of the dialog root
 *    that carry `data-modal-background`, never nodes the app did not render
 *    (browser-extension hosts, Next's route announcer, scripts);
 *  - undo all of it on close and return focus to the opener.
 */

/**
 * Opt-in marker for body-level regions an open modal may inert: the skip link,
 * header, main, footer and the other off-canvas roots. Anything else at body
 * level (extension UI, `next-route-announcer`, scripts) is left untouched.
 */
export const MODAL_BACKGROUND_ATTR = "data-modal-background";

/** Everything a shopper can Tab to inside a panel, in DOM order. */
export const MODAL_FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export type ModalDialogOptions = {
  /** Whether the dialog is currently open. */
  open: boolean;
  /** The dialog panel: focus target and focus-trap boundary. */
  panelRef: RefObject<HTMLElement | null>;
  /** Called on Escape. */
  onClose: () => void;
  /**
   * The fixed-position root wrapping scrim + panel. Only needed when
   * `inertSiblings` is on: its siblings are what gets inerted.
   */
  rootRef?: RefObject<HTMLElement | null>;
  /**
   * Mark the siblings of `rootRef` that carry `data-modal-background` inert
   * while open. Default false.
   */
  inertSiblings?: boolean;
  /**
   * The control focus should return to. Defaults to whatever was focused when
   * the dialog opened.
   */
  openerRef?: RefObject<HTMLElement | null>;
};

export function useModalDialog({
  open,
  panelRef,
  onClose,
  rootRef,
  inertSiblings = false,
  openerRef,
}: ModalDialogOptions): void {
  // Read through a ref so a caller passing a new `onClose` each render does not
  // re-run the setup below (which moves focus and toggles `inert` on siblings).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const opener =
      openerRef?.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Background is inert while the dialog is open (blocks pointer, focus and
    // AT). Only the app's own regions are touched: inerting a node injected by
    // a browser extension can strand that extension's focus or measuring code.
    // Siblings that are already inert — a closed drawer sitting off-canvas —
    // are left alone so we never clear someone else's attribute.
    const inerted: HTMLElement[] = [];
    const root = rootRef?.current ?? null;
    if (inertSiblings && root?.parentElement) {
      for (const sibling of Array.from(root.parentElement.children)) {
        if (sibling === root || !(sibling instanceof HTMLElement)) continue;
        if (!sibling.hasAttribute(MODAL_BACKGROUND_ATTR)) continue;
        if (sibling.hasAttribute("inert")) continue;
        sibling.setAttribute("inert", "");
        inerted.push(sibling);
      }
    }

    panel.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      // `offsetParent === null` drops controls inside a collapsed (`hidden`)
      // panel, which are not tabbable anyway.
      const items = Array.from(panel.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (active instanceof HTMLElement && !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey, true);
      for (const el of inerted) el.removeAttribute("inert");
      opener?.focus({ preventScroll: true });
    };
  }, [open, panelRef, rootRef, inertSiblings, openerRef]);
}
