/** Map mode keeps learning: "right there" + the giver's "I'm here" = where we pointed vs. where the hands are. */
import { useState } from 'react';
import { useActions } from '../../lib/connection';
import { haptic } from '../../lib/haptics';
import { lastMapPoint } from '../../lib/pointing';
import { addCalibPoint } from '../../lib/profile';

/** Returns a new timestamp each time a calibration pair was learned. */
export function useMapLearning(): number | null {
  const [learned, setLearned] = useState<number | null>(null);
  useActions((a, from, _at, next) => {
    if (a.type !== 'target') return;
    if (a.source === 'anchor' && a.learn && next.target) {
      if (lastMapPoint.raw && Date.now() - lastMapPoint.at <= 90_000) {
        addCalibPoint({ raw: lastMapPoint.raw, truth: next.target.pos, at: Date.now() });
        haptic('confirm');
        setLearned(Date.now());
      }
      lastMapPoint.raw = null;
      return;
    }
    // Any other move of the spot (the giver re-syncing, nudging) makes the last map touch stale.
    if (!(from === 'A' && a.source === 'map')) lastMapPoint.raw = null;
  });
  return learned;
}
