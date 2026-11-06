import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { requireCatalogDatabase } from '../routes/catalog.routes.js';
import { parseObjectId, parseSlug } from '../catalog/validation.js';
import { env } from '../config/env.js';
import { ownerDashboard, ownerAnalytics } from './owner-dashboard.js';
import { z } from 'zod';
import {
  getPublicSiteContent, listPublicReviews, getAdminSiteContent, updateSiteContent, listAdminReviews, getAdminReview,
  listCustomers, websiteOverview, websiteAnalytics, listNotificationDiagnostics, notificationQuerySchema, validateWebsiteInput, websiteQuerySchema, customerQuerySchema, publicReviewQuerySchema,
} from './service.js';

export const publicWebsiteRouter = Router();
export const adminWebsiteRouter = Router();
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const respond = (res, data, status = 200) => res.status(status).json({ ok: true, data });
publicWebsiteRouter.use(requireCatalogDatabase);
publicWebsiteRouter.get('/site-content', wrap(async (req, res) => {
  const data = await getPublicSiteContent();
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
  respond(res, data);
}));
publicWebsiteRouter.get('/products/:slug/reviews', wrap(async (req, res) => {
  const data = await listPublicReviews(parseSlug(req.params.slug), validateWebsiteInput(publicReviewQuerySchema, req.query));
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  respond(res, data);
}));
publicWebsiteRouter.get('/bundles', wrap(async (req, res) => {
  const data = { bundles: [] };
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  respond(res, data);
}));
adminWebsiteRouter.use((req, res, next) => {
  res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', Vary: 'Cookie' });
  next();
}, requireCatalogDatabase, requireAuth, requireAdmin, csrfProtection);
adminWebsiteRouter.get('/overview', wrap(async (req, res) => respond(res, await websiteOverview())));
adminWebsiteRouter.get('/dashboard', wrap(async (req, res) => respond(res, await ownerDashboard())));
adminWebsiteRouter.get('/owner-analytics', wrap(async (req, res) => {
  const query = z.object({ days: z.enum(['7', '30', '90']).default('30') }).strict().parse(req.query);
  respond(res, await ownerAnalytics(Number(query.days)));
}));
adminWebsiteRouter.get('/analytics', wrap(async (req, res) => respond(res, await websiteAnalytics())));
adminWebsiteRouter.get('/customers', wrap(async (req, res) => respond(res, await listCustomers(validateWebsiteInput(customerQuerySchema, req.query)))));
adminWebsiteRouter.get('/notifications', wrap(async (req, res) => respond(res, await listNotificationDiagnostics(validateWebsiteInput(notificationQuerySchema, req.query)))));
adminWebsiteRouter.get('/content', wrap(async (req, res) => respond(res, { content: await getAdminSiteContent() })));
adminWebsiteRouter.all('/content', wrap(async () => { await updateSiteContent(); }));
adminWebsiteRouter.get('/reviews', wrap(async (req, res) => respond(res, await listAdminReviews(validateWebsiteInput(websiteQuerySchema, req.query)))));
adminWebsiteRouter.get('/reviews/:id', wrap(async (req, res) => respond(res, { review: await getAdminReview(parseObjectId(req.params.id)) })));
adminWebsiteRouter.all(['/reviews', '/reviews/:id'], (req, res) => respond(res, { retired: true, message: 'Review management has been retired. Historical records are retained.' }, 410));
adminWebsiteRouter.get('/payment-settings', (req, res) => respond(res, {
  customRequestsEnabled: env.customRequestsEnabled,
  checkoutEnabled: env.checkoutEnabled, methods: [{ key: 'cod', name: 'Cash on Delivery', verification: 'Collection must be recorded by an authorized admin.' }, { key: 'instapay', name: 'InstaPay', fullPaymentOnly: true, transferNumber: '01060673073', verification: 'Private proof requires manual admin verification.' }],
  launchManagedByEnvironment: true, editable: false,
}));
