import { useEffect, useMemo } from 'react';
import { ROLE_NAME } from '../../shared/session';
import { summarize } from '../../shared/summary';
import { BackMap, type MapPoint } from '../components/BackMap';
import { formatClock, formatMinutes } from '../lib/time';
import { useSession } from '../lib/connection';
import { loadHistory, saveHistoryEntry } from '../lib/history';
import { profileStore } from '../lib/profile';
import { navigate } from '../lib/router';
import { useGiverSettings } from '../lib/settings';

export function Summary() {
  const { state, role, dispatch, code, conn, status } = useSession();
  const bothHere = state.members.A.connected && state.members.B.connected;
  const [settings] = useGiverSettings();
  const s = useMemo(() => summarize(state), [state]);
  const angle = role === 'B' ? settings.viewAngle : 0;

  // Remember this round on this phone (history; the receiver also updates their profile).
  const id = `${code}-${state.createdAt}-${state.round}-${role}`;
  useEffect(() => {
    if (loadHistory().some((e) => e.id === id)) return;
    saveHistoryEntry({
      id,
      date: state.timer.endedAt ?? Date.now(),
      role,
      durationMs: s.durationMs,
      topAreas: s.topAreas.map((a) => ({ name: a.name, ms: a.ms })),
      favorites: s.favorites,
      ouches: s.ouches,
      pressure: s.pressure,
      feedbackCounts: s.counts,
      heat: state.heat,
    });
    if (role === 'A') {
      profileStore.set((p) => ({
        ...p,
        prefs: { ...state.prefs, pressure: state.pressure },
        lastMarkers: state.markers.map((m) => ({ kind: m.kind, pos: m.pos })),
        favorites: [...p.favorites, ...s.favorites.map((pos) => ({ pos, at: Date.now() }))].slice(-30),
      }));
    }
    // Once per round: `id` identifies it.
  }, [id]);

  const points: MapPoint[] = [
    ...s.favorites.map((pos) => ({ pos, kind: 'favorite' as const })),
    ...s.ouches.map((pos) => ({ pos, kind: 'ouch' as const })),
  ];
  const maxMs = Math.max(1, ...s.topAreas.map((a) => a.ms));

  return (
    <div className="screen summary">
      <div className="scroll">
        <header className="screen-head">
          <p className="eyebrow">Step 3 of 3 · Done</p>
          <h1>That was {formatClock(s.durationMs)} of care</h1>
          <p className="lead">
            {s.counts.good > 0 ? `${s.counts.good}× “that's the spot” ♥` : 'Thank each other :)'} · saved on this phone as{' '}
            {ROLE_NAME[role].toLowerCase()}.
          </p>
        </header>

        <div className="summary-grid">
          <div className="summary-map">
            <BackMap angle={angle} heat={state.heat} points={points} markers={state.markers.filter((m) => m.kind === 'avoid')} />
            <p className="legend">
              <span className="lg-heat" /> time spent · <span className="lg-fav">♥</span> loved · <span className="lg-ouch">✕</span> ouch
            </p>
          </div>
          <div>
            <h3>Where the time went</h3>
            {s.topAreas.length === 0 && <p className="hint">Not enough time on any one spot to show.</p>}
            <ul className="bars">
              {s.topAreas.map((a) => (
                <li key={a.regionId}>
                  <span className="bar-label">{a.name}</span>
                  <span className="bar" style={{ width: `${(a.ms / maxMs) * 100}%` }} />
                  <span className="bar-value">{formatMinutes(a.ms)}</span>
                </li>
              ))}
            </ul>
            <h3>For next time</h3>
            <ul className="notes-list">
              {s.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <p className="counts">
              ↑ firmer {s.counts.firmer} · ↓ softer {s.counts.softer} · ouch {s.counts.ouch} · ♥ {s.counts.good}
            </p>
          </div>
        </div>
      </div>
      <footer className="screen-foot row">
        <button className="btn ghost" onClick={() => navigate('/')}>
          Finish
        </button>
        {bothHere && (
          <button className="btn" disabled={status !== 'online'} onClick={() => conn.swapRoles()} title="The other person gets a massage now">
            ⇄ Swap roles
          </button>
        )}
        <button className="btn primary grow" onClick={() => dispatch({ type: 'restart', round: state.round })}>
          Another round
        </button>
      </footer>
    </div>
  );
}
