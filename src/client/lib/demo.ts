/**
 * The side-by-side demo: two frames of this app on one page (`?demo`). The
 * page around them hands both frames the ends of one MessageChannel, which
 * stands in for the WebRTC data channel, so the demo needs no pairing codes,
 * no network and no camera.
 */

export const inDemo = new URLSearchParams(location.search).has('demo');

/** Frame → demo page: "give me my end of the link" (repeated until it arrives). */
export const DEMO_READY = 'right-there-demo-ready';
/** Demo page → frame, with the port. */
export const DEMO_LINK = 'right-there-demo-link';
/** Frame → demo page: leave the demo. */
export const DEMO_EXIT = 'right-there-demo-exit';

/** Ask the demo page for the link to the other frame. */
export function demoChannel(onChannel: (channel: RTCDataChannel) => void): () => void {
  const ask = () => window.parent.postMessage(DEMO_READY, '*');
  const timer = window.setInterval(ask, 500);
  const onMessage = (e: MessageEvent) => {
    if (e.source !== window.parent || e.data !== DEMO_LINK || !e.ports[0]) return;
    stop();
    onChannel(portChannel(e.ports[0]));
  };
  const stop = () => {
    window.clearInterval(timer);
    window.removeEventListener('message', onMessage);
  };
  window.addEventListener('message', onMessage);
  ask();
  return stop;
}

/** A MessagePort dressed up as the data channel the session code expects. */
function portChannel(port: MessagePort): RTCDataChannel {
  const channel = {
    readyState: 'open' as RTCDataChannelState,
    onmessage: null as ((e: { data: unknown }) => void) | null,
    onclose: null as (() => void) | null,
    onopen: null as (() => void) | null,
    send: (data: string) => port.postMessage(data),
    close: () => {
      channel.readyState = 'closed';
      port.close();
    },
  };
  port.onmessage = (e) => channel.onmessage?.({ data: e.data });
  return channel as unknown as RTCDataChannel;
}
