import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { requireCatalogDatabase } from './catalog.routes.js';
import { CatalogMedia } from '../models/CatalogMedia.js';
import { Product } from '../models/Product.js';
import { Category } from '../models/Category.js';
import { ComponentOption } from '../models/ComponentOption.js';
import { storeCatalogImage, CATALOG_IMAGE_MAX_BYTES, mediaError } from '../catalog/media-storage.js';
import { mediaUrlForKey } from '../catalog/public-presentation.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { env } from '../config/env.js';
import { recordAdminAudit } from '../commerce/audit.js';

const router = express.Router();
router.use(requireCatalogDatabase, requireAuth, requireAdmin, csrfProtection);
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 80, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { ok: false, error: { code: 'MEDIA_RATE_LIMIT', message: 'Too many image uploads. Try again later.' } } });
let inFlight = 0;
function capacity(req, res, next) {
  if (inFlight >= 3) return res.status(429).json({ ok: false, error: { code: 'MEDIA_BUSY', message: 'Other image uploads are finishing. Retry shortly.' } });
  inFlight++;
  let released = false;
  const release = () => { if (!released) { released = true; inFlight--; } };
  req.releaseMediaCapacity = release;
  const releaseIfParsing = () => { if (!req.mediaProcessing) release(); };
  res.once('finish', releaseIfParsing); res.once('close', releaseIfParsing);
  next();
}
router.get('/config', (req, res) => res.json({ ok: true, data: { baseUrl: mediaUrlForKey('catalog-media/check.png')?.replace(/catalog-media\/check\.png$/, '') || null, maxBytes: CATALOG_IMAGE_MAX_BYTES } }));
router.post('/', limiter, capacity, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: CATALOG_IMAGE_MAX_BYTES, inflate: false }), async (req, res) => {
  req.mediaProcessing = true;
  try {
  assertDatabaseWriteAllowed(CatalogMedia.db, env);
  if (!mediaUrlForKey('catalog-media/check.png')) throw mediaError();
  const verified = await storeCatalogImage(req.body, req.get('Content-Type'));
  // No catalog reference/receipt is created until full R2 read-back succeeds.
  const session = await CatalogMedia.db.startSession();
  let record;
  try {
    await session.withTransaction(async () => {
      assertDatabaseWriteAllowed(CatalogMedia.db, env);
      record = await CatalogMedia.findOneAndUpdate({ key: verified.key }, { $setOnInsert: { ...verified, uploadedBy: req.user._id } }, { upsert: true, new: true, session });
      await recordAdminAudit(req.user, { action: 'catalog.media.verified', resourceType: 'upload', resourceId: record._id,
        details: { sizeBytes: verified.sizeBytes, width: verified.width, height: verified.height } }, { session });
    });
  } catch (error) {
    // Concurrent identical uploads may race the unique receipt key. The winner is verified.
    if (error.code !== 11000) throw error;
    record = await CatalogMedia.findOne({ key: verified.key }).lean().maxTimeMS(3000);
    if (!record) throw mediaError();
  } finally { await session.endSession(); }
  res.status(201).json({ ok: true, data: { image: { key: record.key, url: mediaUrlForKey(record.key), width: record.width, height: record.height } } });
  } finally { req.releaseMediaCapacity(); }
});
// Bounded operational review. Unused does NOT mean safe to delete: history may reference it.
router.get('/', async (req, res) => {
  const page = Number(req.query.page || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 200) throw mediaError('Invalid media page.', 400);
  const images = await CatalogMedia.find({}).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 20).limit(20).lean().maxTimeMS(3000);
  const records = await Promise.all(images.map(async image => {
    const filter = { $or: [{ mainImageKey: image.key }, { galleryKeys: image.key }] };
    const refs = await Promise.all([Product.exists(filter).maxTimeMS(3000), ComponentOption.exists(filter).maxTimeMS(3000), Category.exists({ imageKey: image.key }).maxTimeMS(3000)]);
    return { key: image.key, url: mediaUrlForKey(image.key), createdAt: image.createdAt, catalogReferenced: refs.some(Boolean), deletionAllowed: false };
  }));
  res.json({ ok: true, data: { images: records, page, deletionPolicy: 'Retained: catalog removal never deletes stored images or order history.' } });
});
router.use((error, req, res, next) => {
  if (error.code !== 'CATALOG_MEDIA_UNAVAILABLE') return next(error);
  return res.status(503).json({ ok: false, error: { code: error.code, message: 'Catalog image storage is unavailable. Your saved images have not changed. Retry uploading later.' } });
});
export default router;
