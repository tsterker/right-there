import { useEffect, useState } from 'react';

/** Re-render every `intervalMs` with the current time (the host's clock if `now` is the session clock). */
export function useNow(intervalMs = 1000, now: () => number = Date.now): number {
  const [t, setT] = useState(now);
  useEffect(() => {
    const id = window.setInterval(() => setT(now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, now]);
  return t;
}
