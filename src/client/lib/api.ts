import type { ClaimError, ClaimResponse, RoomInfo, ServerInfo } from '../../shared/protocol';
import type { Role } from '../../shared/session';
import { saveToken } from './storage';

async function call<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json' } });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T };
}

export async function createRoom(role: Role): Promise<ClaimResponse> {
  const { status, body } = await call<ClaimResponse>('/api/rooms', { method: 'POST', body: JSON.stringify({ role }) });
  if (status !== 201) throw new Error('Could not create a session. Is the server running?');
  saveToken(body.code, body.role, body.token);
  return body;
}

export async function claimRole(
  code: string,
  role?: Role,
  takeover = false,
): Promise<ClaimResponse | { error: ClaimError }> {
  const { status, body } = await call<ClaimResponse & { error?: ClaimError }>(`/api/rooms/${code}/claim`, {
    method: 'POST',
    body: JSON.stringify({ role, takeover }),
  });
  if (status === 200) {
    saveToken(body.code, body.role, body.token);
    return body;
  }
  return { error: body.error ?? 'bad-request' };
}

export async function getRoom(code: string): Promise<RoomInfo | null> {
  const { status, body } = await call<RoomInfo>(`/api/rooms/${code}`);
  return status === 200 ? body : null;
}

let infoPromise: Promise<ServerInfo | null> | null = null;
export function getServerInfo(): Promise<ServerInfo | null> {
  infoPromise ??= call<ServerInfo>('/api/info')
    .then((r) => (r.status === 200 ? r.body : null))
    .catch(() => null);
  return infoPromise;
}

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** A URL the other phone can open. Swaps localhost for the computer's LAN address. */
export async function shareableUrl(hashPath: string): Promise<string> {
  let origin = location.origin;
  if (LOCAL.has(location.hostname)) {
    const info = await getServerInfo();
    if (info?.lan[0]) origin = `${location.protocol}//${info.lan[0]}${location.port ? `:${location.port}` : ''}`;
  }
  return `${origin}/#${hashPath}`;
}

let relayPromise: Promise<boolean> | null = null;
/** Is this page served by the Right There server (relay)? False for a local file or static hosting. */
export function relayAvailable(): Promise<boolean> {
  relayPromise ??= location.protocol.startsWith('http')
    ? fetch('/api/info', { cache: 'no-store' })
        .then((r) => r.ok && (r.headers.get('content-type') ?? '').includes('json'))
        .catch(() => false)
    : Promise.resolve(false);
  return relayPromise;
}
