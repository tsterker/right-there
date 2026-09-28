/**
 * Massage knowledge base: techniques, symptoms, per-region guidance and the
 * session plan. Friendly home-massage advice, not medical advice.
 */
import type { Vec } from './geometry.ts';
import { classify, regionInfo, regionOrderIndex, type RegionBase, type RegionId } from './regions.ts';

export type TechniqueId =
  | 'glide'
  | 'knead'
  | 'thumbs'
  | 'hold'
  | 'palm'
  | 'forearm'
  | 'cross'
  | 'rake'
  | 'fingertips'
  | 'rest'
  | 'blade'
  | 'rock'
  | 'neckglide'
  | 'tap';

export interface Technique {
  id: TechniqueId;
  name: string;
  how: string;
  why: string;
}

export const TECHNIQUES: Record<TechniqueId, Technique> = {
  glide: {
    id: 'glide',
    name: 'Long gliding strokes',
    how: 'Flat, relaxed hands glide slowly with even pressure: up beside the spine, out over the shoulders, down the sides.',
    why: 'Warms the tissue, spreads oil, connects areas and calms.',
  },
  knead: {
    id: 'knead',
    name: 'Kneading',
    how: 'Grasp the muscle between thumb and fingers, lift gently, squeeze and roll — like kneading dough. Alternate hands in a slow rhythm.',
    why: 'Loosens general tightness in fleshy muscles.',
  },
  thumbs: {
    id: 'thumbs',
    name: 'Thumb circles',
    how: 'Anchor your hands, press with the pads (not the tips) of your thumbs and make small slow circles, a little deeper each pass.',
    why: 'Works into tight bands and along bone edges.',
  },
  hold: {
    id: 'hold',
    name: 'Press & hold',
    how: 'Find the tender spot and press steadily with a thumb or knuckle to about 6/10 intensity. Hold 20–60 s until it melts, then release slowly.',
    why: 'Classic trigger-point release for knots.',
  },
  palm: {
    id: 'palm',
    name: 'Palm compression',
    how: 'Heel of the hand, arms straight: lean in with body weight, press, release, move a hand-width, repeat.',
    why: 'Broad, deep pressure without poking.',
  },
  forearm: {
    id: 'forearm',
    name: 'Forearm glide',
    how: 'Use the flat, fleshy part of the forearm (not the elbow tip) and glide slowly along the muscle, leaning in with body weight.',
    why: 'Deep, even pressure that saves your thumbs.',
  },
  cross: {
    id: 'cross',
    name: 'Cross-fiber friction',
    how: "Short back-and-forth strokes across the muscle's direction with fingertips or thumb; let the skin move with you.",
    why: 'Loosens stringy, ropey spots.',
  },
  rake: {
    id: 'rake',
    name: 'Fingertip raking',
    how: 'Curve your fingers and rake down beside the spine with the fingertips, hand over hand.',
    why: 'Stimulating and relaxing along the spine muscles.',
  },
  fingertips: {
    id: 'fingertips',
    name: 'Fingertip circles',
    how: 'Small, slow circles with 2–3 fingertips; let the skin move with your fingers.',
    why: 'Precise and gentle for the neck and near bones.',
  },
  rest: {
    id: 'rest',
    name: 'Warm hold',
    how: 'Rest warm, still palms on the area for 3–5 slow breaths. No movement.',
    why: 'Soothing for sore or sensitive spots; a lovely start and finish.',
  },
  blade: {
    id: 'blade',
    name: 'Shoulder-blade release',
    how: 'Ask them to rest the back of their hand on their lower back so the blade edge lifts, then work your thumbs gently along and slightly under the inner edge.',
    why: 'Reaches muscles hidden under the blade edge.',
  },
  rock: {
    id: 'rock',
    name: 'Rocking',
    how: 'Palms on the lower back or hips; gently rock the body side to side in a slow rhythm.',
    why: 'Relaxes and loosens the lower back and hips.',
  },
  neckglide: {
    id: 'neckglide',
    name: 'Neck lengthening',
    how: 'Glide fingertips from the base of the skull down into the shoulders, one side at a time, very slowly.',
    why: 'Releases neck tension gently.',
  },
  tap: {
    id: 'tap',
    name: 'Light tapping',
    how: 'Loose, cupped hands tap quickly and lightly. Never on the spine or over the kidneys.',
    why: 'An energizing finish on big muscles.',
  },
};

