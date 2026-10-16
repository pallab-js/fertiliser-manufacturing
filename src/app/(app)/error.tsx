"use client";

import { useEffect } from "react";

/** Branded error boundary (ui-ux-guide §6: magenta-bordered panel + retry).
 *  Next.js passes `error` and `reset()` automatically. */
export default function Error({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Error boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-ink">
      <div className="border border-magenta panel text-center max-w-md w-full">
        <h2 className="text-heading-sm uppercase mb-2">Something went wrong</h2>
        <p className="mb-4 text-ink/70">
          We ran into an unexpected error. Please try again.
        </p>
        <button onClick={() => reset()} className="btn-primary">
          Try again
        </button>
      </div>
    </div>
  );
}
