import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { csrfProtection } from '../middleware/csrf.js';
import { componentId } from './validation.js';
import { listGiftBoxPersonalizationOptions, updateGiftBoxPersonalizationOption, quoteGiftBoxPersonalizationPreview } from './personalization-options.js';
import { commerceOwner } from '../commerce/ownership.js';
import { estimateBuilderSelection, getBuilderSetting, listBuilderComponents, reorderBuilderCategory, updateBuilderSetting } from './catalog.js';
import { assertGiftBoxV2SubmissionClosed } from './request-gates.js';
import { listPhysicalPolicies, getPhysicalPolicy, savePhysicalPolicyDraft, approvePhysicalPolicy, withdrawPhysicalPolicy } from './policy-administration.js';

export const publicGiftBoxRoutes = Router(), adminGiftBoxRoutes = Router();
const privateHeaders = (req, res, next) => {
  res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
  res.vary('Cookie'); next();
};
const reply = (res, data) => res.json({ ok: true, data });
publicGiftBoxRoutes.use(privateHeaders, rateLimit({ windowMs: 60000, limit: 90, standardHeaders: 'draft-8', legacyHeaders: false }), csrfProtection);
publicGiftBoxRoutes.get('/catalog', async (req, res) => reply(res, await listBuilderComponents(req.query)));
publicGiftBoxRoutes.post('/estimate', async (req, res) => reply(res, { estimate: await estimateBuilderSelection(req.body) }));
publicGiftBoxRoutes.get('/personalization-options', async (req, res) => {
  z.object({}).strict().parse(req.query);
  return reply(res, await listGiftBoxPersonalizationOptions());
});
publicGiftBoxRoutes.post('/personalization-quote', commerceOwner, async (req, res) => reply(res, await quoteGiftBoxPersonalizationPreview(req.commerceOwner, req.body)));
publicGiftBoxRoutes.post('/requests', () => assertGiftBoxV2SubmissionClosed());
adminGiftBoxRoutes.use(privateHeaders, requireAuth, requireAdmin, csrfProtection);
adminGiftBoxRoutes.get('/fulfillment-policies', async (req, res) => {
  // No list filters are accepted; this is the fixed set of twelve boxes.
  z.object({}).strict().parse(req.query);
  return reply(res, await listPhysicalPolicies());
});
adminGiftBoxRoutes.get('/fulfillment-policies/:boxId', async (req, res) => reply(res, { policy: await getPhysicalPolicy(componentId.parse(req.params.boxId), req.query) }));
adminGiftBoxRoutes.put('/fulfillment-policies/:boxId/draft', async (req, res) => reply(res, { policy: await savePhysicalPolicyDraft(componentId.parse(req.params.boxId), req.body, req.user) }));
adminGiftBoxRoutes.post('/fulfillment-policies/:boxId/approve', async (req, res) => reply(res, { policy: await approvePhysicalPolicy(componentId.parse(req.params.boxId), req.body, req.user) }));
adminGiftBoxRoutes.post('/fulfillment-policies/:boxId/withdraw', async (req, res) => reply(res, { policy: await withdrawPhysicalPolicy(componentId.parse(req.params.boxId), req.body, req.user) }));
adminGiftBoxRoutes.get('/personalization-options', async (req, res) => {
  z.object({}).strict().parse(req.query);
  return reply(res, await listGiftBoxPersonalizationOptions({ admin: true }));
});
adminGiftBoxRoutes.patch('/personalization-options/:optionId', async (req, res) => reply(res, { option: await updateGiftBoxPersonalizationOption(req.params.optionId, req.body, req.user) }));
adminGiftBoxRoutes.get('/components', async (req, res) => reply(res, await listBuilderComponents(req.query, { admin: true })));
adminGiftBoxRoutes.patch('/components/reorder', async (req, res) => reply(res, await reorderBuilderCategory(req.body, req.user)));
adminGiftBoxRoutes.get('/components/:componentId', async (req, res) => reply(res, { component: await getBuilderSetting(componentId.parse(req.params.componentId)) }));
adminGiftBoxRoutes.patch('/components/:componentId', async (req, res) => reply(res, { component: await updateBuilderSetting(componentId.parse(req.params.componentId), req.body, req.user) }));
