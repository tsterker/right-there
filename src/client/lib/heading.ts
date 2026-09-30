import { useEffect, useRef, useState } from 'react';
import { sub, type Vec } from '../../shared/geometry';
import { recentMove } from '../../shared/nudge';
import type { Target } from '../../shared/session';

export interface Heading {
  /** Which way the spot is going right now (body cm). */
  d: Vec;
  /** How fast (cm/s). */
  speed: number;
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
    s.samples = [...s.samples.filter((q) => t - q.t < 1000), { p: target.pos, t }];
    const move = recentMove(s.samples);
    setHeading((prev) => {
      const same = prev?.id === id ? prev : null;
      if (!target.active) return same ? { ...same, live: false } : move ? { ...move, id, live: false } : null;
      // Before a clear direction, the stroke so far.
      return { d: move?.d ?? same?.d ?? sub(target.pos, from), speed: move?.speed ?? 0, id, live: true };
    });
  }, [target]);
  return heading;
}
