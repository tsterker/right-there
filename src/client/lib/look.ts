/**
 * How the spot's blob looks and moves: tunable in the app (press T), saved on
 * this device. In the demo, the page around the two phones tunes both.
 */
import { inDemo } from './demo';
import { persisted, usePersisted } from './storage';

export interface Look {
  /** Spring stiffness: how hard the blob is pulled after the spot. */
  stiffness: number;
  /** Spring damping: low wobbles, high creeps. */
  damping: number;
  /** The tail is drawn this many times the real lag, so small nudges show. */
  tail: number;
  /** Longest the tail may get, in blob radii. */
  stretch: number;
  /** How far the tip runs ahead of the core while moving, in blob radii. */
  point: number;
  /** How much the circles melt together (blur, cm). */
  goo: number;
  /** The hot core's size, in blob radii. */
  core: number;
}

/** Snappy, with a pronounced tip. */
export const DEFAULT_LOOK: Look = { stiffness: 60, damping: 14, tail: 1.3, stretch: 2, point: 1.6, goo: 1.3, core: 0.3 };

export const LOOK_PRESETS: { name: string; look: Look }[] = [
  { name: 'Snappy', look: DEFAULT_LOOK },
  { name: 'Soft', look: { stiffness: 30, damping: 10, tail: 1.6, stretch: 2.4, point: 1.1, goo: 1.6, core: 0.4 } },
  { name: 'Gooey', look: { stiffness: 16, damping: 6, tail: 2.2, stretch: 3.2, point: 0.9, goo: 2.2, core: 0.4 } },
];

export const LOOK_RANGES: { key: keyof Look; label: string; min: number; max: number; step: number; hint: string }[] = [
  { key: 'stiffness', label: 'Catch-up', min: 8, max: 90, step: 1, hint: 'How hard the blob is pulled after the spot' },
  { key: 'damping', label: 'Damping', min: 3, max: 22, step: 0.5, hint: 'Low wobbles, high creeps' },
  { key: 'tail', label: 'Tail length', min: 0.5, max: 3.5, step: 0.1, hint: 'Times the real lag' },
  { key: 'stretch', label: 'Max stretch', min: 1, max: 4, step: 0.1, hint: 'Longest tail, in blob radii' },
  { key: 'point', label: 'Point', min: 0, max: 2, step: 0.05, hint: 'Tip ahead of the core while moving' },
  { key: 'goo', label: 'Blobbiness', min: 0.6, max: 3, step: 0.1, hint: 'How much the shape melts together' },
  { key: 'core', label: 'Core size', min: 0.12, max: 0.6, step: 0.02, hint: 'The hot dot where the spot is' },
];

/** Tuning on the demo page stays in memory, like the demo's other settings. */
export const lookStore = persisted<Look>('mb.look', DEFAULT_LOOK, () => !/^#\/?demo\b/.test(location.hash));
export const useLook = () => usePersisted(lookStore);

/** The last look tuned by hand ("Mine"), kept apart from the presets so the two can be compared. */
export const mineStore = persisted<{ look: Look | null }>('mb.lookMine', { look: null }, () => !/^#\/?demo\b/.test(location.hash));

export const sameLook = (a: Look, b: Look) => (Object.keys(a) as (keyof Look)[]).every((k) => a[k] === b[k]);

// A look tuned before "Mine" existed becomes Mine, so picking a preset doesn't lose it.
if (!mineStore.get().look && !LOOK_PRESETS.some((p) => sameLook(p.look, lookStore.get()))) mineStore.set({ look: lookStore.get() });

/** Demo page → frames, with the look to use. */
export const DEMO_LOOK = 'right-there-demo-look';

if (inDemo) {
  window.addEventListener('message', (e) => {
    if (e.source === window.parent && e.data?.type === DEMO_LOOK) lookStore.set(e.data.look as Look);
  });
}
