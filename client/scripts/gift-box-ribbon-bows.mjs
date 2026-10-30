// Allowlisted local-only ribbon artwork; never falls back to production or
// exposes merchant source files/other filesystem paths.
import { readFile, lstat, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RIBBON_BOW_FILES, RIBBON_BOW_VERSION } from '../../shared/gift-box/ribbon-bows.mjs';

const root = fileURLToPath(new URL(`../.gift-box-assets/${RIBBON_BOW_VERSION}/`, import.meta.url));
const prefix = `/__gift-box-ribbon-bows/${RIBBON_BOW_VERSION}/`;
const known = new Map(RIBBON_BOW_FILES.map(item => [item.filename,item.componentId]));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const loopback = address => ['127.0.0.1','::1','::ffff:127.0.0.1','localhost','[::1]'].includes(address);

export function allowedRibbonBowEntry(entry, filename) {
  return Boolean(entry && known.get(filename) === entry.componentId && entry.filename === filename
    && /^[a-f0-9]{64}$/.test(entry.sha256) && Number.isSafeInteger(entry.bytes) && entry.bytes > 0
    && entry.bytes <= 10485760 && entry.width >= 512 && entry.height >= 512);
}
export async function readLocalRibbonBow(filename) {
  if (!known.has(filename)) throw new Error('Unknown ribbon.');
  const manifest = JSON.parse(await readFile(path.join(root,'development-manifest.json'),'utf8'));
  if (manifest.version !== RIBBON_BOW_VERSION || manifest.developmentOnly !== true || manifest.productionApproved !== false
    || !Array.isArray(manifest.entries) || manifest.entries.length !== 21
    || new Set(manifest.entries.map(e=>e.filename)).size !== 21
    || !manifest.entries.every(entry=>allowedRibbonBowEntry(entry,entry.filename))) throw new Error('Invalid local bow manifest.');
  const entry = manifest.entries.find(item => item.filename === filename);
  if (!allowedRibbonBowEntry(entry,filename)) throw new Error('Unlisted ribbon.');
  const target = path.resolve(root,filename);
  if (path.dirname(target) !== path.resolve(root)) throw new Error('Invalid ribbon path.');
  let cursor=target;
  while (true) {
    if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Links forbidden.');
    const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;
  }
  if (path.resolve(await realpath(target)) !== target) throw new Error('Path resolution changed.');
  const bytes = await readFile(target);
  if (bytes.length!==entry.bytes || hash(bytes)!==entry.sha256) throw new Error('Ribbon changed after preparation.');
  return bytes;
}
export default function giftBoxRibbonBows() {
  return { name:'gift-box-ribbon-bows-local',apply:'serve',configureServer(server) {
    server.middlewares.use(async(req,res,next)=>{
      if (!req.url.startsWith('/__gift-box-ribbon-bows/')) return next();
      res.setHeader('Cache-Control','private, no-store');
      res.setHeader('Cross-Origin-Resource-Policy','same-origin');
      res.setHeader('X-Robots-Tag','noindex,nofollow');
      try {
        const url=new URL(req.url,'http://localhost');
        const host=new URL(`http://${req.headers.host}`).hostname;
        if (!loopback(req.socket.remoteAddress) || !loopback(host)
          || !['GET','HEAD'].includes(req.method) || !url.pathname.startsWith(prefix) || url.search
          || (req.headers.origin && req.headers.origin!==`http://${req.headers.host}`)) throw Error('Local-only.');
        const bytes=await readLocalRibbonBow(url.pathname.slice(prefix.length));
        res.setHeader('Content-Type','image/webp');res.setHeader('X-Content-Type-Options','nosniff');
        res.statusCode=200;res.end(req.method==='HEAD'?undefined:bytes);
      } catch {res.statusCode=404;res.end('Ribbon artwork unavailable.');}
    });
  }};
}
