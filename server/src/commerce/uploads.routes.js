import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { pipeline } from 'node:stream/promises';
import { csrfProtection } from '../middleware/csrf.js';
import {
  assertUploadOwner, signUpload, completeUpload, deleteUpload, openPrivateUpload,
} from './uploads.js';

const router = Router();
const signSchema = z.object({
  purpose: z.enum(['personalization', 'artwork', 'payment_proof']),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
  productId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  fieldKey: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional(),
  checkoutKey: z.uuid().optional(),
  templateId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  templateVersion: z.number().int().positive().optional(),
}).strict();
const idSchema = z.string().regex(/^[a-f0-9]{24}$/i);
const signingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { ok: false, error: { code: 'UPLOAD_RATE_LIMIT', message: 'Too many upload attempts. Please try again later.' } },
});
const contentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { ok: false, error: { code: 'FILE_VIEW_RATE_LIMIT', message: 'Too many file requests. Please try again later.' } },
});

router.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.set('Vary', 'Cookie');
  next();
});
router.use(csrfProtection);

router.post('/sign', signingLimiter, async (req, res, next) => {
  try {
    const data = await signUpload(assertUploadOwner(req.commerceOwner), signSchema.parse(req.body));
    res.status(201).json({ ok: true, data });
  } catch (error) { next(error); }
});

router.post('/:id/complete', signingLimiter, async (req, res, next) => {
  try {
    const upload = await completeUpload(idSchema.parse(req.params.id), assertUploadOwner(req.commerceOwner));
    res.json({ ok: true, data: { upload } });
  } catch (error) { next(error); }
});

router.delete('/:id', signingLimiter, async (req, res, next) => {
  try {
    const data = await deleteUpload(idSchema.parse(req.params.id), assertUploadOwner(req.commerceOwner));
    res.json({ ok: true, data });
  } catch (error) { next(error); }
});

// The browser calls this only after a View File / View Proof action. No GET URL is ever signed publicly.
router.get('/:id/content', contentLimiter, async (req, res, next) => {
  const controller = new AbortController();
  const abort = () => { if (!res.writableFinished) controller.abort(); };
  req.once('aborted', abort); res.once('close', abort);
  try {
    const result = await openPrivateUpload(idSchema.parse(req.params.id), req.commerceOwner, { adminUser: req.user, signal: controller.signal });
    res.set('Content-Type', result.mimeType);
    res.set('Content-Length', String(result.sizeBytes));
    res.set('Content-Disposition', 'inline; filename="private-image"');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    await pipeline(result.body, res);
  } catch (error) {
    if (res.headersSent) res.destroy();
    else next(error);
  } finally { req.removeListener('aborted', abort); res.removeListener('close', abort); }
});

export default router;
export { router as uploadsRouter };
