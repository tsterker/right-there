import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { defineConfig, type Plugin } from 'vite';

/**
 * Its own port, apart from Vite's default 5173 that other projects use too (they
 * would share this app's saved settings). Strict: QR codes shown on this
 * computer contain the port, so a silently moved server would send phones elsewhere.
 */
const PORT = 4747;

/**
 * Where a phone reaches the dev server, for the QR codes shown on this
 * computer: the tunnel of `npm run dev:phone`, else this computer's address
 * on the Wi-Fi.
 */
function devAppUrl(): string {
  if (process.env.DEV_APP_URL) return process.env.DEV_APP_URL;
  const found: { ip: string; score: number }[] = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      const lan = /^(192\.168|10)\.|^172\.(1[6-9]|2\d|3[01])\./.test(a.address);
      found.push({ ip: a.address, score: (lan ? 0 : 10) + (/^(en|eth|wl)/.test(name) ? 0 : 5) });
    }
  }
  found.sort((a, b) => a.score - b.score);
  return found.length ? `http://${found[0].ip}:${PORT}/` : '';
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const base64 = (path: string) => readFileSync(path).toString('base64');

/** Inline the script, styles and icons into index.html: one file that works from disk (file://) or any static host. */
function singleFile(): Plugin {
  return {
    name: 'right-there-single-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName.endsWith('.html'));
      if (!html || html.type !== 'asset') return;
      let source = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && file.isEntry) {
          // Keep the HTML parser from ending the inline script early.
          const code = file.code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
          source = source.replace(new RegExp(`<script[^>]*src="[^"]*${escapeRegExp(name)}"[^>]*></script>`), () => `<script type="module">${code}</script>`);
          delete bundle[name];
        } else if (file.type === 'asset' && name.endsWith('.css')) {
          const css = String(file.source);
          source = source.replace(new RegExp(`<link[^>]*href="[^"]*${escapeRegExp(name)}"[^>]*>`), () => `<style>${css}</style>`);
          delete bundle[name];
        }
      }
      source = source
        .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="data:image/svg+xml;base64,${base64('public/icon.svg')}" type="image/svg+xml" />`)
        .replace(/<link rel="apple-touch-icon"[^>]*>/, `<link rel="apple-touch-icon" href="data:image/png;base64,${base64('public/icon-180.png')}" />`)
        .replace(/\s*<link rel="manifest"[^>]*>/, '');
      html.source = source;
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), singleFile()],
  base: './',
  define: { __DEV_APP_URL__: JSON.stringify(command === 'serve' ? devAppUrl() : '') },
  publicDir: command === 'build' ? false : 'public',
  server: { port: PORT, strictPort: true, host: true, allowedHosts: ['.trycloudflare.com'] },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: false,
  },
}));
