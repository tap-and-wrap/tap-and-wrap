import { env } from '../config/env.js';
import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { productSeoSignature } from '../../../shared/product-seo.mjs';
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

// Address/status attestation, not a catalog/SEO export. No cookies, tracking,
// financial values, storage keys or private product identities are returned.
router.get('/product-addresses', async (req, res) => {
  const { slugs } = parseInput(z.object({ slugs: z.string().max(6019).transform(value => value.split(',')).pipe(z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(300)).min(1).max(20)) }).strict(), req.query);
  const products = await Promise.all(slugs.map(async slug => {
    const requestedPath = `/products/${slug}`;
    try {
      const product = await getPublicProduct(slug, { includeRelated: false, includeRoutingVersion: true });
      return { requestedPath, canonicalPath: product.publicPath, seoSignature: product.browseOnly ? null : createHash('sha256').update(JSON.stringify([productSeoSignature(product), env.checkoutEnabled === true, product.routingVersion])).digest('hex') };
    } catch (error) {
      if (error.status !== 404) throw error;
      return { requestedPath, notFound: true };
    }
  }));
  res.set('Cache-Control', 'private, no-store'); res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.json({ ok: true, data: { version: 1, products } });
});

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
  const parameters = product.priceApproved && Number.isSafeInteger(product.pricePiastres) && product.pricePiastres > 0
    ? monetaryParameters([{ ...product, quantity: 1 }], product.pricePiastres)
    : { content_type: 'product', content_ids: [product._id], num_items: 1 };
  // The legacy response is used only to replace history. Count the canonical
  // request, rather than inventing a second view for that same navigation.
  const tracking = product.publicPath && product.publicPath !== `/products/${req.params.slug}` ? null
    : await captureAction(req, 'ViewContent', parameters, { sourcePath: product.publicPath || `/products/${product.slug}` });
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

router.get('/categories/:slug/children/:child', async (req, res) => res.json({ ok: true, data: { category: await getPublicCategory(parseSlug(req.params.slug), parseSlug(req.params.child)) } }));

export default router;
