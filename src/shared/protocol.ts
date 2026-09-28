/** Messages between the two devices (over the data channel, or in-page for the host's own screen). */
import type { Action, Role, SessionState } from './session.ts';

export type ClientMsg =
  | { t: 'hello' }
  /** `id` (unique per device) lets the host drop resent duplicates. */
  | { t: 'act'; a: Action; id?: string }
  | { t: 'sync' }
  | { t: 'ping'; c: number }
  /** Same devices, roles reversed. */
  | { t: 'swap' };

export type ServerMsg =
  /** `acked`: ids of this device's recent actions already applied (so it can drop them from its resend queue). */
  | { t: 'welcome'; role: Role; code: string; state: SessionState; seq: number; now: number; acked: string[] }
  | { t: 'act'; a: Action; from: Role | 'server'; at: number; seq: number; id?: string }
  | { t: 'snapshot'; state: SessionState; seq: number; now: number }
  | { t: 'pong'; c: number; now: number }
  | { t: 'error'; code: 'bad-request'; message: string };
