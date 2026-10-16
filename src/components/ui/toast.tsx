"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Success/error toast driven by an action result (FR-031).
 *  Auto-dismisses 4s after each new message; re-shows if the same text
 *  fires again. Timer pauses on hover so errors can be read. Renders nothing
 *  without a message. */
export function Toast({ message, error = false }: { message?: string; error?: boolean }) {
  const [hidden, setHidden] = useState(false);
  const [lastMsg, setLastMsg] = useState(message);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Documented "reset state during render" pattern for a new message.
  if (message !== lastMsg) {
    setLastMsg(message);
    setHidden(false);
    setPaused(false);
  }

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const startTimer = useCallback(() => {
    if (!message || hidden || paused) return;
    clearTimer();
    timer.current = setTimeout(() => setHidden(true), 4000);
  }, [message, hidden, paused, clearTimer]);

  // (Re)start the auto-dismiss timer whenever the message or visibility changes.
  useEffect(() => {
    startTimer();
    return () => clearTimer();
  }, [message, hidden, startTimer, clearTimer]);

  if (!message || hidden) return null;

  return (
    <div
      className="toast fixed right-6 bottom-6 z-50 flex items-center gap-3" role="status"
      onMouseEnter={() => {
        setPaused(true);
        clearTimer();
      }}
      onMouseLeave={() => {
        setPaused(false);
        startTimer();
      }}
    >
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${error ? "bg-magenta" : "bg-link"}`}
      />
      {message}
    </div>
  );
}
