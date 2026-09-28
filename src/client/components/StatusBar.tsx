import type { ReactNode } from 'react';
import { otherRole, ROLE_NAME } from '../../shared/session';
import { useSession } from '../lib/connection';
import { useAwakeState } from '../lib/wakeLock';

export function StatusBar({ children, compact }: { children?: ReactNode; compact?: boolean }) {
  const { state, status, role } = useSession();
  const partner = otherRole(role);
  const partnerOnline = state.members[partner].connected;
  const awake = useAwakeState();
  const cls = status !== 'online' ? 'is-reconnecting' : partnerOnline ? 'is-online' : 'is-waiting';
  const text =
    status !== 'online' ? 'Reconnecting…' : partnerOnline ? `${ROLE_NAME[partner]} connected` : `${ROLE_NAME[partner]} offline`;
  return (
    <header className={`statusbar${compact ? ' is-compact' : ''}`}>
      <span className={`conn ${cls}`} title={text} />
      {!compact && <span className="status-text">{text}</span>}
      <span className="spacer" />
      {children}
      {!compact && awake === 'on' && (
        <span className="status-code" title="Screen stays on">
          ☀
        </span>
      )}
    </header>
  );
}
