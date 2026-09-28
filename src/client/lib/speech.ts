/**
 * Spoken cues for the giver, whose hands are busy (and oily): "Higher, a
 * little", "Firmer", "Left shoulder blade". Short phrases, newest wins.
 */
type Priority = 'low' | 'normal' | 'high';

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
let voice: SpeechSynthesisVoice | null = null;
let unlocked = false;
/** Chrome can garbage-collect utterances mid-speech; keep references. */
const live = new Set<SpeechSynthesisUtterance>();

function pickVoice() {
  if (!supported) return;
  const voices = speechSynthesis.getVoices();
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  voice =
    en.find((v) => /samantha|karen|daniel|google us english|serena|moira/i.test(v.name)) ??
    en.find((v) => v.localService) ??
    en[0] ??
    null;
}

if (supported) {
  pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

export const speechSupported = supported;

/** Call from a user gesture once; iOS only speaks after that. */
export function unlockSpeech() {
  if (!supported || unlocked) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  speechSynthesis.speak(u);
  unlocked = true;
}

export function say(text: string, priority: Priority = 'normal', volume = 1) {
  if (!supported) return;
  const busy = speechSynthesis.speaking || speechSynthesis.pending;
  if (busy && priority === 'low') return;
  if (busy && priority === 'high') speechSynthesis.cancel();
  if (busy && priority === 'normal' && speechSynthesis.pending) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? 'en-US';
  u.rate = 1.02;
  u.pitch = 1;
  u.volume = volume;
  live.add(u);
  u.onend = u.onerror = () => live.delete(u);
  speechSynthesis.speak(u);
}
