"use client";

import { useEffect, useRef } from "react";

/** Native <dialog> — focus trap, Esc-to-close, backdrop for free. */
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

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

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
