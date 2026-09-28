import { useEffect, useRef, useState } from 'react';
import type { Vec } from '../../shared/geometry';
import type { Target } from '../../shared/session';

/** Recent target positions for a fading trail; restarts with each new stroke or jump. */
export function useTrail(target: Target | null, keepMs = 2500): Vec[] {
  const [trail, setTrail] = useState<{ p: Vec; t: number }[]>([]);
  const wasActive = useRef(false);
  useEffect(() => {
    if (!target) return;
    const t = performance.now();
    const fresh = target.source === 'anchor' || (target.active && !wasActive.current);
    wasActive.current = target.active;
    setTrail((tr) => (fresh ? [{ p: target.pos, t }] : [...tr.filter((q) => t - q.t < keepMs), { p: target.pos, t }].slice(-90)));
  }, [target, keepMs]);
  useEffect(() => {
    if (!trail.length) return;
    const id = window.setTimeout(() => setTrail((tr) => tr.filter((q) => performance.now() - q.t < keepMs)), 400);
    return () => window.clearTimeout(id);
  }, [trail, keepMs]);
  return trail.map((q) => q.p);
}
