/**
 * Receiver setup, lying down with the phone next to them: two swipes teach
 * the app how the phone lies (orientation) and how far to move per swipe.
 */
import { useRef, useState } from 'react';
import { describeOrientation, orientationFromSwipes, type Orientation } from '../../../shared/calibration';
import { sub } from '../../../shared/geometry';
import { sensitivityFromSwipes, type Sample } from '../../../shared/nudge';
import { StatusBar } from '../../components/StatusBar';
import { haptic } from '../../lib/haptics';
import { useProfile } from '../../lib/profile';

type Step = 'intro' | 'swipe-down' | 'swipe-right';

export function ReceiverSetup({ onDone }: { onDone: (o: Orientation) => void }) {
  const [profile, setProfile] = useProfile();
  const [step, setStep] = useState<Step>('intro');
  const [down, setDown] = useState<Sample[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const onSwipe = (samples: Sample[]) => {
    const delta = sub(samples[samples.length - 1], samples[0]);
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
    setProfile((p) => ({ ...p, orientation: r.orientation, sensitivity: sensitivityFromSwipes(down, samples) }));
    haptic('confirm');
    onDone(r.orientation);
  };

  if (step !== 'intro') {
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

  return (
    <div className="screen setup-intro">
      <StatusBar />
      <div className="scroll center-col">
        <p className="eyebrow">Setup</p>
        <h1>Lie down, phone next to you</h1>
        <p className="lead">
          Put it flat where your hand rests. Two quick swipes tell the app how it lies — then move a finger and your partner
          sees where you want the hands.
        </p>
      </div>
      <footer className="screen-foot column">
        <button className="btn primary block" onClick={() => setStep('swipe-down')}>
          Start the two swipes
        </button>
        {profile.orientation && (
          <button className="btn ghost block" onClick={() => onDone(profile.orientation!)}>
            Same as last time ({describeOrientation(profile.orientation).replace('top of the phone points toward ', 'top → ')})
          </button>
        )}
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
