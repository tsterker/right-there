/**
 * Receiver setup, lying down with the phone next to them:
 * two swipes teach the app how the phone lies, then a practice round.
 */
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_ORIENTATION, describeOrientation, orientationFromSwipes } from '../../../shared/calibration';
import { sub } from '../../../shared/geometry';
import { sensitivityFromSwipes, type Sample } from '../../../shared/nudge';
import type { SetupStep } from '../../../shared/session';
import { StatusBar } from '../../components/StatusBar';
import { TouchPad } from '../../components/TouchPad';
import { Segmented } from '../../components/ui';
import { useSession } from '../../lib/connection';
import { haptic } from '../../lib/haptics';
import { useCorrection, useProfile } from '../../lib/profile';
import { useReceiverSettings } from '../../lib/settings';
import { MODE_OPTIONS } from './modes';

type Step = Exclude<SetupStep, 'done'>;


export function ReceiverSetup() {
  const { state, dispatch } = useSession();
  const [profile, setProfile] = useProfile();
  const [settings] = useReceiverSettings();
  const model = useCorrection(profile.points);
  const [step, setStep] = useState<Step>(state.setupStep === 'practice' && profile.orientation ? 'practice' : 'intro');
  const [down, setDown] = useState<Sample[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    dispatch({ type: 'setup.step', step });
  }, [dispatch, step]);

  const onSwipe = (samples: Sample[]) => {
    const first = samples[0];
    const last = samples[samples.length - 1];
    const delta = sub(last, first);
    if (Math.hypot(delta.x, delta.y) < 60) {
      setMessage('A little longer, please — like drawing a line across the screen.');
      haptic('tap');
      return;
    }
    if (step === 'swipe-down') {
      setDown(samples);
      setMessage(null);
      setStep('swipe-right');
      haptic('confirm');
      return;
    }
    if (!down) return;
    const r = orientationFromSwipes(sub(down[down.length - 1], down[0]), delta);
    if (!r.ok) {
      setMessage(r.message);
      setDown(null);
      setStep('swipe-down');
      haptic('alert');
      return;
    }
    const sensitivity = sensitivityFromSwipes(down, samples);
    setProfile((p) => ({ ...p, orientation: r.orientation, sensitivity, setupAt: Date.now() }));
    setMessage(null);
    setStep('practice');
    haptic('confirm');
  };

  const start = () => dispatch({ type: 'phase', phase: 'live' });

  if (step === 'swipe-down' || step === 'swipe-right') {
    return (
      <div className="screen setup-swipe">
        <SwipeArea onSwipe={onSwipe}>
          <p className="eyebrow">Swipe {step === 'swipe-down' ? '1' : '2'} of 2 · anywhere on the screen</p>
          <h1>
            {step === 'swipe-down' ? (
              <>
                Swipe from your <em>neck</em> toward your <em>lower back</em>
              </>
            ) : (
              <>
                Now swipe from your <em>left</em> side to your <em>right</em> side
              </>
            )}
          </h1>
          <p className="lead">Think of the direction on your body, not on the phone. Start a little away from the screen edge.</p>
          {message && <p className="notice">{message}</p>}
        </SwipeArea>
        <button className="btn ghost small setup-cancel" onClick={() => setStep('intro')}>
          Back
        </button>
      </div>
    );
  }

  if (step === 'practice') {
    const o = profile.orientation ?? DEFAULT_ORIENTATION;
    return (
      <div className="screen setup-practice">
        <StatusBar compact>
          <Segmented value={profile.mode} options={MODE_OPTIONS} onChange={(mode) => setProfile({ mode })} className="small" />
        </StatusBar>
        <div className="practice-head">
          <p className="eyebrow">Step 2 of 3 · Try it</p>
          <h2>Got it — the {describeOrientation(o)}.</h2>
          <p className="lead">
            {profile.mode === 'nudge'
              ? 'Drag anywhere to move the spot. Slow = precise, quick = far. Your partner sees it live.'
              : 'Touch the spot on the picture. Your partner sees it live.'}
          </p>
        </div>
        <TouchPad
          mode={profile.mode}
          orientation={o}
          sensitivity={profile.sensitivity}
          tune={profile.tune}
          autoTune={false}
          model={model}
          target={state.target}
          markers={state.markers}
          dispatch={dispatch}
          dim={settings.dim}
        />
        <footer className="screen-foot row">
          <button className="btn ghost" onClick={() => setStep('swipe-down')}>
            Redo swipes
          </button>
          <button className="btn primary grow" onClick={start}>
            Start massage ▶
          </button>
        </footer>
      </div>
    );
  }

  return (
    <div className="screen setup-intro">
      <StatusBar />
      <div className="scroll">
        <header className="screen-head">
          <p className="eyebrow">Step 2 of 3 · Set up pointing</p>
          <h1>Lie down and get comfy</h1>
          <p className="lead">
            Put your phone flat next to you, where your hand rests naturally. Two quick swipes tell the app how the phone is
            lying — then you just move a finger and your partner sees where you want it.
          </p>
        </header>

        <section className="field">
          <h3>How do you want to point?</h3>
          <div className="mode-cards">
            <button className={`mode-card${profile.mode === 'nudge' ? ' is-on' : ''}`} onClick={() => setProfile({ mode: 'nudge' })}>
              <strong>✋ Nudge</strong>
              <span>Eyes-free. Drag anywhere and the spot moves like a trackpad cursor: “a bit more left”.</span>
            </button>
            <button className={`mode-card${profile.mode === 'map' ? ' is-on' : ''}`} onClick={() => setProfile({ mode: 'map' })}>
              <strong>🗺 Map</strong>
              <span>Look and touch the spot on a picture of your back. Gets more precise with calibration.</span>
            </button>
          </div>
        </section>

        <section className="field tips">
          <h3>While lying down</h3>
          <ul>
            <li>
              <b>Double-tap</b> anywhere = “that's the spot” ♥
            </li>
            <li>
              <b>Two-finger swipe</b> up / down = firmer / softer
            </li>
            <li>Buttons at the bottom edge: Ouch · Softer · ♥ · Firmer</li>
          </ul>
        </section>
      </div>
      <footer className="screen-foot column">
        <button className="btn primary block" onClick={() => setStep('swipe-down')}>
          Start the two swipes
        </button>
        {profile.orientation && (
          <button className="btn ghost block" onClick={() => setStep('practice')}>
            Phone lies like last time ({describeOrientation(profile.orientation).replace('top of the phone points toward ', 'top → ')})
          </button>
        )}
        <button className="btn link" onClick={start}>
          Skip — start massage
        </button>
      </footer>
    </div>
  );
}

