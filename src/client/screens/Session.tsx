import { useEffect, useState } from 'react';
import { otherRole, ROLE_NAME, type Role } from '../../shared/session';
import { claimRole, getRoom } from '../lib/api';
import { SessionContext, useSession, useSessionConnection } from '../lib/connection';
import { navigate } from '../lib/router';
import { loadToken } from '../lib/storage';
import { useKeepAwake } from '../lib/wakeLock';
import { GiverBrief } from './giver/Brief';
import { GiverLive } from './giver/Live';
import { GiverSetup } from './giver/Setup';
import { ClaimProblem, Loading, Message, type ClaimProblemState } from './Join';
import { Lobby } from './Lobby';
import { ReceiverCheckIn } from './receiver/CheckIn';
import { ReceiverPad } from './receiver/Pad';
import { ProbeOverlay } from './receiver/ProbeOverlay';
import { ReceiverSetup } from './receiver/Setup';
import { useReceiverSync } from './receiver/sync';
import { Summary } from './Summary';

/** `#/s/1234/A`: make sure this phone holds a seat, then connect. */
export function SessionRoute({ code, role }: { code: string; role: Role }) {
  const [token, setToken] = useState(() => loadToken(code, role));
  const [problem, setProblem] = useState<ClaimProblemState | null>(null);
  useEffect(() => {
    if (token) return;
    let alive = true;
    claimRole(code, role).then(async (r) => {
      if (!alive) return;
      if ('error' in r) setProblem({ error: r.error, info: await getRoom(code) });
      else setToken(r.token);
    });
    return () => {
      alive = false;
    };
  }, [code, role, token]);
  if (problem) {
    return (
      <ClaimProblem
        code={code}
        problem={problem}
        onResolved={(r) => {
          if (r !== role) return navigate(`/s/${code}/${r}`, true);
          setProblem(null);
          setToken(loadToken(code, r));
        }}
      />
    );
  }
  if (!token) return <Loading text="Joining…" />;
  return <Session key={`${code}-${role}-${token}`} code={code} role={role} token={token} />;
}

function Session({ code, role, token }: { code: string; role: Role; token: string }) {
  const api = useSessionConnection(code, role, token);
  useKeepAwake();

  if (api.error) {
    if (api.error.code === 'replaced') {
      return (
        <Message title="Opened somewhere else" text={`This session is now open as ${ROLE_NAME[role].toLowerCase()} in another tab or phone.`}>
          <button className="btn primary" onClick={() => api.conn.reclaim()}>
            Use it here instead
          </button>
        </Message>
      );
    }
    return (
      <Message title="Can't join this session" text={api.error.message}>
        <button className="btn primary" onClick={() => navigate('/')}>
          Start over
        </button>
      </Message>
    );
  }
  if (!api.state) return <Loading text={api.status === 'failed' ? 'Connection failed' : 'Connecting…'} />;
  return (
    <SessionContext.Provider value={api}>
      <SessionScreens />
      <ConnectionNotice />
    </SessionContext.Provider>
  );
}

/** The phase screens for this device's role (shared by server and no-server sessions). */
export function SessionScreens() {
  const { role } = useSession();
  return role === 'A' ? <ReceiverRoot /> : <GiverRoot />;
}

function ReceiverRoot() {
  const { state } = useSession();
  const learned = useReceiverSync();
  let screen;
  switch (state.phase) {
    case 'lobby':
      screen = <Lobby />;
      break;
    case 'checkin':
      screen = <ReceiverCheckIn />;
      break;
    case 'setup':
      screen = <ReceiverSetup />;
      break;
    case 'live':
      screen = <ReceiverPad learned={learned} />;
      break;
    case 'summary':
      screen = <Summary />;
      break;
  }
  return (
    <>
      {screen}
      {state.phase !== 'lobby' && state.phase !== 'summary' && <ProbeOverlay />}
    </>
  );
}

function GiverRoot() {
  const { state } = useSession();
  switch (state.phase) {
    case 'lobby':
      return <Lobby />;
    case 'checkin':
      return <GiverBrief />;
    case 'setup':
      return <GiverSetup />;
    case 'live':
      return <GiverLive />;
    case 'summary':
      return <Summary />;
  }
}

function ConnectionNotice() {
  const { state, status, role } = useSession();
  const partner = otherRole(role);
  if (status !== 'online') return <div className="conn-notice is-self">Reconnecting to the session…</div>;
  if (state.phase !== 'lobby' && !state.members[partner].connected) {
    return <div className="conn-notice">The {ROLE_NAME[partner].toLowerCase()}’s phone is offline — it reconnects on its own.</div>;
  }
  return null;
}
