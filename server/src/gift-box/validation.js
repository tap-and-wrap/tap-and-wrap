import { z } from 'zod';
import { FIXED_COMPONENTS, GIFT_CARD_POLICY } from '../../../shared/gift-box/definitions.mjs';
import { commerceError } from '../commerce/errors.js';

export const builderError = (status, code, message) => commerceError(status, code, message);
export const componentId = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const category = z.enum(['box', 'flower', 'plush', 'chocolate', 'ribbon', 'gift_card']);
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1);
const price = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable();
export const settingPatch = z.object({
  expectedRevision: revision,
  displayName: z.string().trim().min(1).max(120).refine(value => !/[\u0000-\u001f\u007f]/u.test(value)).optional(),
  displayOrder: z.number().int().min(0).max(1000000).optional(),
  pricePiastres: price.optional(), enabled: z.boolean().optional(),
  available: z.boolean().optional(),
  inventoryMode: z.enum(['tracked', 'made_to_order']).optional(),
  inventoryQuantity: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  confirmInventoryQuantity: z.literal(true).optional(),
  // Approval intent for a zero price, not another editable catalog property.
  confirmComplimentary: z.literal(true).optional(),
}).strict().superRefine((input, context) => {
  if (!['displayName', 'displayOrder', 'pricePiastres', 'enabled', 'available', 'inventoryMode', 'inventoryQuantity'].some(key => Object.hasOwn(input, key))) context.addIssue({ code: 'custom', message: 'Supply an editable setting.' });
  if (input.confirmInventoryQuantity && (!Object.hasOwn(input, 'inventoryQuantity') || input.inventoryMode !== 'tracked')) context.addIssue({ code: 'custom', path: ['inventoryQuantity'], message: 'Confirm an explicit tracked inventory quantity.' });
  if (input.pricePiastres === 0 && input.confirmComplimentary !== true) context.addIssue({ code: 'custom', path: ['pricePiastres'], message: 'Explicitly confirm a complimentary zero price.' });
  if (input.confirmComplimentary === true && input.pricePiastres !== 0) context.addIssue({ code: 'custom', path: ['confirmComplimentary'], message: 'Complimentary confirmation applies only to an explicit zero price.' });
});
export const catalogQuery = z.object({
  category: category.optional(), page: z.coerce.number().int().min(1).max(200).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();
export const reorderInput = z.object({ category,
  items: z.array(z.object({ componentId, expectedRevision: revision }).strict()).min(1).max(100),
}).strict().superRefine((input, context) => {
  const expected = FIXED_COMPONENTS.filter(item => item.category === input.category).map(item => item.id);
  const actual = input.items.map(item => item.componentId);
  if (!expected.length || expected.length !== actual.length || new Set(actual).size !== actual.length || actual.some(id => !expected.includes(id))) {
    context.addIssue({ code: 'custom', path: ['items'], message: 'Reorder every existing component in one nonempty category exactly once.' });
  }
});
export const giftCardMessage = z.string().max(GIFT_CARD_POLICY.maxMessageCodePoints * 2)
  .refine(value => value.isWellFormed() && Array.from(value).length <= GIFT_CARD_POLICY.maxMessageCodePoints, 'Use at most 500 Unicode code points.')
  .refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value), 'Unsupported control characters.');
// These are computation/abuse bounds, not approval of physical capacity or fit.
export const MAX_ITEM_QUANTITY = 100;
export const MAX_ADDITIONAL_ITEMS = 200;
export const estimateInput = z.object({
  boxId: componentId,
  items: z.array(z.object({ componentId, quantity: z.number().int().min(1).max(MAX_ITEM_QUANTITY) }).strict()).max(100).default([]),
  ribbonId: componentId.nullable().optional(),
  giftCard: z.object({ componentId, message: giftCardMessage.default('') }).strict().nullable().optional(),
}).strict().superRefine((input, context) => {
  if (new Set(input.items.map(item => item.componentId)).size !== input.items.length) context.addIssue({ code: 'custom', path: ['items'], message: 'Combine quantities for each component in one line.' });
  if (input.items.reduce((sum, item) => sum + item.quantity, 0) > MAX_ADDITIONAL_ITEMS) context.addIssue({ code: 'custom', path: ['items'], message: 'The selection exceeds the computational item limit.' });
});