/** Full-screen area that records one swipe and draws it. */
function SwipeArea({ onSwipe, children }: { onSwipe: (s: Sample[]) => void; children: React.ReactNode }) {
  const samples = useRef<Sample[]>([]);
  const [path, setPath] = useState<Sample[]>([]);
  const [box, setBox] = useState<DOMRect | null>(null);
  const el = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={el}
      className="swipe-area"
      onPointerDown={(e) => {
        el.current?.setPointerCapture?.(e.pointerId);
        setBox(el.current?.getBoundingClientRect() ?? null);
        samples.current = [{ x: e.clientX, y: e.clientY, t: e.timeStamp }];
        setPath(samples.current);
      }}
      onPointerMove={(e) => {
        if (!samples.current.length) return;
        samples.current.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
        setPath([...samples.current]);
      }}
      onPointerUp={() => {
        const s = samples.current;
        samples.current = [];
        if (s.length > 1) onSwipe(s);
        window.setTimeout(() => setPath([]), 350);
      }}
      onPointerCancel={() => {
        samples.current = [];
        setPath([]);
      }}
    >
      <div className="swipe-text">{children}</div>
      {box && path.length > 1 && (
        <svg className="swipe-trace" width="100%" height="100%">
          <polyline points={path.map((q) => `${q.x - box.left},${q.y - box.top}`).join(' ')} />
        </svg>
      )}
    </div>
  );
}
