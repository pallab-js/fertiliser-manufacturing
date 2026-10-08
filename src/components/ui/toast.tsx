"use client";

import { useEffect, useState } from "react";

/** Success/error toast driven by an action result (FR-031).
 *  Auto-dismisses 4s after each new message; re-shows if the same text
 *  fires again. Renders nothing without a message. */
export function Toast({ message, error = false }: { message?: string; error?: boolean }) {
  const [hidden, setHidden] = useState(false);
  const [lastMsg, setLastMsg] = useState(message);

  // Reset during render when a new message arrives (react.dev "adjust state
  // during render") — avoids setState-in-effect.
  if (message !== lastMsg) {
    setLastMsg(message);
    setHidden(false);
  }

  useEffect(() => {
    if (!message || hidden) return;
    const t = setTimeout(() => setHidden(true), 4000);
    return () => clearTimeout(t);
  }, [message, hidden]);

  if (!message || hidden) return null;

  return (
    <div className="toast fixed right-6 bottom-6 z-50 flex items-center gap-3" role="status">
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${error ? "bg-magenta" : "bg-link"}`}
      />
      {message}
    </div>
  );
}
