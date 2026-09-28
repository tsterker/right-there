/**
 * Haptic feedback so the receiver can feel what they did without looking.
 * Android: Vibration API. iOS (no Vibration API): Safari 18+ ticks when a
 * switch-style checkbox is toggled from a user gesture, so we use that.
 */
import { receiverSettings } from './settings';

export type HapticKind = 'tick' | 'tap' | 'confirm' | 'double' | 'alert';

const PATTERNS: Record<HapticKind, number | number[]> = {
  tick: 6,
  tap: 14,
  confirm: [18, 50, 18],
  double: [14, 70, 14],
  alert: [60, 50, 60, 50, 60],
};

let iosSwitch: HTMLLabelElement | null = null;

function iosTick() {
  if (!iosSwitch) {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;overflow:hidden;opacity:0';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    iosSwitch = label;
  }
  iosSwitch.click();
}

export function haptic(kind: HapticKind) {
  if (!receiverSettings.get().haptics) return;
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(PATTERNS[kind]);
    return;
  }
  // The iOS trick only works inside taps, not while dragging: skip region ticks.
  if (kind === 'tick') return;
  iosTick();
  if (kind === 'double' || kind === 'confirm') setTimeout(iosTick, 90);
}
