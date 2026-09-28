/** Camera QR scanner (rear camera on phones, webcam on laptops). */
import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';
import { useLatest } from '../lib/connection';

export const cameraAvailable = () => typeof navigator.mediaDevices?.getUserMedia === 'function';

export function QrScanner({ onResult, hint }: { onResult: (text: string) => void; hint?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [mirrored, setMirrored] = useState(false);
  const result = useLatest(onResult);

  useEffect(() => {
    let stopped = false;
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
      if (code?.data) {
        stopped = true;
        result.current(code.data);
      }
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
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
      })
      .catch((e: Error) => {
        setError(
          e.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow it in the browser, or paste the code instead.'
            : 'No camera available here — paste the code instead.',
        );
      });

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [result]);

  return (
    <div className="qr-scanner">
      {error ? (
        <p className="notice">{error}</p>
      ) : (
        <>
          <video ref={video} playsInline muted autoPlay className={mirrored ? 'is-mirrored' : ''} />
          <div className="qr-scanner-frame" aria-hidden />
          {hint && <p className="qr-scanner-hint">{hint}</p>}
        </>
      )}
    </div>
  );
}
