/** Tiny WebAudio cues: no files, soft sine tones. */
export type Cue = 'firmer' | 'softer' | 'good' | 'ouch' | 'tick' | 'attention' | 'tempo';

let ctx: AudioContext | null = null;

/** Call from a user gesture (browsers keep audio suspended until then). */
export function unlockAudio() {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  ctx ??= new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
}

const NOTES: Record<Cue, { f: number; at: number; d: number }[]> = {
  firmer: [
    { f: 440, at: 0, d: 0.12 },
    { f: 660, at: 0.12, d: 0.16 },
  ],
  softer: [
    { f: 660, at: 0, d: 0.12 },
    { f: 440, at: 0.12, d: 0.16 },
  ],
  good: [
    { f: 523, at: 0, d: 0.14 },
    { f: 659, at: 0.1, d: 0.14 },
    { f: 784, at: 0.2, d: 0.26 },
  ],
  ouch: [
    { f: 220, at: 0, d: 0.18 },
    { f: 220, at: 0.26, d: 0.18 },
  ],
  tick: [{ f: 1200, at: 0, d: 0.03 }],
  attention: [
    { f: 880, at: 0, d: 0.1 },
    { f: 880, at: 0.16, d: 0.1 },
  ],
  tempo: [{ f: 550, at: 0, d: 0.12 }],
};

export function play(cue: Cue, volume = 0.18) {
  if (!ctx || ctx.state !== 'running') return;
  const t0 = ctx.currentTime + 0.01;
  for (const n of NOTES[cue]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = n.f;
    gain.gain.setValueAtTime(0, t0 + n.at);
    gain.gain.linearRampToValueAtTime(volume, t0 + n.at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.d);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + n.at);
    osc.stop(t0 + n.at + n.d + 0.02);
  }
}
