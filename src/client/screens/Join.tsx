import { useEffect, useState } from 'react';
import type { ClaimError, RoomInfo } from '../../shared/protocol';
import { ROLE_NAME, type Role } from '../../shared/session';
import { claimRole, getRoom } from '../lib/api';
import { navigate } from '../lib/router';
import { loadToken } from '../lib/storage';

export interface ClaimProblemState {
  error: ClaimError;
  info: RoomInfo | null;
}

/** `#/join/1234`: take whichever role is free and go to the session. */
export function JoinRoute({ code }: { code: string }) {
  const mine = (['A', 'B'] as Role[]).filter((r) => loadToken(code, r));
  // Opening your own share link shouldn't silently grab the partner's seat.
  const [claim, setClaim] = useState(mine.length === 0);
  const [problem, setProblem] = useState<ClaimProblemState | null>(null);
  useEffect(() => {
    if (!claim) return;
    let alive = true;
    claimRole(code).then(async (r) => {
      if (!alive) return;
      if ('error' in r) setProblem({ error: r.error, info: await getRoom(code) });
      else navigate(`/s/${code}/${r.role}`, true);
    });
    return () => {
      alive = false;
    };
  }, [code, claim]);
  if (!claim) {
    return (
      <Message title={`This phone is already in session ${code}`} text="Did you mean to continue there?">
        {mine.map((r) => (
          <button key={r} className="btn primary" onClick={() => navigate(`/s/${code}/${r}`, true)}>
            Continue as {ROLE_NAME[r].toLowerCase()}
          </button>
        ))}
        <button className="btn ghost" onClick={() => setClaim(true)}>
          Join as the other person here
        </button>
      </Message>
    );
  }
  if (problem) return <ClaimProblem code={code} problem={problem} />;
  return <Loading text={`Joining session ${code}…`} />;
}

export function ClaimProblem({
  code,
  problem,
  onResolved = (role) => navigate(`/s/${code}/${role}`, true),
}: {
  code: string;
  problem: ClaimProblemState;
  /** This phone now holds a seat for `role` (token saved). */
  onResolved?: (role: Role) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (problem.error === 'room-not-found' || !problem.info) {
    return (
      <Message title={`No session ${code}`} text="Check the code — or it may have expired. Start a new one on either phone.">
        <button className="btn primary" onClick={() => navigate('/')}>
          Start over
        </button>
      </Message>
    );
  }
  const seats = problem.info.seats;
  const takeover = async (role: Role) => {
    setBusy(true);
    const r = await claimRole(code, role, true);
    setBusy(false);
    if (!('error' in r)) onResolved(role);
  };
  return (
    <Message title="This session already has two phones" text="If one of them was lost or closed, this phone can take its place.">
      {(['A', 'B'] as Role[]).map((role) =>
        loadToken(code, role) ? (
          <button key={role} className="btn primary" onClick={() => onResolved(role)}>
            Continue as {ROLE_NAME[role].toLowerCase()}
          </button>
        ) : !seats[role].connected ? (
          <button key={role} className="btn" disabled={busy} onClick={() => takeover(role)}>
            Take over as {ROLE_NAME[role].toLowerCase()}
          </button>
        ) : (
          <p key={role} className="hint">
            {ROLE_NAME[role]} is connected on another phone.
          </p>
        ),
      )}
      <button className="btn link" onClick={() => navigate('/')}>
        Back
      </button>
    </Message>
  );
}

export function Loading({ text }: { text: string }) {
  return (
    <div className="screen center-screen">
      <div className="spinner" aria-hidden />
      <p>{text}</p>
    </div>
  );
}

export function Message({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="screen center-screen">
      <h2>{title}</h2>
      <p className="lead">{text}</p>
      <div className="column">{children}</div>
    </div>
  );
}