/** Techniques the receiver can say they like during check-in. */
export const LIKEABLE: { id: TechniqueId; label: string }[] = [
  { id: 'glide', label: 'Long strokes' },
  { id: 'knead', label: 'Kneading' },
  { id: 'thumbs', label: 'Thumb work' },
  { id: 'hold', label: 'Pressure points' },
  { id: 'forearm', label: 'Deep & broad' },
  { id: 'rake', label: 'Fingertip raking' },
  { id: 'rock', label: 'Rocking' },
  { id: 'rest', label: 'Still, warm hands' },
];

export type SymptomKind = 'knot' | 'tight' | 'sore' | 'stiff' | 'tender' | 'avoid';

export interface Symptom {
  kind: SymptomKind;
  label: string;
  /** How the receiver would describe it. */
  feels: string;
  approach: string;
  techniques: TechniqueId[];
  /** Upper pressure level that still makes sense for this symptom. */
  maxPressure: number;
  color: string;
  glyph: string;
}

export const SYMPTOMS: Record<SymptomKind, Symptom> = {
  knot: {
    kind: 'knot',
    label: 'Knot',
    feels: 'A hard, tender lump',
    approach: 'Warm the area first, circle around the knot, then press & hold 30–60 s at about 6/10 and flush with strokes.',
    techniques: ['hold', 'thumbs', 'cross'],
    maxPressure: 5,
    color: '#f5a524',
    glyph: '●',
  },
  tight: {
    kind: 'tight',
    label: 'Tight',
    feels: 'Tense, wants to be stretched',
    approach: 'Knead and glide, building depth gradually. Press in as they breathe out.',
    techniques: ['knead', 'forearm', 'glide', 'palm'],
    maxPressure: 5,
    color: '#ef7d57',
    glyph: '≋',
  },
  sore: {
    kind: 'sore',
    label: 'Sore',
    feels: 'Achy, e.g. after a workout',
    approach: 'Broad, moderate pressure with palms and forearm. Avoid pinpoint pressure.',
    techniques: ['palm', 'glide', 'rest', 'forearm'],
    maxPressure: 3,
    color: '#c38cff',
    glyph: '✱',
  },
  stiff: {
    kind: 'stiff',
    label: 'Stiff',
    feels: 'Locked up, hard to move',
    approach: 'Warmth and slow movement: knead, rock and gently mobilize.',
    techniques: ['knead', 'rock', 'blade', 'glide'],
    maxPressure: 4,
    color: '#5ab0e8',
    glyph: '▦',
  },
  tender: {
    kind: 'tender',
    label: 'Tender',
    feels: 'Sensitive — go gently',
    approach: 'Light pressure only, slow strokes and still holds. Ask often.',
    techniques: ['rest', 'glide', 'fingertips'],
    maxPressure: 2,
    color: '#6fcf97',
    glyph: '♡',
  },
  avoid: {
    kind: 'avoid',
    label: 'Avoid',
    feels: 'Injury, bruise or skin issue',
    approach: 'Do not massage here. Work around it.',
    techniques: [],
    maxPressure: 0,
    color: '#ff5d5d',
    glyph: '⊘',
  },
};

export const SYMPTOM_ORDER: SymptomKind[] = ['knot', 'tight', 'sore', 'stiff', 'tender', 'avoid'];

interface RegionGuide {
  techniques: TechniqueId[];
  tip: string;
  caution?: string;
  /** Delicate areas: keep pressure moderate even if they ask for more. */
  delicate?: boolean;
}

