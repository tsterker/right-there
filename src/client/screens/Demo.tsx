/** Both devices side by side in one window, already connected: try it before pairing real ones. */
import { useEffect, useRef, useState } from 'react';
import { DEMO_EXIT, DEMO_LINK, DEMO_READY } from '../lib/demo';
import { navigate } from '../lib/router';

const newId = () => Math.random().toString(36).slice(2, 8);
const PHONE = { w: 390, h: 844 };
const GAP = 24;

/** Scale the two phones down to fit narrow screens; shorten them to fit low ones. */
function useFit() {
  const [size, setSize] = useState(() => ({ w: innerWidth, h: innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: innerWidth, h: innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const scale = Math.min(1, (size.w - 32) / (2 * PHONE.w + GAP));
  const height = Math.min(PHONE.h, Math.max(560, (size.h - 150) / scale));
  return { scale, height };
}

export function Demo() {
  const [id, setId] = useState(newId);
  const { scale, height } = useFit();
  const giver = useRef<HTMLIFrameElement>(null);
  const receiver = useRef<HTMLIFrameElement>(null);

  // Hand both frames the ends of one channel once both have asked for it.
  useEffect(() => {
    const ready = new Set<Window>();
    let linked = false;
    const onMessage = (e: MessageEvent) => {
      if (e.data === DEMO_EXIT) return navigate('/');
      const g = giver.current?.contentWindow;
      const r = receiver.current?.contentWindow;
      if (e.data !== DEMO_READY || linked || !g || !r || (e.source !== g && e.source !== r)) return;
      ready.add(e.source);
      if (ready.size < 2) return;
      linked = true;
      const { port1, port2 } = new MessageChannel();
      g.postMessage(DEMO_LINK, '*', [port1]);
      r.postMessage(DEMO_LINK, '*', [port2]);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [id]);

  const src = (hash: string) => `${location.pathname}?demo=${id}#${hash}`;
  const phone = (title: string, ref: React.RefObject<HTMLIFrameElement | null>, hash: string) => (
    <div className="demo-device" style={{ width: PHONE.w * scale, height: height * scale }}>
      <iframe
        key={id}
        ref={ref}
        title={title}
        src={src(hash)}
        style={{ width: PHONE.w, height, transform: `scale(${scale})` }}
      />
    </div>
  );

  return (
    <div className="demo">
      <header className="demo-head">
        <button className="btn ghost small" onClick={() => navigate('/')}>
          ← Back
        </button>
        <strong>Demo</strong>
        <button className="btn ghost small" onClick={() => setId(newId())}>
          Restart
        </button>
      </header>
      <p className="demo-lead">
        Drag on the receiver’s phone — the giver’s screen follows. Double-click (or double-tap) = <b>right there</b>.
      </p>
      <div className="demo-phones" style={{ gap: GAP * scale }}>
        <figure>
          <figcaption>🛏 Receiver’s phone</figcaption>
          {phone('Receiver', receiver, '/p2p/demo-join')}
        </figure>
        <figure>
          <figcaption>👐 Giver’s screen</figcaption>
          {phone('Giver', giver, '/p2p/host/B')}
        </figure>
      </div>
    </div>
  );
}
