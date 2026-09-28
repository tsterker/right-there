/** Giver while the receiver checks in: live view of their marks, plus a plan. */
import { useMemo, useState } from 'react';
import { LIKEABLE, pressureLevel, PREP_CHECKLIST, buildPlan } from '../../../shared/techniques';
import { BackMap } from '../../components/BackMap';
import { StatusBar } from '../../components/StatusBar';
import { useSession } from '../../lib/connection';
import { useGiverSettings } from '../../lib/settings';
import { PlanList } from './common';

export function GiverBrief() {
  const { state, dispatch } = useSession();
  const [settings] = useGiverSettings();
  const [done, setDone] = useState<number[]>([]);
  const prefs = state.prefs;
  const plan = useMemo(() => buildPlan(state.markers, prefs.durationMin, prefs.likes), [state.markers, prefs.durationMin, prefs.likes]);
  const likes = LIKEABLE.filter((l) => prefs.likes.includes(l.id)).map((l) => l.label);

  return (
    <div className="screen brief">
      <StatusBar />
      <div className="scroll">
        <header className="screen-head">
          <p className="eyebrow">Step 1 of 3 · Their check-in</p>
          <h1>Getting ready</h1>
          <p className="lead">Your partner is marking how their back feels. It appears here as they go.</p>
        </header>

        <div className="brief-grid">
          <div className="brief-map">
            <BackMap angle={settings.viewAngle} markers={state.markers} />
          </div>
          <div className="brief-facts">
            <dl>
              <dt>Pressure</dt>
              <dd>
                {pressureLevel(prefs.pressure).label} <small>({prefs.pressure}/5)</small>
              </dd>
              <dt>Time</dt>
              <dd>{prefs.durationMin ? `${prefs.durationMin} minutes` : 'Open end'}</dd>
              {likes.length > 0 && (
                <>
                  <dt>Enjoys</dt>
                  <dd>{likes.join(', ')}</dd>
                </>
              )}
              {prefs.notes && (
                <>
                  <dt>Notes</dt>
                  <dd className="notes-text">“{prefs.notes}”</dd>
                </>
              )}
            </dl>
          </div>
        </div>

        <section className="field">
          <h3>Suggested plan</h3>
          <PlanList plan={plan} />
        </section>

        <section className="field">
          <h3>Before you start</h3>
          <ul className="checklist">
            {PREP_CHECKLIST.map((item, i) => (
              <li key={item}>
                <label>
                  <input
                    type="checkbox"
                    checked={done.includes(i)}
                    onChange={() => setDone((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]))}
                  />
                  {item}
                </label>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <footer className="screen-foot">
        <button className="btn link" onClick={() => dispatch({ type: 'phase', phase: 'live' })}>
          Skip ahead — start massage now
        </button>
      </footer>
    </div>
  );
}
