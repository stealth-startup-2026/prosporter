"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CloseIcon } from "@/components/icons";
import type { GalleryImage } from "@/lib/article-gallery";
import { useModalDialog } from "@/lib/hooks/useModalDialog";

/**
 * Full-screen photo viewer for a News post.
 *
 * The cover and the article body stay server markup, passed in as `children`.
 * Every photo in them is a `<button data-gallery-index="n">` (the body's are
 * written by `src/lib/article-gallery.ts`), and one delegated click handler
 * here opens the viewer at that photo, the same island pattern as
 * `MobileMenuPanel`. Keyboard users reach the same buttons with Tab and Enter.
 *
 * The viewer is a real modal (`useModalDialog`: focus moves in, Tab is trapped,
 * Escape closes, the page behind is inert and scroll-locked, focus returns to
 * the photo that opened it). Left/right arrow keys and a horizontal swipe step
 * through the photos; the counter is announced as it changes.
 */
export function PhotoLightbox({ photos, children }: { photos: GalleryImage[]; children: React.ReactNode }) {
  const [index, setIndex] = useState<number | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const close = useCallback(() => setIndex(null), []);

  const onClick = (event: React.MouseEvent<HTMLElement>) => {
    const trigger =
      event.target instanceof Element ? event.target.closest<HTMLElement>("[data-gallery-index]") : null;
    if (!trigger) return;
    const i = Number(trigger.dataset.galleryIndex);
    if (!Number.isInteger(i) || !photos[i]) return;
    event.preventDefault();
    openerRef.current = trigger;
    setIndex(i);
  };

  return (
    <div onClick={onClick}>
      {children}
      {index !== null &&
        createPortal(
          <Viewer photos={photos} index={index} onIndex={setIndex} onClose={close} openerRef={openerRef} />,
          document.body,
        )}
    </div>
  );
}

const SWIPE_PX = 50;

function Viewer({
  photos,
  index,
  onIndex,
  onClose,
  openerRef,
}: {
  photos: GalleryImage[];
  index: number;
  onIndex: React.Dispatch<React.SetStateAction<number | null>>;
  onClose: () => void;
  openerRef: RefObject<HTMLElement | null>;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const count = photos.length;

  // Portalled to <body>, so its siblings are the header, main and footer.
  useModalDialog({ open: true, panelRef, rootRef, onClose, inertSiblings: true, openerRef });

  const step = useCallback(
    (delta: number) => onIndex((current) => (((current ?? 0) + delta) % count + count) % count),
    [count, onIndex],
  );

  useEffect(() => {
    if (count < 2) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [count, step]);

  const photo = photos[index];

  return (
    <div ref={rootRef} className="fixed inset-0 z-[100]">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Photo viewer"
        tabIndex={-1}
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const start = touchStartX.current;
          touchStartX.current = null;
          const end = event.changedTouches[0]?.clientX;
          if (start === null || end === undefined || count < 2) return;
          const dx = end - start;
          if (Math.abs(dx) > SWIPE_PX) step(dx < 0 ? 1 : -1);
        }}
        className="absolute inset-0 flex flex-col bg-ink text-paper outline-none"
      >
        <div className="flex items-center justify-between px-4 py-3 sm:px-6">
          <p className="text-sm font-medium tabular-nums" aria-live="polite">
            <span className="sr-only">Photo </span>
            {index + 1} / {count}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close photo viewer"
            className="-mr-2 grid h-11 w-11 place-items-center rounded-full transition-colors hover:bg-paper/10"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 sm:px-20">
          {/* Already a sized Shopify CDN URL (or a local mock photo). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={photo.src}
            src={photo.src}
            alt={photo.alt}
            width={photo.width ?? undefined}
            height={photo.height ?? undefined}
            className="max-h-full w-auto max-w-full select-none rounded-card object-contain"
          />
          {count > 1 && (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous photo"
                className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-ink/60 transition-colors hover:bg-paper/15 sm:left-4"
              >
                <ArrowRight className="rotate-180" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next photo"
                className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-ink/60 transition-colors hover:bg-paper/15 sm:right-4"
              >
                <ArrowRight />
              </button>
            </>
          )}
        </div>

        {/* The alt text doubles as the caption; hidden from AT, which already reads it on the image. */}
        <p aria-hidden="true" className="min-h-14 px-6 py-4 text-center text-sm text-paper/80">
          {photo.alt}
        </p>
      </div>
    </div>
  );
}
