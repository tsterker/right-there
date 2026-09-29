import { useEffect, useRef, useState } from 'react';
import { sub, type Vec } from '../../shared/geometry';
import { recentMove } from '../../shared/nudge';
import type { Target } from '../../shared/session';

export interface Heading {
  /** Which way the spot is going right now (body cm). */
  d: Vec;
  /** One per stroke. */
  id: string;
  /** The finger is still moving. */
  live: boolean;
}

/** Which way the current nudge is going, in real time; once the finger lifts, its last direction. */
export function useHeading(target: Target | null): Heading | null {
  const [heading, setHeading] = useState<Heading | null>(null);
  const stroke = useRef<{ id: string; samples: { p: Vec; t: number }[] } | null>(null);
  useEffect(() => {
    if (!target || target.source !== 'nudge' || !target.from) {
      stroke.current = null;
      setHeading(null);
      return;
    }
    const from = target.from;
    const id = `${from.x},${from.y}`;
    const t = performance.now();
    if (stroke.current?.id !== id) stroke.current = { id, samples: [{ p: from, t: t - 1 }] };
    const s = stroke.current;
    s.samples = [...s.samples.filter((q) => t - q.t < 600), { p: target.pos, t }];
    const d = recentMove(s.samples);
    setHeading((prev) => {
      const same = prev?.id === id ? prev : null;
      if (!target.active) return same ? { ...same, live: false } : d ? { d, id, live: false } : null;
      // A pause keeps the last direction instead of flickering.
      const dir = d ?? same?.d ?? sub(target.pos, from);
      return { d: dir, id, live: true };
    });
  }, [target]);
  return heading;
}
