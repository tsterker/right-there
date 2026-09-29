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
  heading?: { d: Vec; id: string; live: boolean } | null;
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

interface SpotProps {
  target: { pos: Vec; active: boolean };
  smooth: boolean;
  m: Mat2;
  /** Where the current nudge is going, in view space (cm). */
  heading: { d: Vec; id: string; live: boolean } | null;
  uid: string;
  /** Radius (cm). */
  r?: number;
}

/**
 * The spot: a soft cloud about the size of a palm, because it is where the
 * hands roughly are, not a point. While a nudge moves it, the cloud smudges
 * toward where it's going (further for faster moves) behind a faint
 * arrowhead, and pings once as the stroke starts. When the finger lifts, it
 * eases back into a round cloud.
 */
function Spot({ target, smooth, m, heading, uid, r = SPOT_R }: SpotProps) {
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
  const live = heading?.live ?? false;
  // Stretch along the heading with the back edge in place, so the smudge leads the spot.
  const k = live ? 1 + clamp(0.25 + len(heading!.d) * 0.1, 0.3, 0.65) : 1;
  const deg = heading ? f2((Math.atan2(heading.d.y, heading.d.x) * 180) / Math.PI) : 0;
  return (
    <g ref={ref} className={target.active ? 'map-dot is-active' : 'map-dot'}>
      <g transform={`rotate(${deg})`}>
        {heading && heading.id !== unpinged.current && <circle key={heading.id} r={r} className="map-ping" />}
        <g className="map-cloud">
          <ellipse
            rx={r}
            ry={r}
            className={`map-smudge${live ? ' is-live' : ''}`}
            fill={`url(#${uid}-cloud)`}
            style={{ transform: `translateX(${f2((k - 1) * r)}px) scaleX(${f2(k)})` }}
          />
        </g>
        <path
          d="M-2.4 -3.6 L0.6 0 L-2.4 3.6"
          className={`map-smudge-tip${live ? ' is-live' : ''}`}
          filter={`url(#${uid}-blur)`}
          style={{ transform: `translateX(${f2((2 * k - 1) * r - 1.2)}px)` }}
        />
      </g>
      <circle r={1.1} className="map-dot-core" />
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

  const spotHeading = (flip: boolean) =>
    heading && len(heading.d) > 0.3 ? { ...heading, d: apply(m, flip ? { x: -heading.d.x, y: heading.d.y } : heading.d) } : null;
  // Both sides: the spot and its mirror, each one hand wide; right by the spine the two are one spot on it.
  const r = bothSides ? SPOT_R * 0.75 : SPOT_R;
  const pair = target && bothSides && Math.abs(target.pos.x) > 2.5;
  const spot = target && bothSides && !pair ? { ...target, pos: { x: 0, y: target.pos.y } } : target;
  const twin = pair ? { ...target, pos: { x: -target.pos.x, y: target.pos.y } } : null;

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
        <filter id={`${uid}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
        <radialGradient id={`${uid}-cloud`}>
          <stop offset="0%" className="map-cloud-a" />
          <stop offset="45%" className="map-cloud-b" />
          <stop offset="100%" className="map-cloud-c" />
        </radialGradient>
      </defs>
      <g transform={`matrix(${m[0]} ${m[2]} ${m[1]} ${m[3]} 0 0)`}>
        <Anatomy uid={uid} />
        {trail && trail.length > 1 && (
          <polyline points={trail.map((p) => `${f2(p.x)},${f2(p.y)}`).join(' ')} className="map-trail" />
        )}
      </g>
      <g className="map-view">
        {spot && <Spot target={spot} smooth={smooth} m={m} heading={spotHeading(false)} uid={uid} r={r} />}
        {twin && <Spot key="twin" target={twin} smooth={smooth} m={m} heading={spotHeading(true)} uid={uid} r={r} />}
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
