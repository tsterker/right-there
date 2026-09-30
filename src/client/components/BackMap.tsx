/**
 * The back map. Anatomy is drawn in body space (cm) inside one transformed
 * group, so the whole figure can be rotated/mirrored to match how a phone
 * lies (receiver) or where the giver stands. The spot and the side labels
 * are placed in view space so labels stay upright.
 */
import { memo, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, type Ref } from 'react';
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
import { apply, clamp, len, MIRROR_X, mul, rotation, smoothPath, sub, transpose, type Mat2, type Vec } from '../../shared/geometry';
import { useLook } from '../lib/look';
import { restingAt, stepSmudge, stirring, type Smudge } from '../lib/smudge';

export interface MapHandle {
  /** Client (CSS px) → body cm. */
  toBody(clientX: number, clientY: number): Vec | null;
}

export interface BackMapProps {
  angle?: number;
  mirrored?: boolean;
  target?: { pos: Vec; active: boolean } | null;
  /** Glide the spot toward new positions instead of jumping (network jitter). */
  smooth?: boolean;
  /** The current nudge stroke's id: each new one pings once. */
  ping?: string | null;
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
const HAND_R = SPOT_R * 0.75;
/** Circles strung from the blob's mass to its core; the goo filter melts them into one shape. */
const BEADS = 7;

/** The latest stroke seen, so its ping plays out after the finger lifts (the id is only set while it's down). */
function usePing(ping: string | null | undefined): string | null {
  const last = useRef<string | null>(null);
  if (ping) last.current = ping;
  return last.current;
}

/**
 * The spot: a hot core where it is, in a soft blob about the size of a palm
 * (where the hands roughly are, not a point). The blob's mass follows the
 * core on a spring, so a nudge pulls it into a smudge from where it was toward
 * where it is, with a tip running ahead of the core so even a small move
 * shows its direction; then it catches up and rounds again. The look is
 * tunable (see lib/look.ts). Drawn imperatively, one frame at a time, while
 * anything moves.
 */
function Goo({ at, smooth, r, uid, active, ping }: { at: Vec; smooth: boolean; r: number; uid: string; active: boolean; ping?: string | null }) {
  const pinged = usePing(ping);
  const core = useRef<SVGGElement>(null);
  const beads = useRef<(SVGCircleElement | null)[]>([]);
  const tipRef = useRef<SVGPathElement>(null);
  const sim = useRef<{ head: Vec; smudge: Smudge } | null>(null);
  const [look] = useLook();
  const tuned = useRef(look);
  tuned.current = look;
  useLayoutEffect(() => {
    const s = (sim.current ??= { head: { ...at }, smudge: restingAt(at) });
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const put = (el: SVGCircleElement | null, p: Vec, radius: number) => {
      el?.setAttribute('cx', `${f2(p.x)}`);
      el?.setAttribute('cy', `${f2(p.y)}`);
      el?.setAttribute('r', `${f2(radius)}`);
    };
    const draw = () => {
      const { tail, stretch, point } = tuned.current;
      const { head } = s;
      const lag = sub(s.smudge.mass, head);
      const l = len(lag);
      const reach = Math.min(l * tail, stretch * r);
      // Unit vector the way it's going (away from the mass).
      const ahead = l > 0 ? { x: -lag.x / l, y: -lag.y / l } : { x: 0, y: 0 };
      const mass = { x: head.x - ahead.x * reach, y: head.y - ahead.y * reach };
      core.current?.setAttribute('transform', `translate(${f2(head.x)} ${f2(head.y)})`);
      // Stretched out, the mass thins (it's the same blob, spread over more length).
      const shrink = clamp(1 - reach / (5 * r), 0.62, 1);
      for (let i = 0; i < BEADS; i++) {
        const t = i / (BEADS - 1);
        put(beads.current[i], { x: mass.x + (head.x - mass.x) * t, y: mass.y + (head.y - mass.y) * t }, r * (shrink + (0.6 - shrink) * t));
      }
      // The tip: a cone off the head, so the blob comes to a point the way it's going. Full
      // length as soon as the move is noticeable, so small nudges point too.
      const tip = point * r * clamp(reach / (0.25 * r), 0, 1);
      if (tip < 0.05) tipRef.current?.setAttribute('d', '');
      else {
        const w = r * 0.55;
        const side = { x: -ahead.y * w, y: ahead.x * w };
        const apex = { x: head.x + ahead.x * (r * 0.6 + tip), y: head.y + ahead.y * (r * 0.6 + tip) };
        tipRef.current?.setAttribute(
          'd',
          `M${f2(head.x + side.x)} ${f2(head.y + side.y)}L${f2(apex.x)} ${f2(apex.y)}L${f2(head.x - side.x)} ${f2(head.y - side.y)}Z`,
        );
      }
    };
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const g = smooth ? 1 - Math.exp((-dt * 1000) / 70) : 1;
      s.head = { x: s.head.x + (at.x - s.head.x) * g, y: s.head.y + (at.y - s.head.y) * g };
      const look = tuned.current;
      s.smudge = still ? restingAt(s.head) : stepSmudge(s.smudge, s.head, dt, (look.stretch * r) / look.tail, look);
      draw();
      if (Math.abs(at.x - s.head.x) + Math.abs(at.y - s.head.y) > 0.02 || stirring(s.smudge, s.head)) raf = requestAnimationFrame(step);
    };
    draw();
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [at.x, at.y, smooth, r]);
  return (
    <g className={active ? 'map-dot is-active' : 'map-dot'}>
      <g className="map-goo" filter={`url(#${uid}-goo)`}>
        {Array.from({ length: BEADS }, (_, i) => (
          <circle key={i} ref={(el) => void (beads.current[i] = el)} r={r} />
        ))}
        <path ref={tipRef} />
      </g>
      <g ref={core} className="map-spot-core">
        {pinged && <circle key={pinged} r={r} className="map-ping" />}
        <circle r={r * 0.5} className="map-hot" fill={`url(#${uid}-hot)`} />
      </g>
    </g>
  );
}

/**
 * Both sides: a blob for each hand, mirrored across the spine and joined by a
 * faint bridge; each smudges its own way. Drawn in body space.
 */
function HandsPair({ target, smooth, uid, ping }: { target: { pos: Vec; active: boolean }; smooth: boolean; uid: string; ping?: string | null }) {
  const w = Math.abs(target.pos.x);
  const { y } = target.pos;
  const hands = w < 1 ? [0] : [-1, 1];
  return (
    <g>
      {w >= 1 && <ellipse cx={0} cy={y} rx={w} ry={HAND_R * 0.6} className="map-bridge" fill={`url(#${uid}-cloud)`} />}
      {hands.map((side) => (
        <Goo key={side} at={{ x: side * w, y }} smooth={smooth} r={HAND_R} uid={uid} active={target.active} ping={ping} />
      ))}
    </g>
  );
}

export function BackMap(props: BackMapProps) {
  const { angle = 0, mirrored = false, target, smooth = false, ping, bothSides = false, dim, crop = 'full', handle } = props;
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

  const [look] = useLook();

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
        {/* Melts overlapping circles into one soft-edged blob. */}
        <filter id={`${uid}-goo`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={look.goo} result="soft" />
          <feColorMatrix in="soft" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -5" result="blob" />
          <feGaussianBlur in="blob" stdDeviation="0.9" />
        </filter>
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
        {bothSides && target && <HandsPair target={target} smooth={smooth} uid={uid} ping={ping} />}
      </g>
      <g className="map-view">
        {!bothSides && target && <Goo at={apply(m, target.pos)} smooth={smooth} r={SPOT_R} uid={uid} active={target.active} ping={ping} />}
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
