import { useEffect, useState } from 'react';

/** Re-render every `intervalMs` with the current time (server time if `now` is the session clock). */
export function useNow(intervalMs = 1000, now: () => number = Date.now): number {
  const [t, setT] = useState(now);
  useEffect(() => {
    const id = window.setInterval(() => setT(now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, now]);
  return t;
}

export const formatClock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const formatMinutes = (ms: number) => {
  const m = ms / 60000;
  return m < 1 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${m < 10 ? m.toFixed(1).replace('.0', '') : Math.round(m)} min`;
};
