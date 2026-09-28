import { networkInterfaces } from 'node:os';

const isPrivate = (ip: string) =>
  ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);

/** IPv4 addresses other devices on the same Wi-Fi can use to reach this machine. */
export function lanAddresses(): string[] {
  const found: { ip: string; name: string }[] = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      found.push({ ip: a.address, name });
    }
  }
  const score = (f: { ip: string; name: string }) =>
    (isPrivate(f.ip) ? 0 : 10) + (/^(en|eth|wlan|wl)/.test(f.name) ? 0 : 5) + (f.ip.startsWith('192.168.') ? 0 : 1);
  return found.sort((a, b) => score(a) - score(b)).map((f) => f.ip);
}
