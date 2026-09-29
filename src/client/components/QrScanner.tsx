/** Camera QR scanner (rear camera on phones, switchable; webcam on laptops). */
import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';
import { useLatest } from '../lib/connection';

export const cameraAvailable = () => typeof navigator.mediaDevices?.getUserMedia === 'function';

/** Why the camera didn't open, and what to do about it. */
function cameraError(e: Error): string {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  switch (e.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return ios
        ? 'Camera access is blocked for this site. In Safari: tap aA in the address bar → Website Settings → Camera → Allow (or Settings → Safari → Camera). Or paste the code instead.'
        : 'Camera access is blocked for this site. Tap the icon left of the address → Permissions → Camera → Allow. Or paste the code instead.';
    case 'NotReadableError':
    case 'AbortError':
      return 'The camera is busy. Close other apps or tabs using it, then try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera found here — paste the code instead.';
    default:
      return 'The camera didn’t open. If this page is open inside another app, open it in Safari or Chrome. Or paste the code instead.';
  }
}

/** Why there's no camera button at all, if we can tell. */
export const noCameraReason = () =>
  window.isSecureContext ? null : 'The camera only works on the https:// link of this page — paste the code, or open that link.';

/**
 * `onResult` returns false to ignore a code and keep scanning. `facing`: the
 * camera to start with; the back one, since that's what points at another
 * screen (a laptop's only webcam is picked either way).
 */
export function QrScanner({
  onResult,
  hint,
  facing = 'environment',
}: {
  onResult: (text: string) => boolean | void;
  hint?: string;
  facing?: 'environment' | 'user';
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mirrored, setMirrored] = useState(false);
  const [face, setFace] = useState(facing);
  const [cameras, setCameras] = useState(1);
  const result = useLatest(onResult);

  useEffect(() => {
    setError(null);
    let stopped = false;
    let ignored: string | null = null;
    let stream: MediaStream | null = null;
    let raf = 0;
    let last = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = (t: number) => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      const v = video.current;
      if (!v || !ctx || v.readyState < 2 || t - last < 110) return;
      last = t;
      const w = Math.min(720, v.videoWidth);
      const h = Math.round(v.videoHeight * (w / v.videoWidth));
      if (!w || !h) return;
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(v, 0, 0, w, h);
      const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
      if (code?.data && code.data !== ignored) {
        if (result.current(code.data) === false) ignored = code.data;
        else stopped = true;
      }
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: face, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = s;
        // Front cameras / webcams feel natural mirrored; decoding uses the raw frames.
        setMirrored(s.getVideoTracks()[0]?.getSettings().facingMode !== 'environment');
        const v = video.current;
        if (v) {
          v.srcObject = s;
          void v.play().catch(() => {});
        }
        raf = requestAnimationFrame(tick);
        // Labels and counts are only reliable once access was granted.
        navigator.mediaDevices
          .enumerateDevices()
          .then((ds) => !stopped && setCameras(ds.filter((d) => d.kind === 'videoinput').length))
          .catch(() => {});
      })
      .catch((e: Error) => {
        if (stopped) return;
        setError(`${cameraError(e)} (${e.name})`);
      });

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [result, attempt, face]);

  return (
    <div className="qr-scanner">
      {error ? (
        <div className="qr-scanner-error">
          <p>{error}</p>
          <button className="btn small" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <video ref={video} playsInline muted autoPlay className={mirrored ? 'is-mirrored' : ''} />
          <div className="qr-scanner-frame" aria-hidden />
          {hint && <p className="qr-scanner-hint">{hint}</p>}
          {cameras > 1 && (
            <button className="btn small qr-scanner-switch" onClick={() => setFace((f) => (f === 'user' ? 'environment' : 'user'))}>
              ⇄ Switch camera
            </button>
          )}
        </>
      )}
    </div>
  );
}
