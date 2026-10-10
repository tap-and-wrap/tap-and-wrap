import { Router, raw } from 'express';
import rateLimit from 'express-rate-limit';
import { requireCatalogDatabase } from './catalog.routes.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { saveAdminMedia, listAdminMedia } from '../catalog/admin-media.js';

const router = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
router.use((req, res, next) => { res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }); next(); });
router.use(requireCatalogDatabase, requireAuth, requireAdmin);
router.get('/', async (req, res, next) => {
  try {
    const { kind = 'product', cursor, limit = '20' } = req.query;
    if (typeof kind !== 'string' || (cursor && typeof cursor !== 'string') || !/^\d{1,2}$/.test(limit)) return res.status(400).json({ ok: false, error: { code: 'INVALID_MEDIA_REQUEST' } });
    res.json({ ok: true, data: await listAdminMedia({ kind, cursor, limit: Number(limit) }) });
  } catch (error) { next(error); }
});
router.post('/upload', csrfProtection, limiter, raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '10mb', inflate: false }), async (req, res, next) => {
  try {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ ok: false, error: { code: 'INVALID_MEDIA_REQUEST' } });
    const { kind = 'product', focus = 'attention' } = req.query;
    if (typeof kind !== 'string' || typeof focus !== 'string') return res.status(400).json({ ok: false, error: { code: 'INVALID_MEDIA_REQUEST' } });
    const image = await saveAdminMedia(req.body, { kind, focus, mimeType: req.headers['content-type']?.split(';')[0] });
    res.status(201).json({ ok: true, data: { image } });
  } catch (error) { next(error); }
});
export default router;
