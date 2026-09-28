import { useState } from 'react';
import { ROLE_NAME } from '../../shared/session';
import { BackMap } from '../components/BackMap';
import { formatClock, formatMinutes } from '../lib/time';
import { clearHistory, loadHistory } from '../lib/history';
import { profileStore } from '../lib/profile';
import { navigate } from '../lib/router';

export function History() {
  const [entries, setEntries] = useState(loadHistory);
  const profile = profileStore.get();
  return (
    <div className="screen history">
      <div className="scroll">
        <header className="screen-head">
          <button className="btn ghost small" onClick={() => navigate('/')}>
            ← Home
          </button>
          <h1>Past sessions</h1>
          <p className="lead">
            Stored only on this phone.
            {profile.points.length > 0 && ` Your pointing calibration has ${profile.points.length} points.`}
          </p>
        </header>
        {entries.length === 0 && <p className="hint">Nothing yet.</p>}
        <ul className="history-list">
          {entries.map((e) => (
            <li key={e.id} className="history-item">
              <div className="history-map">
                <BackMap heat={e.heat} points={e.favorites.map((pos) => ({ pos, kind: 'favorite' as const }))} labels={false} />
              </div>
              <div>
                <strong>{new Date(e.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</strong>
                <p className="muted">
                  {ROLE_NAME[e.role]} · {formatClock(e.durationMs)} · ♥ {e.feedbackCounts.good ?? 0} · pressure {e.pressure}/5
                </p>
                <p>{e.topAreas.slice(0, 3).map((a) => `${a.name} (${formatMinutes(a.ms)})`).join(', ') || '—'}</p>
              </div>
            </li>
          ))}
        </ul>
        {entries.length > 0 && (
          <button
            className="btn ghost small"
            onClick={() => {
              clearHistory();
              setEntries([]);
            }}
          >
            Clear history
          </button>
        )}
      </div>
    </div>
  );
}
