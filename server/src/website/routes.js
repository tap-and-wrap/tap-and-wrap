import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { requireCatalogDatabase } from '../routes/catalog.routes.js';
import { parseObjectId, parseSlug } from '../catalog/validation.js';
import { env } from '../config/env.js';
import {
  getPublicSiteContent, listPublicReviews, listPublicBundles, getAdminSiteContent, updateSiteContent, listAdminReviews, getAdminReview, saveReview,
  listCustomers, websiteOverview, websiteAnalytics, listNotificationDiagnostics, notificationQuerySchema, validateWebsiteInput, siteContentSchema, createReviewSchema, updateReviewSchema, websiteQuerySchema, customerQuerySchema, publicReviewQuerySchema,
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
  const data = await listPublicBundles();
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  respond(res, data);
}));
adminWebsiteRouter.use((req, res, next) => {
  res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', Vary: 'Cookie' });
  next();
}, requireCatalogDatabase, requireAuth, requireAdmin, csrfProtection);
adminWebsiteRouter.get('/overview', wrap(async (req, res) => respond(res, await websiteOverview())));
adminWebsiteRouter.get('/analytics', wrap(async (req, res) => respond(res, await websiteAnalytics())));
adminWebsiteRouter.get('/customers', wrap(async (req, res) => respond(res, await listCustomers(validateWebsiteInput(customerQuerySchema, req.query)))));
adminWebsiteRouter.get('/notifications', wrap(async (req, res) => respond(res, await listNotificationDiagnostics(validateWebsiteInput(notificationQuerySchema, req.query)))));
adminWebsiteRouter.get('/content', wrap(async (req, res) => respond(res, { content: await getAdminSiteContent() })));
adminWebsiteRouter.patch('/content', wrap(async (req, res) => {
  await updateSiteContent(req.user, validateWebsiteInput(siteContentSchema, req.body));
  respond(res, { content: await getAdminSiteContent() });
}));
adminWebsiteRouter.get('/reviews', wrap(async (req, res) => respond(res, await listAdminReviews(validateWebsiteInput(websiteQuerySchema, req.query)))));
adminWebsiteRouter.get('/reviews/:id', wrap(async (req, res) => respond(res, { review: await getAdminReview(parseObjectId(req.params.id)) })));
adminWebsiteRouter.post('/reviews', wrap(async (req, res) => {
  const review = await saveReview(req.user, null, validateWebsiteInput(createReviewSchema, req.body));
  respond(res, { review: await getAdminReview(review._id) }, 201);
}));
adminWebsiteRouter.patch('/reviews/:id', wrap(async (req, res) => {
  const review = await saveReview(req.user, parseObjectId(req.params.id), validateWebsiteInput(updateReviewSchema, req.body));
  respond(res, { review: await getAdminReview(review._id) });
}));
adminWebsiteRouter.get('/payment-settings', (req, res) => respond(res, {
  checkoutEnabled: env.checkoutEnabled, methods: [{ key: 'cod', name: 'Cash on Delivery', verification: 'Collection must be recorded by an authorized admin.' }, { key: 'instapay', name: 'InstaPay', fullPaymentOnly: true, transferNumber: '01060673073', verification: 'Private proof requires manual admin verification.' }],
  launchManagedByEnvironment: true, editable: false,
}));
