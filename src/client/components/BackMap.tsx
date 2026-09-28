/**
 * The back map. Anatomy is drawn in body space (cm) inside one transformed
 * group, so the whole figure can be rotated/mirrored to match how a phone
 * lies (receiver) or where the giver stands. Anything with text is placed in
 * view space so labels stay upright.
 */
import { memo, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, type ReactNode, type Ref } from 'react';
import {
  DRAW_BOUNDS,
  HEAD,
  isOnBody,
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
  SACRUM,
  TORSO_OUTLINE,
  VERTEBRAE,
} from '../../shared/body';
import { apply, MIRROR_X, mul, rotation, smoothPath, transpose, type Mat2, type Vec } from '../../shared/geometry';
import { classify, type RegionId } from '../../shared/regions';
import { HEAT_CELL_CM } from '../../shared/session';
import { SYMPTOMS, type SymptomKind } from '../../shared/techniques';

export interface MapHandle {
  /** Client (CSS px) → body cm. */
  toBody(clientX: number, clientY: number): Vec | null;
  /** Body cm → client (CSS px). */
  toClient(p: Vec): { x: number; y: number } | null;
  /** Rendered size of one body centimetre in CSS px. */
  pxPerCm(): number;
}

export interface MapMarker {
  id: string;
  kind: SymptomKind;
  pos: Vec;
}

export type PointKind = 'truth' | 'felt' | 'favorite' | 'ouch' | 'landmark' | 'ghost' | 'finger';

export interface MapPoint {
  pos: Vec;
  kind: PointKind;
  label?: string;
}

export interface BackMapProps {
  angle?: number;
  mirrored?: boolean;
  markers?: MapMarker[];
  target?: { pos: Vec; active: boolean } | null;
  /** Glide the dot toward new positions instead of jumping (network jitter). */
  smooth?: boolean;
  trail?: Vec[];
  arrow?: { from: Vec; to: Vec } | null;
  highlight?: RegionId | null;
  heat?: Record<string, number> | null;
  points?: MapPoint[];
  links?: { from: Vec; to: Vec }[];
  labels?: boolean;
  dim?: boolean;
  /** 'torso' trims the top of the head and the arms' edges, so the back is drawn bigger. */
  crop?: 'full' | 'torso';
  className?: string;
  handle?: Ref<MapHandle>;
  children?: ReactNode;
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

// Region shapes for highlighting: union of small cells, computed once.
const CELL = 1.5;
let regionPaths: Map<RegionId, string> | null = null;
function regionPath(id: RegionId): string {
  if (!regionPaths) {
    regionPaths = new Map();
    for (let y = -12; y < 64; y += CELL) {
      for (let x = -24; x < 24; x += CELL) {
        const c = { x: x + CELL / 2, y: y + CELL / 2 };
        if (!isOnBody(c)) continue;
        const r = classify(c);
        regionPaths.set(r, `${regionPaths.get(r) ?? ''}M${f2(x)} ${f2(y)}h${CELL}v${CELL}h-${CELL}Z`);
      }
    }
  }
  return regionPaths.get(id) ?? '';
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
        <clipPath id={`${uid}-torso`}>
          <path d={TORSO_D} />
        </clipPath>
        <filter id={`${uid}-soft`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="0.9" />
        </filter>
      </defs>
      {ARM_DS.map((d, i) => (
        <path key={i} d={d} className="map-arm" fill={`url(#${uid}-arm)`} />
      ))}
      <path d={TORSO_D} className="map-torso" fill={`url(#${uid}-skin)`} />
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
          <path key={`il${i}`} d={smoothPath(s, false)} className="map-ridge" />
        ))}
        <path d={smoothPath(SACRUM, true, 0.7)} className="map-bone" />
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

function Heat({ heat, uid }: { heat: Record<string, number>; uid: string }) {
  const entries = Object.entries(heat);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <g clipPath={`url(#${uid}-torso)`} filter={`url(#${uid}-blur)`}>
      <defs>
        <filter id={`${uid}-blur`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.3" />
        </filter>
      </defs>
      {entries.map(([key, v]) => {
        const [ix, iy] = key.split(',').map(Number);
        return (
          <rect
            key={key}
            x={ix * HEAT_CELL_CM}
            y={iy * HEAT_CELL_CM}
            width={HEAT_CELL_CM}
            height={HEAT_CELL_CM}
            className="map-heat"
            opacity={0.15 + 0.75 * (v / max) ** 0.6}
          />
        );
      })}
    </g>
  );
}

function Dot({ target, smooth, m }: { target: { pos: Vec; active: boolean }; smooth: boolean; m: Mat2 }) {
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
  return (
    <g ref={ref} className={target.active ? 'map-dot is-active' : 'map-dot'}>
      <circle r={4.6} className="map-dot-halo" />
      <circle r={2.1} className="map-dot-core" />
    </g>
  );
}

