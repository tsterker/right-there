import type { Vec } from '../../shared/geometry';
import type { Role } from '../../shared/session';
import { loadList, saveJSON } from './storage';

export interface HistoryEntry {
  id: string;
  date: number;
  role: Role;
  durationMs: number;
  topAreas: { name: string; ms: number }[];
  favorites: Vec[];
  ouches: Vec[];
  pressure: number;
  feedbackCounts: Record<string, number>;
  heat: Record<string, number>;
}

const KEY = 'mb.history';

export const loadHistory = (): HistoryEntry[] => loadList<HistoryEntry>(KEY);

export function saveHistoryEntry(entry: HistoryEntry) {
  const list = loadHistory().filter((e) => e.id !== entry.id);
  saveJSON(KEY, [entry, ...list].slice(0, 30));
}

export const clearHistory = () => saveJSON(KEY, []);
