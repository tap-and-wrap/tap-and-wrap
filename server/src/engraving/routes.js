import { isEngravingKind } from '../../../shared/engraving/definitions.mjs';
import { Router } from 'express';
import { z } from 'zod';
import { EngravingServiceConfiguration as Config } from '../models/EngravingServiceConfiguration.js';
import { Order } from '../models/Order.js';
import { env } from '../config/env.js';
import { configurationDTO, publishConfiguration, engravingOpen } from './configuration.js';
import { quoteInput, configurationInput } from './contracts.js';
import { engravingQuote } from './pricing.js';
import { engravingAction } from './workflow.js';
import { presentOrder } from '../commerce/order-presentation.js';
import { readCart } from '../commerce/cart.js';
import { fingerprint } from '../commerce/pricing.js';
import { commerceError } from '../commerce/errors.js';
import { FONT_REGISTRY, ICON_REGISTRY, INITIAL_ENGRAVING_TYPES, engravingFileEntries } from '../../../shared/engraving/definitions.mjs';
export const engravingRoutes = Router(), adminEngravingRoutes = Router();
const reply = (res, data) => res.json({ ok: true, data });
const id = z.string().regex(/^[a-f0-9]{24}$/i);
const paging = z.object({ page: z.coerce.number().int().min(1).max(200).default(1) }).strict();
engravingRoutes.get('/engraving/types', async (req, res) => {
  if (!engravingOpen()) return reply(res, { enabled: false, types: [], fonts: [], icons: [], hasNext: false });
  const { page } = paging.parse(req.query);
  const records = await Config.find({ current: true, 'configuration.status': 'active', 'configuration.assetsApproved': true }).sort({ 'configuration.displayOrder': 1, typeId: 1 }).skip((page - 1) * 20).limit(21).lean().maxTimeMS(3000);
  reply(res, { enabled: true, specificationVersions: ['engraving-spec-v1', 'engraving-spec-v2'], types: records.slice(0,20).map(configurationDTO), fonts: FONT_REGISTRY, icons: ICON_REGISTRY, hasNext: records.length > 20 });
});
engravingRoutes.post('/engraving/quote', async (req, res) => {
  const input = quoteInput.parse(req.body), quote = await engravingQuote(input.specification, req.commerceOwner, { files: false });
  reply(res, { unitPricePiastres: quote.unitPricePiastres, reviewFingerprint: quote.reviewFingerprint });
});
engravingRoutes.get('/cart/operations/:key', async (req, res) => {
  const cart = await readCart(req.commerceOwner), key = z.uuid().parse(req.params.key);
  const accepted = await Order.findOne({ owner: req.commerceOwner, 'cartAddOperations.key': key }).select('_id').lean().maxTimeMS(3000);
  reply(res, { applied: Boolean(accepted || cart?.addOperations?.some(operation => operation.key === key)), ...(accepted ? { alreadyOrdered: String(accepted._id) } : {}) });
});
engravingRoutes.get('/engraving/cart/:lineId', async (req, res) => {
  const cart = await readCart(req.commerceOwner), line = cart?.items.find(value => value.id === z.uuid().parse(req.params.lineId) && isEngravingKind(value.kind));
  if (!line) throw commerceError(404, 'CART_ITEM_NOT_FOUND', 'Engraving item not found.');
  reply(res, { specification: line.specification, editFingerprint: fingerprint({ specification: line.specification, reviewFingerprint: line.reviewFingerprint }) });
});
engravingRoutes.post('/orders/:id/engraving/accept', async (req, res) => reply(res, { order: presentOrder(await engravingAction(id.parse(req.params.id), req.body, null, req.commerceOwner)) }));
adminEngravingRoutes.get('/engraving/types', async (req, res) => {
  if (!env.engravingConfigurationEnabled) return reply(res, { available: false, types: [], defaults: INITIAL_ENGRAVING_TYPES, fonts: FONT_REGISTRY, icons: ICON_REGISTRY });
  const { page } = paging.parse(req.query);
  const records = await Config.find({ current: true }).sort({ 'configuration.displayOrder': 1, typeId: 1 }).skip((page - 1) * 20).limit(21).lean().maxTimeMS(3000);
  reply(res, { available: true, types: records.slice(0,20).map(configurationDTO), hasNext: records.length > 20, defaults: INITIAL_ENGRAVING_TYPES, fonts: FONT_REGISTRY, icons: ICON_REGISTRY });
});
adminEngravingRoutes.post('/engraving/types', async (req, res) => {
  if (!env.engravingConfigurationEnabled) throw commerceError(409, 'ENGRAVING_CONFIGURATION_DISABLED', 'Engraving configuration requires separately prepared schema and its configuration flag.');
  const input = z.object({ expectedRevision: z.number().int().nonnegative(), configuration: configurationInput }).strict().parse(req.body);
  reply(res, { configuration: await publishConfiguration(input.configuration, input.expectedRevision, req.user) });
});
adminEngravingRoutes.post('/orders/:id/engraving-actions', async (req, res) => reply(res, { order: presentOrder(await engravingAction(id.parse(req.params.id), req.body, req.user), { admin: true }) }));
// Owner-bound original file role lookup. Access to bytes still uses existing
// authenticated streams; the metadata endpoint never produces a public URL.
engravingRoutes.get('/orders/:id/engraving-files', async (req, res) => {
  const order = await Order.findOne({ _id: id.parse(req.params.id), owner: req.commerceOwner }).select('lines').lean().maxTimeMS(3000);
  if (!order) throw commerceError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  reply(res, engravingFiles(order));
});
function engravingFiles(order) {
  return { items: order.lines.filter(line => isEngravingKind(line.kind)).map(line => {
    const spec = line.engraving.specification;
    return { itemKey: spec.itemKey, ...(spec.contractVersion === 'engraving-spec-v2' ? { design: spec.design, files: engravingFileEntries(spec).map(([key, id, role]) => ({ key, id, role })) } : { itemPhotoUploadId: spec.itemPhotoUploadId, surfacePhotoUploadId: spec.surfacePhotoUploadId, artworkUploadId: spec.content.artworkUploadId }) };
  }) };
}
adminEngravingRoutes.get('/orders/:id/engraving-files', async (req, res) => {
  const order = await Order.findById(id.parse(req.params.id)).select('lines').lean().maxTimeMS(3000);
  if (!order) throw commerceError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  reply(res, engravingFiles(order));
});
