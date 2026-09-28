/**
 * Dev demo: two frames on one page pair by passing their codes over a
 * BroadcastChannel instead of QR codes. Active only with `?demo=<id>`.
 */
const demoId = () => new URLSearchParams(location.search).get('demo');
export const isDemo = () => demoId() != null;

type DemoMsg = { kind: 'offer' | 'answer'; code: string };

/** Keep announcing a code until stopped (the other frame may still be loading). */
export function announce(msg: DemoMsg): () => void {
  const id = demoId();
  if (id == null) return () => {};
  const ch = new BroadcastChannel(`right-there-demo-${id}`);
  const post = () => ch.postMessage(msg);
  post();
  const timer = setInterval(post, 700);
  return () => {
    clearInterval(timer);
    ch.close();
  };
}

/** Call `cb` once with the first code of this kind. */
export function listen(kind: DemoMsg['kind'], cb: (code: string) => void): () => void {
  const id = demoId();
  if (id == null) return () => {};
  const ch = new BroadcastChannel(`right-there-demo-${id}`);
  ch.onmessage = (e: MessageEvent<DemoMsg>) => {
    if (e.data?.kind !== kind) return;
    ch.close();
    cb(e.data.code);
  };
  return () => ch.close();
}
