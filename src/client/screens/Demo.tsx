/** Both phones side by side in one browser window: for trying things out at a desk. */
import { useEffect, useState } from 'react';
import { claimRole, createRoom } from '../lib/api';
import { navigate } from '../lib/router';

export function Demo() {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const a = await createRoom('A');
        const b = await claimRole(a.code, 'B');
        if ('error' in b) throw new Error(b.error);
        if (alive) setCode(a.code);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [nonce]);

  if (error) return <div className="screen center-screen">{error}</div>;
  if (!code) return <div className="screen center-screen">Preparing demo…</div>;
  const src = (role: 'A' | 'B') => `${location.pathname}?embed=1#/s/${code}/${role}`;
  return (
    <div className="demo">
      <header className="demo-head">
        <button className="btn ghost small" onClick={() => navigate('/')}>
          ← Home
        </button>
        <p>
          Session <b>{code}</b> — drag on the left phone (mouse works). Double-click = ♥.
        </p>
        <button className="btn ghost small" onClick={() => (setCode(null), setNonce((n) => n + 1))}>
          New demo session
        </button>
      </header>
      <div className="demo-phones">
        <figure>
          <figcaption>🛏 Receiver · lies down, phone beside them</figcaption>
          <iframe title="Receiver phone" src={src('A')} className="demo-phone" />
        </figure>
        <figure>
          <figcaption>👐 Giver · phone propped up nearby</figcaption>
          <iframe title="Giver phone" src={src('B')} className="demo-phone" allow="autoplay" />
        </figure>
      </div>
    </div>
  );
}
