import { persisted, usePersisted } from './storage';

export interface ReceiverSettings {
  dim: boolean;
  haptics: boolean;
  /** Quietly say the area name when the spot settles somewhere new (eyes-free). */
  speak: boolean;
}

export interface GiverSettings {
  /** Clockwise rotation of the map so it matches where the giver stands. */
  viewAngle: 0 | 90 | 180 | 270;
  /** Picked the standing position at least once (else ask). */
  viewChosen: boolean;
  voice: boolean;
}

export const receiverSettings = persisted<ReceiverSettings>('mb.settings.A', { dim: false, haptics: true, speak: false });
export const giverSettings = persisted<GiverSettings>('mb.settings.B', { viewAngle: 0, viewChosen: false, voice: false });

export const useReceiverSettings = () => usePersisted(receiverSettings);
export const useGiverSettings = () => usePersisted(giverSettings);

export const VIEWPOINTS: { angle: GiverSettings['viewAngle']; label: string; hint: string }[] = [
  { angle: 0, label: 'At their feet', hint: 'Head at the top of the screen' },
  { angle: 270, label: 'At their left side', hint: 'Head to the left' },
  { angle: 90, label: 'At their right side', hint: 'Head to the right' },
  { angle: 180, label: 'At their head', hint: 'Head at the bottom' },
];

/** This device, whichever role it plays. */
export interface DeviceSettings {
  /** Run sessions full screen where the browser allows it. */
  fullscreen: boolean;
}

export const deviceSettings = persisted<DeviceSettings>('mb.settings.device', { fullscreen: true });
export const useDeviceSettings = () => usePersisted(deviceSettings);
