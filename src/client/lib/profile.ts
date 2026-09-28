/**
 * The receiver's personal calibration, kept on their own phone so it keeps
 * improving from session to session.
 */
import { useMemo } from 'react';
import {
  evaluateCorrection,
  fitCorrection,
  MAX_CALIB_POINTS,
  type CalibPoint,
  type Orientation,
} from '../../shared/calibration';
import type { Vec } from '../../shared/geometry';
import type { CalibInfo, InputMode, Prefs } from '../../shared/session';
import type { SymptomKind } from '../../shared/techniques';
import { persisted, usePersisted } from './storage';

export interface Profile {
  orientation: Orientation | null;
  sensitivity: number;
  tune: number;
  autoTune: boolean;
  mode: InputMode;
  points: CalibPoint[];
  prefs: Prefs | null;
  lastMarkers: { kind: SymptomKind; pos: Vec }[];
  favorites: { pos: Vec; at: number }[];
  setupAt: number | null;
}

const DEFAULT_PROFILE: Profile = {
  orientation: null,
  sensitivity: 1,
  tune: 1,
  autoTune: true,
  mode: 'nudge',
  points: [],
  prefs: null,
  lastMarkers: [],
  favorites: [],
  setupAt: null,
};

export const profileStore = persisted<Profile>('mb.profile', DEFAULT_PROFILE);

export const useProfile = () => usePersisted(profileStore);

export function addCalibPoint(point: CalibPoint) {
  profileStore.set((p) => ({ ...p, points: [...p.points, point].slice(-MAX_CALIB_POINTS) }));
}

/** Summary shared with the giver's phone. */
export function calibInfo(p: Profile): Omit<CalibInfo, 'at'> {
  const q = evaluateCorrection(p.points);
  return {
    orientation: p.orientation ?? { angle: 0, mirrored: false },
    sensitivity: p.sensitivity,
    tune: p.tune,
    mode: p.mode,
    points: q.n,
    rawErrorCm: q.rawErrorCm,
    errorCm: q.errorCm,
  };
}

export function useCorrection(points: CalibPoint[]) {
  return useMemo(() => fitCorrection(points), [points]);
}
