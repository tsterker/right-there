/** Background duties of the receiver's phone while a session is open. */
import { useEffect, useMemo, useState } from 'react';
import { useActions, useSession } from '../../lib/connection';
import { haptic } from '../../lib/haptics';
import { addCalibPoint, calibInfo, useProfile } from '../../lib/profile';
import { lastMapPoint } from '../../lib/pointing';

/** Keep the giver informed about our calibration and learn from confirmed spots. */
export function useReceiverSync(): string | null {
  const { status, dispatch, state } = useSession();
  const [profile] = useProfile();
  const [learned, setLearned] = useState<string | null>(null);
  const info = useMemo(
    () => calibInfo(profile),
    [profile.orientation, profile.sensitivity, profile.tune, profile.mode, profile.points],
  );
  const key = JSON.stringify(info);
  const online = status === 'online';
  const hasPartnerCalib = state.calib != null;
  useEffect(() => {
    if (online) dispatch({ type: 'calib', info });
  }, [key, online, hasPartnerCalib]);

  // ♥ followed by the giver's "I'm here": where we pointed ↔ where their hands really are.
  useActions((a, from, _at, next) => {
    if (a.type !== 'target') return;
    if (a.source === 'anchor' && a.learn && next.target) {
      if (lastMapPoint.raw && Date.now() - lastMapPoint.at <= 90_000) {
        addCalibPoint({ raw: lastMapPoint.raw, truth: next.target.pos, at: Date.now(), source: 'confirmed' });
        haptic('confirm');
        setLearned(`learned-${Date.now()}`);
      }
      lastMapPoint.raw = null;
      return;
    }
    // Any other move of the spot (giver jumps, nudging) makes the last map touch stale.
    if (!(from === 'A' && a.source === 'map')) lastMapPoint.raw = null;
  });
  return learned;
}
