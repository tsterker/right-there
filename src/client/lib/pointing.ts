import type { Vec } from '../../shared/geometry';

/** Where the spot starts before anyone pointed: middle of the upper back. */
export const DEFAULT_START: Vec = { x: 0, y: 18 };

/** Last spot pointed at in map mode — paired with the giver's "I'm here" after a ♥. */
export const lastMapPoint: { raw: Vec | null; at: number } = { raw: null, at: 0 };
