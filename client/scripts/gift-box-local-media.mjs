// Development middleware only. No source collection or directory is made public.
import { readFile, lstat, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_VERSION, FIXED_COMPONENTS, ASSET_ISSUES } from '../../shared/gift-box/definitions.mjs';

export const MEDIA_PREFIX = `/__gift-box-local/${ASSET_VERSION}/`;
const root = fileURLToPath(new URL(`../.gift-box-assets/${ASSET_VERSION}/webp-v1/`, import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const loopback = value => ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost', '[::1]'].includes(value);
export function allowedMediaEntry(entry) {
  const definition = FIXED_COMPONENTS.find(item => item.id === entry.componentId);
  const source = definition?.[`${entry.role}Asset`];
  const width = entry.role === 'selection' ? ['320', '640'] : entry.role === 'placement' ? ['1200'] : [];
  return Boolean(source && width.some(value => entry.path === `${value}/${source}`)
    && entry.source === source && /^[a-f0-9]{64}$/.test(entry.sha256)
    && !ASSET_ISSUES.some(issue => issue.source === source && issue.blocksDevelopmentCopy));
}
export async function readLocalDerivative(relative) {
  const manifest = JSON.parse(await readFile(path.join(root, 'development-manifest.json'), 'utf8'));
  if (manifest.assetVersion !== ASSET_VERSION || manifest.developmentOnly !== true || manifest.productionApproved !== false) throw new Error('Invalid local manifest.');
  const entry = manifest.entries.find(item => item.path === relative);
  if (!entry || !allowedMediaEntry(entry)) throw new Error('Unknown derivative.');
  const target = path.resolve(root, relative);
  if (path.relative(root, target).startsWith('..') || path.isAbsolute(path.relative(root, target))) throw new Error('Invalid derivative.');
  let current = target;
  while (true) {
    if ((await lstat(current)).isSymbolicLink()) throw new Error('Linked media is forbidden.');
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
  if (path.relative(target, await realpath(target))) throw new Error('Media resolution changed.');
  const bytes = await readFile(target);
  if (bytes.length !== entry.bytes || hash(bytes) !== entry.sha256) throw new Error('Derivative integrity failed.');
  return bytes;
}
export default function giftBoxLocalMedia() {
  return { name: 'gift-box-local-media', apply: 'serve', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/__gift-box-local/')) return next();
      res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      try {
        const url = new URL(req.url, 'http://localhost');
        if (!loopback(req.socket.remoteAddress) || !loopback(new URL(`http://${req.headers.host}`).hostname)
          || !['GET', 'HEAD'].includes(req.method) || !url.pathname.startsWith(MEDIA_PREFIX) || url.search
          || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) throw new Error('Local access only.');
        const relative = url.pathname.slice(MEDIA_PREFIX.length);
        const bytes = await readLocalDerivative(relative);
        res.setHeader('Content-Type', 'image/webp'); res.setHeader('X-Content-Type-Options', 'nosniff');
        res.statusCode = 200; res.end(req.method === 'HEAD' ? undefined : bytes);
      } catch { res.statusCode = 404; res.end('Local builder artwork is unavailable.'); }
    });
  } };
}