export const REGION_GUIDE: Record<RegionBase, RegionGuide> = {
  skull_base: {
    techniques: ['fingertips', 'hold', 'neckglide'],
    tip: 'Hook your fingertips just under the ridge of the skull and press gently upward; hold 30 s. Lovely for tension headaches.',
    caution: 'Gentle only — no pressure on the bones of the head and neck.',
    delicate: true,
  },
  neck_mid: {
    techniques: ['fingertips', 'neckglide', 'knead'],
    tip: 'Work the ropey muscles on either side of the neck bones with fingertip circles.',
    caution: 'Never press on the neck bones or the front and sides of the throat.',
    delicate: true,
  },
  neck: {
    techniques: ['fingertips', 'neckglide', 'knead'],
    tip: 'Small fingertip circles along the side of the neck, then glide down into the shoulder.',
    caution: 'Light to medium only. Stay away from the front of the neck.',
    delicate: true,
  },
  trap: {
    techniques: ['knead', 'hold', 'thumbs', 'forearm'],
    tip: 'Squeeze the ridge between thumb and fingers like kneading dough. The #1 spot for knots — find the tender point and hold it.',
    caution: "Stay on the muscle; don't push down onto the collarbone.",
  },
  deltoid: {
    techniques: ['knead', 'palm', 'thumbs'],
    tip: 'Knead around the shoulder cap and make palm circles. Tender spots often hide at the back of the shoulder.',
  },
  rhomboid: {
    techniques: ['thumbs', 'blade', 'hold', 'cross'],
    tip: 'Thumb circles along the inner edge of the shoulder blade. For better access ask them to rest a hand on their lower back — the edge lifts.',
    caution: 'Work beside the spine, not on it.',
  },
  scapula: {
    techniques: ['thumbs', 'hold', 'palm', 'knead'],
    tip: 'The fleshy middle of the blade takes firm thumb or knuckle pressure. Knots here can send pain to the front of the shoulder — hold 30 s.',
  },
  upper_spine: {
    techniques: ['rake', 'glide', 'thumbs'],
    tip: 'Work 2–3 cm either side of the spine: fingertip raking, or thumbs walking down the muscle ridges.',
    caution: "Don't press directly on the spine bones.",
    delicate: true,
  },
  midback: {
    techniques: ['forearm', 'thumbs', 'palm', 'rake'],
    tip: 'Long forearm glides along the muscle ridge beside the spine, then thumb-walk down it.',
  },
  lats: {
    techniques: ['knead', 'glide', 'palm'],
    tip: 'Knead along the side of the rib cage and glide up from the waist toward the armpit.',
    caution: 'Ribs are springy — broad pressure, no poking.',
  },
  lowback: {
    techniques: ['palm', 'forearm', 'thumbs', 'rock'],
    tip: 'Heel-of-hand circles and slow forearm glides. For more depth lean in with body weight.',
    caution: 'Ease off over the lower ribs (kidney area) — no hard pressure or tapping there.',
  },
  flank: {
    techniques: ['hold', 'knead', 'palm'],
    tip: 'At the waist just above the hip bone, press your thumbs slowly in toward the spine and hold — a hidden source of lower back pain.',
    caution: 'Go in slowly and angle toward the spine, not down into the belly.',
  },
  lower_spine: {
    techniques: ['glide', 'palm', 'rock'],
    tip: 'Palms on either side of the spine: long strokes and gentle rocking.',
    caution: "Don't press directly on the lower spine.",
    delicate: true,
  },
  sacrum: {
    techniques: ['palm', 'rest', 'rock'],
    tip: 'Flat palm circles over the sacrum feel warm and grounding; add gentle rocking.',
    caution: 'Gentle; stay off the tailbone tip.',
    delicate: true,
  },
  hip: {
    techniques: ['palm', 'hold', 'knead', 'rock'],
    tip: 'Just below the hip bone ridge: palm or forearm compression and slow circles. Takes deeper pressure well.',
  },
};

export interface PressureLevel {
  level: number;
  label: string;
  how: string;
}

export const PRESSURE: PressureLevel[] = [
  { level: 1, label: 'Feather light', how: 'Fingertips or flat palms, almost no weight.' },
  { level: 2, label: 'Light', how: 'Relaxed hands, gentle even glide.' },
  { level: 3, label: 'Medium', how: 'Steady pressure through palms or thumbs.' },
  { level: 4, label: 'Firm', how: 'Lean in with body weight, arms straight — not muscle.' },
  { level: 5, label: 'Deep', how: 'Slow and steady through forearm or heel of hand. Check in often.' },
];

