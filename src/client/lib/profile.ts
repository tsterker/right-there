/**
 * The receiver's personal pointing calibration, kept on their own device so
 * it keeps improving from session to session.
 */
import { useMemo } from 'react';
import { fitCorrection, MAX_CALIB_POINTS, type CalibPoint, type Orientation } from '../../shared/calibration';
import type { InputMode } from '../../shared/session';
import { persisted, usePersisted } from './storage';

export interface Profile {
  /** How the phone lay during the last setup swipes. */
  orientation: Orientation | null;
  sensitivity: number;
  /** Learned from corrections while nudging. */
  tune: number;
  autoTune: boolean;
  mode: InputMode;
  /** Map-mode calibration pairs (from "right there" + the giver's "I'm here"). */
  points: CalibPoint[];
}

export const profileStore = persisted<Profile>('mb.profile', {
  orientation: null,
  sensitivity: 1,
  tune: 1,
  autoTune: true,
  mode: 'nudge',
  points: [],
});

export const useProfile = () => usePersisted(profileStore);

export function addCalibPoint(point: CalibPoint) {
  profileStore.set((p) => ({ ...p, points: [...p.points, point].slice(-MAX_CALIB_POINTS) }));
}

export function useCorrection(points: CalibPoint[]) {
  return useMemo(() => fitCorrection(points), [points]);
}
