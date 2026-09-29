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
import { apply, len, MIRROR_X, mul, rotation, smoothPath, sub, transpose, type Mat2, type Vec } from '../../shared/geometry';

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
  /** The latest nudge: the spot points its way. `id` changes per stroke and on release, replaying the cue. */
  heading?: { from: Vec; to: Vec; id: string; live: boolean } | null;
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

interface SpotProps {
  target: { pos: Vec; active: boolean };
  smooth: boolean;
  m: Mat2;
  /** View-space direction of the latest nudge. */
  heading: { dir: Vec; id: string; live: boolean } | null;
  uid: string;
}

/**
 * The spot: a soft cloud about the size of a palm, because it is where the
 * hands roughly are, not a point. After a nudge it leans the nudge's way,
 * chevrons march ahead of it and a ring pings once, so a glance catches it.
 */
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
  const deg = heading ? f2((Math.atan2(heading.dir.y, heading.dir.x) * 180) / Math.PI) : 0;
  return (
    <g ref={ref} className={target.active ? 'map-dot is-active' : 'map-dot'}>
      <g transform={`rotate(${deg})`}>
        {/* Leaning the nudge's way: the hands are somewhere along that line. */}
        <ellipse rx={heading ? 8.4 : 6.4} ry={heading ? 5.2 : 6.4} cx={heading ? 1.6 : 0} className="map-cloud" fill={`url(#${uid}-cloud)`} />
        {heading && (
          <g key={heading.id} className={heading.live ? 'map-heading is-live' : 'map-heading'}>
            {!heading.live && <circle r={6.4} className="map-ping" />}
            {[10, 13.5].map((cx, i) => (
              <path key={cx} d={`M${cx - 1.6} -2.6 L${cx + 0.8} 0 L${cx - 1.6} 2.6`} className="map-chevron" style={{ animationDelay: `${i * 0.18}s` }} />
            ))}
          </g>
        )}
      </g>
      <circle r={1.1} className="map-dot-core" />
    </g>
  );
}

export function BackMap(props: BackMapProps) {
  const { angle = 0, mirrored = false, target, smooth = false, trail, heading, dim, crop = 'full', handle } = props;
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

  const dir = heading ? apply(m, sub(heading.to, heading.from)) : null;
  const spotHeading = heading && dir && len(dir) > 0.5 ? { dir, id: heading.id, live: heading.live } : null;

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
        {target && <Spot target={target} smooth={smooth} m={m} heading={spotHeading} uid={uid} />}
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