export const pressureLevel = (level: number): PressureLevel =>
  PRESSURE[Math.min(PRESSURE.length, Math.max(1, Math.round(level))) - 1];

export interface MarkerLike {
  kind: SymptomKind;
  pos: Vec;
}

/** Markers influence the hint when the target is this close (cm). */
export const MARKER_RADIUS = 7;
export const AVOID_RADIUS = 6;

export function nearestMarker<T extends MarkerLike>(markers: T[], p: Vec, radius: number, kinds?: SymptomKind[]): T | null {
  let best: T | null = null;
  let bestD = radius;
  for (const m of markers) {
    if (kinds && !kinds.includes(m.kind)) continue;
    const d = Math.hypot(m.pos.x - p.x, m.pos.y - p.y);
    if (d <= bestD) {
      best = m;
      bestD = d;
    }
  }
  return best;
}

export interface HintInput {
  pos: Vec;
  markers: MarkerLike[];
  pressure: number;
  likes: TechniqueId[];
  /** How often the receiver asked for "something different". */
  change: number;
}

export interface Hint {
  regionId: RegionId;
  regionName: string;
  muscle: string;
  symptom: Symptom | null;
  avoid: boolean;
  technique: Technique | null;
  alternatives: Technique[];
  tip: string;
  cautions: string[];
  pressure: PressureLevel;
}

export function hintFor(input: HintInput): Hint {
  const regionId = classify(input.pos);
  const info = regionInfo(regionId);
  const guide = REGION_GUIDE[info.base];
  const avoidMarker = nearestMarker(input.markers, input.pos, AVOID_RADIUS, ['avoid']);
  const marker = nearestMarker(
    input.markers,
    input.pos,
    MARKER_RADIUS,
    SYMPTOM_ORDER.filter((k) => k !== 'avoid'),
  );
  const symptom = marker ? SYMPTOMS[marker.kind] : null;

  const ordered: TechniqueId[] = [];
  const push = (id: TechniqueId) => {
    if (!ordered.includes(id)) ordered.push(id);
  };
  if (symptom) symptom.techniques.filter((t) => guide.techniques.includes(t)).forEach(push);
  guide.techniques.forEach(push);
  if (symptom) symptom.techniques.forEach(push);

  // Liked techniques move forward, keeping their relative order.
  const liked = ordered.filter((t) => input.likes.includes(t));
  const rest = ordered.filter((t) => !input.likes.includes(t));
  const candidates = symptom ? [...ordered] : [...liked, ...rest];

  const start = candidates.length ? input.change % candidates.length : 0;
  const rotated = [...candidates.slice(start), ...candidates.slice(0, start)];

  const cautions: string[] = [];
  if (avoidMarker) cautions.push('They marked this spot AVOID — move away and work around it.');
  if (guide.caution) cautions.push(guide.caution);
  if (symptom && input.pressure > symptom.maxPressure && symptom.maxPressure > 0) {
    cautions.push(`${symptom.label} spot: keep it at ${pressureLevel(symptom.maxPressure).label.toLowerCase()} pressure or below.`);
  }
  if (guide.delicate && input.pressure >= 4) {
    cautions.push('Delicate area — stay moderate here even if they like it firm elsewhere.');
  }

  return {
    regionId,
    regionName: info.name,
    muscle: info.muscle,
    symptom,
    avoid: Boolean(avoidMarker),
    technique: avoidMarker ? null : rotated[0] ? TECHNIQUES[rotated[0]] : null,
    alternatives: avoidMarker ? [] : rotated.slice(1, 3).map((t) => TECHNIQUES[t]),
    tip: avoidMarker ? SYMPTOMS.avoid.approach : symptom ? symptom.approach : guide.tip,
    cautions,
    pressure: pressureLevel(input.pressure),
  };
}

export interface PlanStep {
  id: string;
  kind: 'warmup' | 'focus' | 'cooldown';
  title: string;
  detail: string;
  minutes: number;
  regionId?: RegionId;
  pos?: Vec;
  symptoms?: SymptomKind[];
}

