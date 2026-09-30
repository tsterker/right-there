/**
 * The back map. Anatomy is drawn in body space (cm) inside one transformed
 * group, so the whole figure can be rotated/mirrored to match how a phone
 * lies (receiver) or where the giver stands. The spot and the side labels
 * are placed in view space so labels stay upright.
 */
import { memo, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react';
import {
  DRAW_BOUNDS,
  HEAD,
  LEFT_ARM,
  LEFT_ILIAC_CREST,
  LEFT_RIBS,
  LEFT_SCAPULA,
  LEFT_SCAPULA_SPINE,
  RIGHT_ARM,
  RIGHT_ILIAC_CREST,
  RIGHT_RIBS,
  RIGHT_SCAPULA,
  RIGHT_SCAPULA_SPINE,
  SACRAL_DIMPLES,
  TORSO_OUTLINE,
  VERTEBRAE,
} from '../../shared/body';
import { apply, clamp, len, MIRROR_X, mul, rotation, smoothPath, transpose, type Mat2, type Vec } from '../../shared/geometry';

export interface MapHandle {
  /** Client (CSS px) → body cm. */
  toBody(clientX: number, clientY: number): Vec | null;
}

export interface BackMapProps {
  angle?: number;
  mirrored?: boolean;
  target?: { pos: Vec; active: boolean } | null;
  /** Glide the dot toward new positions instead of jumping (network jitter). */
  smooth?: boolean;
  trail?: Vec[];
  /** Where the current nudge is going (body cm): the spot smudges that way. A new `id` (a new stroke) pings. */
  heading?: { d: Vec; speed: number; id: string; live: boolean } | null;
  /** Also draw the spot mirrored across the spine (working both sides). */
  bothSides?: boolean;
  dim?: boolean;
  /** 'torso' trims the top of the head and the arms' edges, so the back is drawn bigger. */
  crop?: 'full' | 'torso';
  handle?: Ref<MapHandle>;
}

export function viewMatrix(angle = 0, mirrored = false): Mat2 {
  const r = rotation(angle);
  return mirrored ? mul(r, MIRROR_X) : r;
}

const f2 = (v: number) => Math.round(v * 100) / 100;
const TORSO_BOUNDS = { minX: -27.5, maxX: 27.5, minY: -24, maxY: 66.5 };

function viewBoxFor(m: Mat2, crop: 'full' | 'torso'): string {
  const { minX, maxX, minY, maxY } = crop === 'torso' ? TORSO_BOUNDS : DRAW_BOUNDS;
  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: minX, y: maxY },
    { x: maxX, y: maxY },
  ].map((p) => apply(m, p));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const pad = 1.5;
  const x0 = Math.min(...xs) - pad;
  const y0 = Math.min(...ys) - pad;
  return `${f2(x0)} ${f2(y0)} ${f2(Math.max(...xs) + pad - x0)} ${f2(Math.max(...ys) + pad - y0)}`;
}

const TORSO_D = smoothPath(TORSO_OUTLINE, true, 0.9);
const ARM_DS = [smoothPath(LEFT_ARM, true, 0.8), smoothPath(RIGHT_ARM, true, 0.8)];

const Anatomy = memo(function Anatomy({ uid }: { uid: string }) {
  return (
    <>
      <defs>
        <radialGradient id={`${uid}-skin`} cx="50%" cy="38%" r="70%">
          <stop offset="0%" className="map-skin-a" />
          <stop offset="100%" className="map-skin-b" />
        </radialGradient>
        <linearGradient id={`${uid}-arm`} gradientUnits="userSpaceOnUse" x1="0" y1="10" x2="0" y2="60">
          <stop offset="0%" className="map-arm-a" />
          <stop offset="100%" className="map-arm-b" />
        </linearGradient>
        {/* The hips fade out like the arms, instead of closing into a bottom. */}
        <linearGradient id={`${uid}-hips`} gradientUnits="userSpaceOnUse" x1="0" y1="50" x2="0" y2="65">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`${uid}-fade`} maskUnits="userSpaceOnUse" x="-40" y="-40" width="80" height="120">
          <rect x="-40" y="-40" width="80" height="120" fill={`url(#${uid}-hips)`} />
        </mask>
      </defs>
      {ARM_DS.map((d, i) => (
        <path key={i} d={d} className="map-arm" fill={`url(#${uid}-arm)`} />
      ))}
      <path d={TORSO_D} className="map-torso" fill={`url(#${uid}-skin)`} mask={`url(#${uid}-fade)`} />
      <ellipse cx={HEAD.cx} cy={HEAD.cy} rx={HEAD.rx} ry={HEAD.ry} className="map-head" />
      <g className="map-anatomy">
        {[...LEFT_RIBS, ...RIGHT_RIBS].map((arc, i) => (
          <path key={`rib${i}`} d={smoothPath(arc, false)} className="map-rib" />
        ))}
        {[LEFT_SCAPULA, RIGHT_SCAPULA].map((s, i) => (
          <path key={`sc${i}`} d={smoothPath(s, true, 0.85)} className="map-bone" />
        ))}
        {[LEFT_SCAPULA_SPINE, RIGHT_SCAPULA_SPINE].map((s, i) => (
          <path key={`ss${i}`} d={smoothPath(s, false)} className="map-ridge" />
        ))}
        {[LEFT_ILIAC_CREST, RIGHT_ILIAC_CREST].map((s, i) => (
          <path key={`il${i}`} d={smoothPath(s, false)} className="map-crest" />
        ))}
        {SACRAL_DIMPLES.map((d, i) => (
          <circle key={`sd${i}`} cx={d.x} cy={d.y} r={0.8} className="map-dimple" />
        ))}
        <line x1={0} y1={-10.5} x2={0} y2={47.5} className="map-spine-line" />
        {VERTEBRAE.map((v) => (
          <rect
            key={v.label}
            x={-v.w / 2}
            y={v.y - 0.45}
            width={v.w}
            height={0.9}
            rx={0.45}
            className={v.label === 'C7' ? 'map-vertebra map-c7' : 'map-vertebra'}
          />
        ))}
      </g>
    </>
  );
});