export function BackMap(props: BackMapProps) {
  const {
    angle = 0,
    mirrored = false,
    markers,
    target,
    smooth = false,
    trail,
    arrow,
    highlight,
    heat,
    points,
    links,
    labels = true,
    dim,
    crop = 'full',
    className,
    handle,
    children,
  } = props;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const m = useMemo(() => viewMatrix(angle, mirrored), [angle, mirrored]);
  const inv = useMemo(() => transpose(m), [m]);
  const svgRef = useRef<SVGSVGElement>(null);
  const toView = (p: Vec) => apply(m, p);

  useImperativeHandle(
    handle,
    () => ({
      toBody(clientX, clientY) {
        const ctm = svgRef.current?.getScreenCTM();
        if (!ctm) return null;
        const v = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
        return apply(inv, { x: v.x, y: v.y });
      },
      toClient(p) {
        const ctm = svgRef.current?.getScreenCTM();
        if (!ctm) return null;
        const v = apply(m, p);
        const c = new DOMPoint(v.x, v.y).matrixTransform(ctm);
        return { x: c.x, y: c.y };
      },
      pxPerCm() {
        const ctm = svgRef.current?.getScreenCTM();
        return ctm ? Math.hypot(ctm.a, ctm.b) : 1;
      },
    }),
    [m, inv],
  );

  const bodyTransform = `matrix(${m[0]} ${m[2]} ${m[1]} ${m[3]} 0 0)`;
  const arrowId = `${uid}-arrow`;
  const labelY = crop === 'torso' ? -5 : -7;
  const labelPos = [
    { t: 'L', p: toView({ x: -24.5, y: labelY }) },
    { t: 'R', p: toView({ x: 24.5, y: labelY }) },
  ];

  return (
    <svg
      ref={svgRef}
      className={`map${dim ? ' is-dim' : ''}${className ? ` ${className}` : ''}`}
      viewBox={viewBoxFor(m, crop)}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Map of the back"
    >
      <defs>
        <marker id={arrowId} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className="map-arrow-head" />
        </marker>
      </defs>
      <g transform={bodyTransform}>
        <Anatomy uid={uid} />
        {heat && Object.keys(heat).length > 0 && <Heat heat={heat} uid={uid} />}
        {highlight && (
          <g clipPath={`url(#${uid}-torso)`}>
            <path d={regionPath(highlight)} className="map-highlight" filter={`url(#${uid}-soft)`} />
          </g>
        )}
        {links?.map((l, i) => (
          <line key={i} x1={l.from.x} y1={l.from.y} x2={l.to.x} y2={l.to.y} className="map-link" />
        ))}
        {trail && trail.length > 1 && (
          <polyline points={trail.map((p) => `${f2(p.x)},${f2(p.y)}`).join(' ')} className="map-trail" />
        )}
        {arrow && (
          <line
            x1={arrow.from.x}
            y1={arrow.from.y}
            x2={arrow.to.x}
            y2={arrow.to.y}
            className="map-arrow"
            markerEnd={`url(#${arrowId})`}
          />
        )}
        {children}
      </g>
      <g className="map-view">
        {markers?.map((mk) => {
          const v = toView(mk.pos);
          const s = SYMPTOMS[mk.kind];
          return (
            <g key={mk.id} transform={`translate(${f2(v.x)} ${f2(v.y)})`} className={`map-marker kind-${mk.kind}`}>
              {mk.kind === 'avoid' && <circle r={6} className="map-avoid-zone" />}
              <circle r={2.3} fill={s.color} className="map-marker-dot" />
              <text className="map-marker-glyph" dy="0.8">
                {s.glyph}
              </text>
            </g>
          );
        })}
        {points?.map((pt, i) => {
          const v = toView(pt.pos);
          return (
            <g key={i} transform={`translate(${f2(v.x)} ${f2(v.y)})`} className={`map-point kind-${pt.kind}`}>
              {pt.kind === 'favorite' ? (
                <text className="map-point-glyph" dy="1">
                  ♥
                </text>
              ) : pt.kind === 'ouch' ? (
                <text className="map-point-glyph" dy="1">
                  ✕
                </text>
              ) : (
                <circle r={pt.kind === 'landmark' ? 4 : pt.kind === 'finger' ? 5 : pt.kind === 'ghost' ? 1 : 1.6} />
              )}
              {pt.label && (
                <text className="map-point-label" dy={-3.2}>
                  {pt.label}
                </text>
              )}
            </g>
          );
        })}
        {target && <Dot target={target} smooth={smooth} m={m} />}
        {labels &&
          labelPos.map((l) => (
            <g key={l.t} transform={`translate(${f2(l.p.x)} ${f2(l.p.y)})`} className="map-side-label">
              <circle r={2.6} />
              <text dy="0.9">{l.t}</text>
            </g>
          ))}
      </g>
    </svg>
  );
}
