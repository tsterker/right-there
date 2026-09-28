/** Dev tool: both devices side by side in one window, paired automatically. */
import { useState } from 'react';
import { navigate } from '../lib/router';

const newId = () => Math.random().toString(36).slice(2, 8);

export function Demo() {
  const [id, setId] = useState(newId);
  const src = (hash: string) => `${location.pathname}?demo=${id}#${hash}`;
  return (
    <div className="demo">
      <header className="demo-head">
        <button className="btn ghost small" onClick={() => navigate('/')}>
          ← Home
        </button>
        <p>Mouse works: drag on the receiver · double-click = right there</p>
        <button className="btn ghost small" onClick={() => setId(newId())}>
          Restart
        </button>
      </header>
      <div className="demo-phones">
        <figure>
          <figcaption>🛏 Receiver</figcaption>
          <iframe key={`${id}-a`} title="Receiver" src={src('/p2p/host/A')} className="demo-phone" />
        </figure>
        <figure>
          <figcaption>👐 Giver</figcaption>
          <iframe key={`${id}-b`} title="Giver" src={src('/p2p/demo-join')} className="demo-phone" />
        </figure>
      </div>
    </div>
  );
}
