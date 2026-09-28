/** Wire format between phones and the relay. */
import type { Action, Role, SessionState } from './session.ts';

export type ClientMsg =
  | { t: 'hello'; code: string; role: Role; token: string }
  /** `id` (unique per phone) lets the server drop resent duplicates. */
  | { t: 'act'; a: Action; id?: string }
  | { t: 'sync' }
  | { t: 'ping'; c: number }
  /** Both phones continue in a fresh session with the roles reversed. */
  | { t: 'swap' };

export type ErrorCode = 'room-not-found' | 'bad-token' | 'bad-request' | 'replaced';

export type ServerMsg =
  /** `acked`: ids of this seat's recent actions already applied (so the phone can drop them from its resend queue). */
  | { t: 'welcome'; role: Role; code: string; state: SessionState; seq: number; now: number; acked: string[] }
  | { t: 'act'; a: Action; from: Role | 'server'; at: number; seq: number; id?: string }
  | { t: 'snapshot'; state: SessionState; seq: number; now: number }
  | { t: 'pong'; c: number; now: number }
  | { t: 'moved'; code: string; role: Role; token: string }
  | { t: 'error'; code: ErrorCode; message: string };

export interface ClaimResponse {
  code: string;
  role: Role;
  token: string;
}

export type ClaimError = 'room-not-found' | 'room-full' | 'role-taken' | 'bad-request';

export interface RoomInfo {
  code: string;
  phase: SessionState['phase'];
  seats: Record<Role, { claimed: boolean; connected: boolean }>;
}

export interface ServerInfo {
  lan: string[];
  httpPort: number | null;
  httpsPort: number | null;
}

export const CODE_LENGTH = 4;
export const isCode = (v: unknown): v is string => typeof v === 'string' && /^\d{4}$/.test(v);
export const isRole = (v: unknown): v is Role => v === 'A' || v === 'B';

export const WS_PATH = '/ws';
