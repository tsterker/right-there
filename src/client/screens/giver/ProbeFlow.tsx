/**
 * Precision calibration, giver side. The giver presses a landmark on the real
 * back; the receiver taps where they feel it. Each pair teaches the receiver's
 * phone how their sense of touch maps onto the back.
 */
import { useRef, useState } from 'react';
import { LANDMARK_SEQUENCE, LANDMARKS } from '../../../shared/body';
import { coverageGaps } from '../../../shared/calibration';
import { dist } from '../../../shared/geometry';
import { BackMap, type MapHandle, type MapPoint } from '../../components/BackMap';
import { useSession } from '../../lib/connection';
import { useGiverSettings } from '../../lib/settings';

export function ProbeFlow({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useSession();
  const [settings] = useGiverSettings();
  const [index, setIndex] = useState(() => state.probes.length % LANDMARK_SEQUENCE.length);
  const [custom, setCustom] = useState(false);
  const mapRef = useRef<MapHandle>(null);
  const landmark = LANDMARKS[LANDMARK_SEQUENCE[index % LANDMARK_SEQUENCE.length]];
  const probe = state.probe;
  const waiting = probe != null && probe.answer == null;
  const answered = probe != null && probe.answer != null ? probe : null;
  const calib = state.calib;

  const points: MapPoint[] = [];
  const links: { from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
  for (const p of state.probes.slice(-8)) {
    if (!p.answer) continue;
    points.push({ pos: p.truth, kind: 'truth' }, { pos: p.answer, kind: 'felt' });
    links.push({ from: p.truth, to: p.answer });
  }
  if (!answered && !custom) points.push({ pos: landmark.pos, kind: 'landmark', label: waiting ? 'touching…' : 'touch here' });

  const touchNow = () => dispatch({ type: 'probe.start', landmark: landmark.id, truth: landmark.pos });
  const next = () => {
    setIndex((i) => i + 1);
    dispatch({ type: 'probe.cancel' });
  };
  const onMap = (e: React.PointerEvent) => {
    if (!custom || waiting) return;
    const p = mapRef.current?.toBody(e.clientX, e.clientY);
    if (!p) return;
    dispatch({ type: 'probe.start', landmark: null, truth: p });
    setCustom(false);
  };

  const errorNow = answered?.answer ? dist(answered.answer, answered.truth) : null;
  const errorCorrected = answered?.corrected ? dist(answered.corrected, answered.truth) : null;
  const gaps = coverageGaps(state.probes.filter((p) => p.answer).map((p) => ({ raw: p.answer!, truth: p.truth, at: p.at, source: 'landmark' as const })));

  return (
    <div className="probe-flow">
      <div className={`probe-flow-map${custom ? ' is-picking' : ''}`} onPointerUp={onMap}>
        <BackMap angle={settings.viewAngle} crop="torso" handle={mapRef} points={points} links={links} />
        {custom && <div className="map-overlay-hint">Tap the spot you are touching</div>}
      </div>

      <div className="probe-flow-panel">
        {waiting ? (
          <>
            <h3>Keep touching…</h3>
            <p>They are tapping where they feel your finger.</p>
            <button className="btn ghost" onClick={() => dispatch({ type: 'probe.cancel' })}>
              Cancel
            </button>
          </>
        ) : answered ? (
          <>
            <h3>{errorNow != null && errorNow < 3 ? 'Spot on!' : `They felt it ${errorNow?.toFixed(0)} cm away`}</h3>
            <p className="muted">
              Teal ring = where you touched, amber dot = where they felt it.
              {errorCorrected != null && errorNow != null && errorCorrected < errorNow - 0.5 && (
                <> The previous calibration would already have placed it within {errorCorrected.toFixed(0)} cm.</>
              )}
            </p>
            <div className="row">
              <button className="btn primary grow" onClick={next}>
                Next spot
              </button>
              <button className="btn ghost" onClick={() => (dispatch({ type: 'probe.cancel' }), onClose())}>
                Done
              </button>
            </div>
          </>
        ) : custom ? (
          <>
            <h3>Custom spot</h3>
            <p>Press a spot on their back, then tap the same spot on the map.</p>
            <button className="btn ghost" onClick={() => setCustom(false)}>
              Back to landmarks
            </button>
          </>
        ) : (
          <>
            <p className="eyebrow">Precision calibration · point {state.probes.filter((p) => p.answer).length + 1}</p>
            <h3>Press: {landmark.name}</h3>
            <p>{landmark.find}</p>
            <button className="btn primary block big" onClick={touchNow}>
              I'm touching it now
            </button>
            <div className="row">
              <button className="btn ghost" onClick={() => setIndex((i) => i + 1)}>
                Other landmark
              </button>
              <button className="btn ghost" onClick={() => setCustom(true)}>
                Custom spot
              </button>
              <button className="btn ghost" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
        {calib && calib.points > 0 && (
          <p className="calib-quality">
            Map precision: {calib.errorCm != null ? `±${calib.errorCm.toFixed(1)} cm` : 'needs 3+ points'}
            {calib.rawErrorCm != null && ` · uncorrected ±${calib.rawErrorCm.toFixed(1)} cm`} · {calib.points} point
            {calib.points === 1 ? '' : 's'}
            {gaps.length > 0 && calib.points < 8 && <> · still missing: {gaps.join(', ')}</>}
          </p>
        )}
      </div>
    </div>
  );
}
