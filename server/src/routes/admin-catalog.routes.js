import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { requireCatalogDatabase } from './catalog.routes.js';
import {
  listProducts, getAdminProduct, getStagingProductPreview, createProduct, updateProduct,
  listCategories, getAdminCategory, createCategory, updateCategory,
} from '../catalog/service.js';
import {
  parseInput, parseObjectId, adminProductQuerySchema, adminCategoryQuerySchema,
  createProductSchema, updateProductSchema, inventoryUpdateSchema, publicationSchema,
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
  const product = await createProduct(parseInput(createProductSchema, req.body), { actor: req.user });
  res.status(201).json({ ok: true, data: { product } });
});

router.patch('/products/:id', csrfProtection, async (req, res) => {
  const product = await updateProduct(parseObjectId(req.params.id), parseInput(updateProductSchema, req.body), { actor: req.user });
  res.json({ ok: true, data: { product } });
});

router.patch('/products/:id/inventory', csrfProtection, async (req, res) => {
  const { expectedRevision, ...inventory } = parseInput(inventoryUpdateSchema, req.body);
  res.json({ ok: true, data: { product: await updateProduct(parseObjectId(req.params.id), { inventory, expectedRevision }, { actor: req.user }) } });
});

router.patch('/products/:id/publication', csrfProtection, async (req, res) => {
  res.json({ ok: true, data: { product: await updateProduct(parseObjectId(req.params.id), parseInput(publicationSchema, req.body), { actor: req.user }) } });
});

router.get('/categories', async (req, res) => {
  res.json({ ok: true, data: await listCategories(parseInput(adminCategoryQuerySchema, req.query), { admin: true }) });
});

router.get('/categories/:id', async (req, res) => {
  res.json({ ok: true, data: { category: await getAdminCategory(parseObjectId(req.params.id)) } });
});

router.post('/categories', csrfProtection, async (req, res) => {
  res.status(201).json({ ok: true, data: { category: await createCategory(parseInput(createCategorySchema, req.body), { actor: req.user }) } });
});

router.patch('/categories/:id', csrfProtection, async (req, res) => {
  res.json({ ok: true, data: { category: await updateCategory(parseObjectId(req.params.id), parseInput(updateCategorySchema, req.body), { actor: req.user }) } });
});

export default router;
