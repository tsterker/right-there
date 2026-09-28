import { persisted, usePersisted } from './storage';

export interface ReceiverSettings {
  dim: boolean;
  haptics: boolean;
  sounds: boolean;
  /** Quietly say the area name when the spot settles somewhere new (eyes-free). */
  speak: boolean;
}

export interface GiverSettings {
  /** Clockwise rotation of the map so it matches where the giver stands. */
  viewAngle: 0 | 90 | 180 | 270;
  voice: boolean;
  sounds: boolean;
  /** Show full technique details (otherwise a compact card, leaving room for the map). */
  details: boolean;
}

export const receiverSettings = persisted<ReceiverSettings>('mb.settings.A', { dim: false, haptics: true, sounds: false, speak: false });
export const giverSettings = persisted<GiverSettings>('mb.settings.B', { viewAngle: 0, voice: false, sounds: true, details: false });

export const useReceiverSettings = () => usePersisted(receiverSettings);
export const useGiverSettings = () => usePersisted(giverSettings);

export const VIEWPOINTS: { angle: GiverSettings['viewAngle']; label: string; hint: string }[] = [
  { angle: 0, label: 'At their feet', hint: 'Head at the top of the screen' },
  { angle: 270, label: 'At their left side', hint: 'Head to the left' },
  { angle: 90, label: 'At their right side', hint: 'Head to the right' },
  { angle: 180, label: 'At their head', hint: 'Head at the bottom' },
];