export interface Plan {
  steps: PlanStep[];
  avoid: { regionId: RegionId; name: string; pos: Vec }[];
  totalMinutes: number;
}

export function buildPlan(markers: MarkerLike[], durationMin: number | null, likes: TechniqueId[]): Plan {
  const total = durationMin ?? 20;
  const warm = Math.max(2, Math.min(5, Math.round(total * 0.15)));
  const cool = Math.max(1, Math.min(4, Math.round(total * 0.1)));
  const focusMinutes = Math.max(1, total - warm - cool);

  const groups = new Map<RegionId, { kinds: SymptomKind[]; pos: Vec[] }>();
  for (const m of markers) {
    if (m.kind === 'avoid') continue;
    const id = classify(m.pos);
    const g = groups.get(id) ?? { kinds: [], pos: [] };
    if (!g.kinds.includes(m.kind)) g.kinds.push(m.kind);
    g.pos.push(m.pos);
    groups.set(id, g);
  }

  let focus: PlanStep[] = [...groups.entries()]
    .sort((a, b) => regionOrderIndex(a[0]) - regionOrderIndex(b[0]))
    .map(([regionId, g]) => {
      const info = regionInfo(regionId);
      const pos = {
        x: g.pos.reduce((s, p) => s + p.x, 0) / g.pos.length,
        y: g.pos.reduce((s, p) => s + p.y, 0) / g.pos.length,
      };
      const hint = hintFor({ pos, markers, pressure: 3, likes, change: 0 });
      return {
        id: `focus:${regionId}`,
        kind: 'focus' as const,
        title: info.name,
        detail: `${g.kinds.map((k) => SYMPTOMS[k].label).join(' + ')} → ${hint.technique?.name ?? 'work around it'}`,
        minutes: 0,
        regionId,
        pos,
        symptoms: g.kinds,
      };
    });

  if (focus.length === 0) {
    focus = [
      { regionId: 'trap_r', title: 'Shoulders & neck', detail: 'Kneading the shoulder tops, fingertip circles up the neck' },
      { regionId: 'rhomboid_l', title: 'Between the shoulder blades', detail: 'Thumb circles along the blade edges' },
      { regionId: 'lowback_r', title: 'Lower back & hips', detail: 'Palm compression and forearm glides' },
    ].map((s) => ({
      id: `focus:${s.regionId}`,
      kind: 'focus' as const,
      title: s.title,
      detail: s.detail,
      minutes: 0,
      regionId: s.regionId,
      pos: regionInfo(s.regionId).centroid,
    }));
  }

  const each = focusMinutes / focus.length;
  focus.forEach((s) => (s.minutes = Math.round(each * 2) / 2));

  const avoid = markers
    .filter((m) => m.kind === 'avoid')
    .map((m) => {
      const regionId = classify(m.pos);
      return { regionId, name: regionInfo(regionId).name, pos: m.pos };
    });

  return {
    steps: [
      {
        id: 'warmup',
        kind: 'warmup',
        title: 'Warm up the whole back',
        detail: 'Long gliding strokes, light → medium. Spread the oil or lotion and let them settle in.',
        minutes: warm,
      },
      ...focus,
      {
        id: 'cooldown',
        kind: 'cooldown',
        title: 'Cool down',
        detail: 'Slow, light strokes from neck to lower back. Finish with warm, still palms for a few breaths.',
        minutes: cool,
      },
    ],
    avoid,
    totalMinutes: durationMin ?? warm + cool + focus.reduce((s, f) => s + f.minutes, 0),
  };
}

/** Which plan step we are in after `elapsedMin` minutes. */
export function currentStepIndex(plan: Plan, elapsedMin: number): number {
  let acc = 0;
  for (let i = 0; i < plan.steps.length; i++) {
    acc += plan.steps[i].minutes;
    if (elapsedMin < acc) return i;
  }
  return plan.steps.length - 1;
}

export const PREP_CHECKLIST = [
  'Warm room, towel or blanket for the parts not being massaged',
  'Massage oil or lotion within reach',
  'Short nails, no rings or watch',
  'Pillow under their ankles, head turned or in a face hole',
  'This phone propped up where you can glance at it',
  'Sound on (or one earbud in) for spoken cues',
];
