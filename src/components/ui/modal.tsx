"use client";

import { useCallback, useEffect, useRef } from "react";

/** Native <dialog> with a focus trap: focus moves into the dialog on open,
 *  Tab cycles within it, and focus returns to the triggering element on close. */
const FOCUSABLE = [
  "button",
  "input",
  "select",
  "textarea",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  const focusFirst = useCallback(() => {
    const d = ref.current;
    if (!d) return;
    const focusables = d.querySelectorAll<HTMLElement>(FOCUSABLE);
    const closeBtn = d.querySelector<HTMLElement>('button[aria-label="Close"]');
    const target = focusables[0] ?? closeBtn ?? null;
    if (target) target.focus({ preventScroll: true });
  }, []);

  const trap = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const d = ref.current;
      if (!d || !d.open) return;
      const focusables = Array.from(d.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) return;
      e.preventDefault();
      const index = focusables.indexOf(document.activeElement as HTMLElement);
      const next =
        index === -1
          ? 0
          : (index + (e.shiftKey ? -1 : 1) + focusables.length) %
            focusables.length;
      focusables[next].focus({ preventScroll: true });
    },
    [],
  );

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      prevFocus.current = document.activeElement as HTMLElement | null;
      d.showModal();
      d.addEventListener("keydown", trap);
      requestAnimationFrame(focusFirst);
    } else {
      d.removeEventListener("keydown", trap);
      d.close();
      prevFocus.current?.focus?.({ preventScroll: true });
      prevFocus.current = null;
    }
    return () => d.removeEventListener("keydown", trap);
  }, [open, trap, focusFirst]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="w-full max-w-lg bg-canvas p-6 text-ink shadow-float backdrop:bg-[rgba(10,13,58,0.7)] backdrop:backdrop-blur-sm open:flex open:flex-col"
      aria-labelledby="modal-title"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 id="modal-title" className="text-heading-sm uppercase">
          {title}
        </h2>
        <button className="btn-ghost-sm" onClick={() => ref.current?.close()} aria-label="Close">
          ✕
        </button>
      </div>
      {children}
    </dialog>
  );
}
