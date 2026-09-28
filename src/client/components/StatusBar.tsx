import type { ReactNode } from 'react';
import { elapsedMs, isPaused, otherRole, ROLE_NAME } from '../../shared/session';
import { useSession } from '../lib/connection';
import { useAwakeState } from '../lib/wakeLock';
import { formatClock, useNow } from '../lib/time';

export function StatusBar({ children, timer, compact }: { children?: ReactNode; timer?: boolean; compact?: boolean }) {
  const { state, status, role, code, now } = useSession();
  const partner = otherRole(role);
  const partnerOnline = state.members[partner].connected;
  const awake = useAwakeState();
  const t = useNow(1000, now);
  const elapsed = elapsedMs(state, t);
  const total = state.prefs.durationMin ? state.prefs.durationMin * 60000 : null;
  const cls = status !== 'online' ? 'is-reconnecting' : partnerOnline ? 'is-online' : 'is-waiting';
  const text =
    status !== 'online' ? 'Reconnecting…' : partnerOnline ? `${ROLE_NAME[partner]} connected` : `${ROLE_NAME[partner]} offline`;
  return (
    <header className={`statusbar${compact ? ' is-compact' : ''}`}>
      <span className={`conn ${cls}`} title={text} />
      {!compact && <span className="status-text">{text}</span>}
      {timer && state.timer.startedAt != null && (
        <span className={`status-timer${isPaused(state) ? ' is-paused' : ''}`}>
          {formatClock(elapsed)}
          {total && !compact && <small> / {formatClock(total)}</small>}
        </span>
      )}
      <span className="spacer" />
      {children}
      {!compact && (
        <span className="status-code" title={awake === 'on' ? 'Screen stays on' : 'Screen may turn off'}>
          {awake === 'on' ? '☀' : awake === 'unsupported' ? '☾' : ''} #{code}
        </span>
      )}
    </header>
  );
}