const SPOT_R = 6.4;

interface Move {
  /** Direction (any length). */
  d: Vec;
  /** cm/s */
  speed: number;
  live: boolean;
}

/**
 * An angle (deg) that turns the short way round to each new value (CSS eases
 * the turn); holds while null. A near reversal flips instead (`flip`): turning
 * through the side would point somewhere the spot isn't going.
 */
function useTurn(target: number | null): { deg: number; flip: boolean } {
  const angle = useRef(target ?? 0);
  let flip = false;
  if (target !== null) {
    const delta = ((((target - angle.current) % 360) + 540) % 360) - 180;
    flip = Math.abs(delta) > 150;
    angle.current += delta;
  }
  return { deg: angle.current, flip };
}

/**
 * A soft blob about the size of a palm: where the hands roughly are, not a
 * point. While a nudge moves it, it smudges like a snail: the body stretches
 * the way it's going (further for faster moves) and a hot head runs ahead.
 * When the finger lifts, the head slides back in and the blob rounds again.
 */
function Blob({ r, move, uid, reach = 1 }: { r: number; move: Move | null; uid: string; reach?: number }) {
  const { deg, flip } = useTurn(move ? (Math.atan2(move.d.y, move.d.x) * 180) / Math.PI : null);
  const live = move?.live ?? false;
  // How far it smudges, in radii: further for faster moves.
  const k = live ? reach * clamp(0.9 + move!.speed * 0.03, 1, 1.5) : 0;
  const lead = k * r;
  const cls = live ? ' is-live' : '';
  return (
    <g className={`map-turn${flip ? ' is-flip' : ''}`} style={{ transform: `rotate(${f2(deg)}deg)` }}>
      <g className="map-cloud">
        <ellipse
          rx={r}
          ry={r}
          className={`map-smudge${cls}`}
          fill={`url(#${uid}-cloud)`}
          style={{ transform: `translateX(${f2(lead * 0.5)}px) scale(${f2(1 + k * 0.75)}, ${f2(1 - k * 0.12)})` }}
        />
        <circle r={r * 0.6} className={`map-blob-head${cls}`} fill={`url(#${uid}-hot)`} style={{ transform: `translateX(${f2(lead * 1.05)}px)` }} />
      </g>
    </g>
  );
}

interface SpotProps {
  target: { pos: Vec; active: boolean };
  smooth: boolean;
  m: Mat2;
  /** Where the current nudge is going, in view space (cm). */
  heading: { d: Vec; speed: number; id: string; live: boolean } | null;
  uid: string;
}

/** The spot: a blob that nudges smudge, and a ping as each stroke starts. */
function Spot({ target, smooth, m, heading, uid }: SpotProps) {
  const ref = useRef<SVGGElement>(null);
  const cur = useRef<Vec | null>(null);
  const { x, y } = apply(m, target.pos);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const put = (p: Vec) => el.setAttribute('transform', `translate(${f2(p.x)} ${f2(p.y)})`);
    if (!smooth || !cur.current) {
      cur.current = { x, y };
      put(cur.current);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const c = cur.current!;
      const k = 1 - Math.exp(-(t - last) / 70);
      last = t;
      c.x += (x - c.x) * k;
      c.y += (y - c.y) * k;
      put(c);
      if (Math.abs(x - c.x) + Math.abs(y - c.y) > 0.05) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [x, y, smooth]);
  // Only a stroke that starts while the spot is shown pings (not a twin appearing, nor a reconnect).
  const unpinged = useRef(heading?.id ?? null);
  return (
    <g ref={ref} className={target.active ? 'map-dot is-active' : 'map-dot'}>
      {heading && heading.id !== unpinged.current && <circle key={heading.id} r={SPOT_R} className="map-ping" />}
      <Blob r={SPOT_R} move={heading} uid={uid} />
      <circle r={1.1} className="map-dot-core" />
    </g>
  );
}

const HAND_R = SPOT_R * 0.75;

