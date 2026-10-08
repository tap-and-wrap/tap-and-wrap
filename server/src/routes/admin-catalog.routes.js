import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { requireCatalogDatabase } from './catalog.routes.js';
import {
  listProducts, getAdminProduct, getStagingProductPreview, createProduct, updateProduct,
  listCategories, createCategory, updateCategory,
} from '../catalog/service.js';
import {
  parseInput, parseObjectId, adminProductQuerySchema, categoryQuerySchema,
  createProductSchema, updateProductSchema, inventorySchema, publicationSchema,
  createCategorySchema, updateCategorySchema,
} from '../catalog/validation.js';
import { requireStagingPreview } from '../catalog/staging-preview.js';

const router = Router();
router.use(requireCatalogDatabase, requireAuth, requireAdmin);

router.get('/products', async (req, res) => {
  res.json({ ok: true, data: await listProducts(parseInput(adminProductQuerySchema, req.query), { admin: true }) });
});

router.get('/products/:id', async (req, res) => {
  res.json({ ok: true, data: { product: await getAdminProduct(parseObjectId(req.params.id)) } });
});

router.get('/products/:id/preview', requireStagingPreview, async (req, res) => {
  res.json({ ok: true, data: { product: await getStagingProductPreview(parseObjectId(req.params.id)) } });
});

router.post('/products', csrfProtection, async (req, res) => {
  const product = await createProduct(parseInput(createProductSchema, req.body));
  res.status(201).json({ ok: true, data: { product } });
});

router.patch('/products/:id', csrfProtection, async (req, res) => {
  const product = await updateProduct(parseObjectId(req.params.id), parseInput(updateProductSchema, req.body));
  res.json({ ok: true, data: { product } });
});

router.patch('/products/:id/inventory', csrfProtection, async (req, res) => {
  const inventory = parseInput(inventorySchema.refine((body) => Object.keys(body).length > 0, 'Provide at least one inventory field'), req.body);
  res.json({ ok: true, data: { product: await updateProduct(parseObjectId(req.params.id), { inventory }) } });
});

router.patch('/products/:id/publication', csrfProtection, async (req, res) => {
  res.json({ ok: true, data: { product: await updateProduct(parseObjectId(req.params.id), parseInput(publicationSchema, req.body)) } });
});

router.get('/categories', async (req, res) => {
  res.json({ ok: true, data: await listCategories(parseInput(categoryQuerySchema, req.query), { admin: true }) });
});

router.post('/categories', csrfProtection, async (req, res) => {
  res.status(201).json({ ok: true, data: { category: await createCategory(parseInput(createCategorySchema, req.body)) } });
});

router.patch('/categories/:id', csrfProtection, async (req, res) => {
  res.json({ ok: true, data: { category: await updateCategory(parseObjectId(req.params.id), parseInput(updateCategorySchema, req.body)) } });
});

export default router;
