import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { listProducts, getPublicProduct, listCategories, getPublicCategory } from '../catalog/service.js';
import { captureAction, monetaryParameters } from '../tracking/service.js';
import { parseInput, parseSlug, publicProductQuerySchema, categoryQuerySchema } from '../catalog/validation.js';

export function requireCatalogDatabase(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ ok: false, error: { code: 'CATALOG_UNAVAILABLE', message: 'Catalog database is unavailable' } });
  }
  next();
}

const router = Router();
router.use(requireCatalogDatabase);

router.get('/products', async (req, res) => {
  const query = parseInput(publicProductQuerySchema, req.query);
  const searchId = req.get('x-search-event-id');
  if (searchId && !query.q) return res.status(400).json({ ok: false, error: { code: 'INVALID_SEARCH_ACTION', message: 'A search action requires a valid search query.' } });
  const eventId = searchId ? parseInput(z.string().uuid(), searchId) : null;
  const result = await listProducts(query);
  const tracking = eventId ? await captureAction(req, 'Search', { content_type: 'product', content_ids: result.products.map(product => String(product._id)), num_items: result.pagination.total }, { sourcePath: '/shop', dedupKey: eventId }) : null;
  res.set('Cache-Control', tracking ? 'private, no-store' : 'public, max-age=0, must-revalidate');
  res.json({ ok: true, data: { ...result, tracking } });
});

router.get('/products/:slug', async (req, res) => {
  const product = await getPublicProduct(parseSlug(req.params.slug));
  const tracking = await captureAction(req, 'ViewContent', monetaryParameters([{ ...product, quantity: 1 }], product.pricePiastres), { sourcePath: `/products/${product.slug}` });
  res.set('Cache-Control', tracking ? 'private, no-store' : 'public, max-age=0, must-revalidate');
  res.json({ ok: true, data: { product, tracking } });
});

router.get('/categories/:slug', async (req, res) => res.json({ ok: true, data: { category: await getPublicCategory(parseSlug(req.params.slug)) } }));

router.get('/categories', async (req, res) => {
  const query = parseInput(categoryQuerySchema.omit({ active: true }), req.query);
  res.json({ ok: true, data: await listCategories(query) });
});

router.get('/categories/:slug/products', async (req, res) => {
  const query = parseInput(publicProductQuerySchema.omit({ category: true }), req.query);
  res.json({ ok: true, data: await listProducts({ ...query, category: parseSlug(req.params.slug) }) });
});

export default router;