/** Follow `v` smoothly (network jitter), re-rendering each frame until it arrives. */
function useGlide(v: Vec, smooth: boolean): Vec {
  const [cur, setCur] = useState(v);
  const at = useRef(v);
  useEffect(() => {
    if (!smooth) {
      at.current = v;
      setCur(v);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const c = at.current;
      const k = 1 - Math.exp(-(t - last) / 70);
      last = t;
      const done = Math.abs(v.x - c.x) + Math.abs(v.y - c.y) < 0.05;
      at.current = done ? v : { x: c.x + (v.x - c.x) * k, y: c.y + (v.y - c.y) * k };
      setCur(at.current);
      if (!done) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [v.x, v.y, smooth]);
  return cur;
}

/**
 * Both sides: one shape in body space, centred on the spine: a blob for each
 * hand, joined by a faint bridge. Each blob smudges its own way, mirrored, so
 * a nudge apart pulls them outward and one upward pulls both up.
 */
function HandsPair({ target, smooth, heading, uid }: { target: { pos: Vec; active: boolean }; smooth: boolean; heading: BackMapProps['heading']; uid: string }) {
  const { x: w, y } = useGlide({ x: Math.abs(target.pos.x), y: target.pos.y }, smooth);
  const unpinged = useRef(heading?.id ?? null);
  const steered = target.pos.x < 0 ? -1 : 1;
  // Each hand's move: the steered one's, mirrored for the other side.
  const moveOf = (side: number): Move | null => (heading ? { ...heading, d: { x: heading.d.x * side * steered, y: heading.d.y } } : null);
  const hands = w < 1 ? [0] : [-1, 1];
  return (
    <g transform={`translate(0 ${f2(y)})`} className={target.active ? 'map-dot is-active' : 'map-dot'}>
      {heading && heading.id !== unpinged.current && <ellipse key={heading.id} rx={w + HAND_R} ry={HAND_R} className="map-ping" />}
      {w >= 1 && <ellipse rx={w} ry={HAND_R * 0.7} className="map-bridge" fill={`url(#${uid}-cloud)`} />}
      {hands.map((side) => (
        <g key={side} transform={`translate(${f2(side * w)} 0)`}>
          {/* Half the reach: close together, a hand's smudge would run past the other hand. */}
          <Blob r={HAND_R} move={side === 0 ? heading ?? null : moveOf(side)} uid={uid} reach={0.5} />
          <circle r={1.1} className="map-dot-core" />
        </g>
      ))}
    </g>
  );
}

export function BackMap(props: BackMapProps) {
  const { angle = 0, mirrored = false, target, smooth = false, trail, heading, bothSides = false, dim, crop = 'full', handle } = props;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const m = useMemo(() => viewMatrix(angle, mirrored), [angle, mirrored]);
  const inv = useMemo(() => transpose(m), [m]);
  const svgRef = useRef<SVGSVGElement>(null);

  useImperativeHandle(
    handle,
    () => ({
      toBody(clientX, clientY) {
        const ctm = svgRef.current?.getScreenCTM();
        if (!ctm) return null;
        const v = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
        return apply(inv, { x: v.x, y: v.y });
      },
    }),
    [inv],
  );

  const spotHeading = heading && len(heading.d) > 0.3 ? { ...heading, d: apply(m, heading.d) } : null;
  const line = (pts: Vec[]) => pts.map((p) => `${f2(p.x)},${f2(p.y)}`).join(' ');

  const labelY = crop === 'torso' ? -5 : -7;
  const labels = [
    { t: 'L', p: apply(m, { x: -24.5, y: labelY }) },
    { t: 'R', p: apply(m, { x: 24.5, y: labelY }) },
  ];

  return (
    <svg
      ref={svgRef}
      className={`map${dim ? ' is-dim' : ''}`}
      viewBox={viewBoxFor(m, crop)}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Map of the back"
    >
      <defs>
        <radialGradient id={`${uid}-hot`}>
          <stop offset="0%" className="map-hot-a" />
          <stop offset="55%" className="map-hot-b" />
          <stop offset="100%" className="map-hot-c" />
        </radialGradient>
        <radialGradient id={`${uid}-cloud`}>
          <stop offset="0%" className="map-cloud-a" />
          <stop offset="45%" className="map-cloud-b" />
          <stop offset="100%" className="map-cloud-c" />
        </radialGradient>
      </defs>
      <g transform={`matrix(${m[0]} ${m[2]} ${m[1]} ${m[3]} 0 0)`}>
        <Anatomy uid={uid} />
        {trail && trail.length > 1 && <polyline points={line(trail)} className="map-trail" />}
        {bothSides && trail && trail.length > 1 && <polyline points={line(trail.map((p) => ({ x: -p.x, y: p.y })))} className="map-trail" />}
        {bothSides && target && <HandsPair target={target} smooth={smooth} heading={heading} uid={uid} />}
      </g>
      <g className="map-view">
        {!bothSides && target && <Spot target={target} smooth={smooth} m={m} heading={spotHeading} uid={uid} />}
        {labels.map((l) => (
          <g key={l.t} transform={`translate(${f2(l.p.x)} ${f2(l.p.y)})`} className="map-side-label">
            <circle r={2.6} />
            <text dy="0.9">{l.t}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
