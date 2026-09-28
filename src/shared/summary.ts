/** What happened in a session, for the recap screen and next time. */
import type { Vec } from './geometry.ts';
import { classify, regionInfo, type RegionId } from './regions.ts';
import { elapsedMs, type FeedbackKind, type SessionState } from './session.ts';
import { pressureLevel } from './techniques.ts';

export interface SessionSummary {
  durationMs: number;
  topAreas: { regionId: RegionId; name: string; ms: number }[];
  favorites: Vec[];
  ouches: Vec[];
  counts: Record<FeedbackKind, number>;
  pressure: number;
  notes: string[];
}

const unique = <T>(xs: T[]) => [...new Set(xs)];

export function summarize(s: SessionState): SessionSummary {
  const counts: Record<FeedbackKind, number> = { firmer: 0, softer: 0, good: 0, ouch: 0, slower: 0, faster: 0, change: 0 };
  for (const f of s.feedback) counts[f.kind] += 1;
  const favorites = s.feedback.filter((f) => f.kind === 'good' && f.pos).map((f) => f.pos!);
  const ouches = s.feedback.filter((f) => f.kind === 'ouch' && f.pos).map((f) => f.pos!);
  const topAreas = Object.entries(s.dwell)
    .filter(([, ms]) => ms >= 5000)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([regionId, ms]) => ({ regionId, name: regionInfo(regionId).name, ms }));

  const notes: string[] = [];
  const loved = unique(favorites.map((p) => regionInfo(classify(p)).name)).slice(0, 3);
  if (loved.length) notes.push(`Loved: ${loved.join(', ')}`);
  notes.push(`Pressure ended at ${pressureLevel(s.pressure).label.toLowerCase()} (${s.pressure}/5)`);
  const careful = unique(ouches.map((p) => regionInfo(classify(p)).name)).slice(0, 3);
  if (careful.length) notes.push(`Go gently on: ${careful.join(', ')}`);
  if (s.tempo < 0) notes.push('Prefers a slower pace');
  if (s.tempo > 0) notes.push('Prefers a quicker pace');
  if (counts.change >= 2) notes.push(`Enjoys variety — asked for something different ${counts.change}×`);
  if (topAreas[0]) notes.push(`Most attention: ${topAreas[0].name}`);

  return {
    durationMs: elapsedMs(s, s.timer.endedAt ?? s.timer.startedAt ?? 0),
    topAreas,
    favorites,
    ouches,
    counts,
    pressure: s.pressure,
    notes,
  };
}
