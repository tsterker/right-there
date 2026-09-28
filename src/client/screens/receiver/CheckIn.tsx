/** Receiver check-in: where it hurts, how they like it. Everything syncs live to the giver. */
import { useEffect, useRef, useState } from 'react';
import { dist } from '../../../shared/geometry';
import { DEFAULT_PREFS } from '../../../shared/session';
import { LIKEABLE, SYMPTOM_ORDER, SYMPTOMS, type SymptomKind, type TechniqueId } from '../../../shared/techniques';
import { BackMap, type MapHandle } from '../../components/BackMap';
import { StatusBar } from '../../components/StatusBar';
import { Segmented } from '../../components/ui';
import { useLatest, useSession } from '../../lib/connection';
import { haptic } from '../../lib/haptics';
import { useProfile } from '../../lib/profile';

const PRESSURE_OPTIONS = [
  { value: 2, label: 'Light' },
  { value: 3, label: 'Medium' },
  { value: 4, label: 'Firm' },
  { value: 5, label: 'Deep' },
];

const DURATIONS: { value: number | null; label: string }[] = [
  { value: 10, label: '10′' },
  { value: 15, label: '15′' },
  { value: 20, label: '20′' },
  { value: 30, label: '30′' },
  { value: null, label: 'Open' },
];

export function ReceiverCheckIn() {
  const { state, dispatch } = useSession();
  const [profile] = useProfile();
  const [kind, setKind] = useState<SymptomKind>('knot');
  const mapRef = useRef<MapHandle>(null);
  const prefs = state.prefs;

  // Start from last time's preferences on a fresh session.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current) return;
    prefilled.current = true;
    const untouched = JSON.stringify(state.prefs) === JSON.stringify(DEFAULT_PREFS);
    if (untouched && profile.prefs && state.round === 1) dispatch({ type: 'prefs', prefs: profile.prefs });
  }, [dispatch, profile.prefs, state.prefs, state.round]);

  const onMap = (e: React.PointerEvent) => {
    const p = mapRef.current?.toBody(e.clientX, e.clientY);
    if (!p) return;
    const hit = state.markers.find((m) => dist(m.pos, p) < 3.2);
    if (hit) dispatch({ type: 'marker.remove', id: hit.id });
    else dispatch({ type: 'marker.add', kind, pos: p });
    haptic('tap');
  };

  const toggleLike = (id: TechniqueId) => {
    const likes = prefs.likes.includes(id) ? prefs.likes.filter((l) => l !== id) : [...prefs.likes, id];
    dispatch({ type: 'prefs', prefs: { likes } });
  };

  const canReuse = profile.lastMarkers.length > 0 && state.markers.length === 0;

  return (
    <div className="screen checkin">
      <StatusBar />
      <div className="scroll">
        <header className="screen-head">
          <p className="eyebrow">Step 1 of 3 · Check-in</p>
          <h1>How's your back today?</h1>
          <p className="lead">Pick a feeling, tap the spot. Tap a mark again to remove it.</p>
        </header>

        <div className="chips symptom-chips" role="radiogroup" aria-label="Symptom">
          {SYMPTOM_ORDER.map((k) => (
            <button
              key={k}
              role="radio"
              aria-checked={kind === k}
              className={`chip${kind === k ? ' is-on' : ''}`}
              style={{ ['--chip' as string]: SYMPTOMS[k].color }}
              onClick={() => setKind(k)}
              title={SYMPTOMS[k].feels}
            >
              <span className="chip-dot">{SYMPTOMS[k].glyph}</span>
              {SYMPTOMS[k].label}
            </button>
          ))}
        </div>

        <div className="checkin-map" onPointerUp={onMap}>
          <BackMap handle={mapRef} markers={state.markers} crop="torso" />
          <p className="checkin-feels">{SYMPTOMS[kind].feels}</p>
        </div>
        {canReuse && (
          <button className="btn ghost small" onClick={() => dispatch({ type: 'markers.set', markers: profile.lastMarkers })}>
            ↺ Same spots as last time
          </button>
        )}

        <section className="field">
          <h3>Pressure you usually like</h3>
          <Segmented
            value={prefs.pressure}
            options={PRESSURE_OPTIONS}
            onChange={(v) => dispatch({ type: 'prefs', prefs: { pressure: v } })}
          />
        </section>

        <section className="field">
          <h3>How long?</h3>
          <Segmented
            value={prefs.durationMin}
            options={DURATIONS}
            onChange={(v) => dispatch({ type: 'prefs', prefs: { durationMin: v } })}
          />
        </section>

        <section className="field">
          <h3>I enjoy…</h3>
          <div className="chips">
            {LIKEABLE.map((l) => (
              <button key={l.id} className={`chip${prefs.likes.includes(l.id) ? ' is-on' : ''}`} onClick={() => toggleLike(l.id)}>
                {l.label}
              </button>
            ))}
          </div>
        </section>

        <section className="field">
          <h3>Anything else?</h3>
          <NotesField value={prefs.notes} onChange={(notes) => dispatch({ type: 'prefs', prefs: { notes } })} />
        </section>
      </div>
      <footer className="screen-foot">
        <button className="btn primary block" onClick={() => dispatch({ type: 'phase', phase: 'setup' })}>
          Next: set up pointing →
        </button>
      </footer>
    </div>
  );
}

/** Local draft; sends after a short pause in typing, and never overwrites notes it didn't change. */
function NotesField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const pending = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const send = useLatest(onChange);
  const flush = () => {
    window.clearTimeout(timer.current);
    if (pending.current == null) return;
    send.current(pending.current);
    pending.current = null;
  };
  // Follow changes from elsewhere (e.g. last time's notes arriving) unless mid-typing.
  useEffect(() => {
    if (!focused.current && pending.current == null) setDraft(value);
  }, [value]);
  // Leaving the screen mid-typing still sends the last keystrokes.
  useEffect(() => () => flush(), []);
  return (
    <textarea
      className="notes"
      rows={2}
      maxLength={500}
      placeholder="e.g. desk job, stiff neck, no oil on the hair please"
      value={draft}
      onFocus={() => (focused.current = true)}
      onChange={(e) => {
        setDraft(e.target.value);
        pending.current = e.target.value;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(flush, 500);
      }}
      onBlur={() => {
        focused.current = false;
        flush();
      }}
    />
  );
}
