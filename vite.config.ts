import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from 'vite';
import { lanAddresses } from './server/lan.ts';
import { createRelay } from './server/relay.ts';

/** Runs the session relay inside the Vite dev/preview server (same port, path /ws). */
function relayPlugin(): Plugin {
  const setup = (server: ViteDevServer | PreviewServer) => {
    const port = () => (server.httpServer?.address() as AddressInfo | null)?.port ?? null;
    const relay = createRelay({ info: () => ({ lan: lanAddresses(), httpPort: port(), httpsPort: null }) });
    server.httpServer?.on('upgrade', (req, socket, head) => {
      relay.handleUpgrade(req, socket, head);
    });
    server.middlewares.use((req, res, next) => {
      relay.handleHttp(req, res).then((handled) => {
        if (!handled) next();
      }, next);
    });
    server.httpServer?.on('close', () => relay.close());
  };
  return { name: 'right-there-relay', configureServer: setup, configurePreviewServer: setup };
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

export default defineConfig(({ mode }) =>
  mode === 'single'
    ? {
        plugins: [react(), singleFile()],
        base: './',
        publicDir: false,
        build: {
          outDir: 'dist-single',
          emptyOutDir: true,
          assetsInlineLimit: 100_000_000,
          cssCodeSplit: false,
          modulePreload: false,
        },
      }
    : {
        plugins: [react(), relayPlugin()],
        server: { port: 5173, host: true },
        preview: { port: 4173, host: true },
      },
);
