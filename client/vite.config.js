import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import giftBoxLocalMedia from './scripts/gift-box-local-media.mjs';
import giftBoxRibbonBows from './scripts/gift-box-ribbon-bows.mjs';

function protectedCatalogHeaders() {
  const middleware = (req, res, next) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { pathname = req.url.split('?')[0]; }
    if (/^\/(?:admin|cart|checkout|orders|my-orders|track-order|login|signup|forgot-password|reset-password|verify-email)(?:\/|$)/i.test(pathname) || /^\/products\/[^/]+\/customize\/?$/i.test(pathname)) {
      // Vite's HTML handler sets no-cache later. Keep protected documents private.
      const setHeader = res.setHeader.bind(res);
      res.setHeader = (name, value) => setHeader(name, name.toLowerCase() === 'cache-control' ? 'private, no-store' : value);
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      res.setHeader('Cache-Control', 'private, no-store');
    }
    next();
  };
  return { name: 'protected-catalog-headers', configureServer(server) { server.middlewares.use(middleware); }, configurePreviewServer(server) { server.middlewares.use(middleware); } };
}

export default defineConfig({
  envDir: process.env.TAP_WRAP_ISOLATED_TEST === 'true' ? false : undefined,
  plugins: [react(), tailwindcss(), giftBoxLocalMedia(), giftBoxRibbonBows(), protectedCatalogHeaders(), { name: 'isolated-no-network-hints', transformIndexHtml(html) {
    return process.env.TAP_WRAP_ISOLATED_TEST === 'true' ? html.replace(/<link\b[^>]*\brel="(?:preconnect|dns-prefetch)"[^>]*>/gi, '') : html;
  } }],
  // Playwright writes HTML trace resources while pages are still running.
  // Watching these artifacts triggers full reloads and aborts media/requests.
  server: { port: 5173, fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/local-data/**', '**/.gift-box-assets/**'] }, watch: { ignored: ['**/test-results*/**', '**/.gift-box-assets/**'] } },
  build: { outDir: 'dist' },
});
