/** Precision calibration, receiver side: "tap where you feel the touch". */
import { useEffect, useRef, useState } from 'react';
import { clampToBody } from '../../../shared/body';
import { correct, DEFAULT_ORIENTATION } from '../../../shared/calibration';
import { BackMap, type MapHandle } from '../../components/BackMap';
import { useSession } from '../../lib/connection';
import { haptic } from '../../lib/haptics';
import { addCalibPoint, useCorrection, useProfile } from '../../lib/profile';

export function ProbeOverlay() {
  const { state, dispatch } = useSession();
  const [profile] = useProfile();
  const model = useCorrection(profile.points);
  const mapRef = useRef<MapHandle>(null);
  // Answered locally (the server's echo may still be on its way): record each probe once.
  const [answered, setAnswered] = useState<string | null>(null);
  const probe = state.probe;
  const open = probe != null && probe.answer == null && probe.id !== answered;
  const o = profile.orientation ?? DEFAULT_ORIENTATION;

  useEffect(() => {
    if (open) haptic('alert');
  }, [open, probe?.id]);

  if (!open || !probe) return null;

  const answer = (e: React.PointerEvent) => {
    const raw = mapRef.current?.toBody(e.clientX, e.clientY);
    if (!raw) return;
    const felt = clampToBody(raw, 0);
    setAnswered(probe.id);
    dispatch({ type: 'probe.answer', id: probe.id, answer: felt, corrected: correct(model, felt) });
    addCalibPoint({ raw: felt, truth: probe.truth, at: Date.now(), source: probe.landmark ? 'landmark' : 'touch' });
    haptic('confirm');
  };

  return (
    <div className="overlay probe-overlay">
      <div className="probe-head">
        <p className="eyebrow">Calibrating · {profile.points.length + 1}. point</p>
        <h2>Where do you feel the touch?</h2>
        <p>Your partner is pressing one spot on your back right now. Tap that spot on the picture.</p>
      </div>
      <div className="probe-map" onPointerUp={answer}>
        <BackMap angle={o.angle} mirrored={o.mirrored} handle={mapRef} />
      </div>
      <button className="btn ghost" onClick={() => dispatch({ type: 'probe.cancel' })}>
        I can't tell — skip
      </button>
    </div>
  );
}
