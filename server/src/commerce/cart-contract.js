import { z } from 'zod';
import { giftBoxV2CommerceInput } from '../gift-box/commerce-contract.js';
import { commerceError } from './errors.js';

export const MAX_GIFT_CONFIGURATION_BYTES = 65536;
export const cartQuantity = z.number().int().min(1).max(99);
const id = z.string().regex(/^[a-f0-9]{24}$/i);
const uuid = z.uuid();
const fields = z.record(z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/), z.union([
  z.string().max(10000).refine(value => Array.from(value).length <= 5000, 'Text supports at most 5000 characters.'),
  z.array(id).max(10),
])).refine(value => Object.keys(value).length <= 30);
const customization = z.object({ templateId: id, version: z.number().int().min(1).max(1000000),
  selections: z.array(z.object({ groupKey: z.string().max(64), optionKey: z.string().max(64), quantity: z.number().int().min(1).max(20) }).strict()).max(100).optional(),
  fields: fields.optional(),
}).strict();

export const giftCartConfigurationInput = giftBoxV2CommerceInput.superRefine((value, context) => {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_GIFT_CONFIGURATION_BYTES) {
    context.addIssue({ code: 'custom', message: 'The gift configuration exceeds the supported cart size.' });
  }
});
const productCartItem = z.object({ kind: z.literal('product'), operationKey: uuid.optional(), productId: id,
  variantKey: z.string().max(80).nullable().optional(), quantity: cartQuantity,
  personalization: fields.optional(), customization: customization.nullable().optional(),
}).strict();
const giftCartItem = z.object({ kind: z.literal('gift_box_v2'), operationKey: uuid,
  configuration: giftCartConfigurationInput, quantity: cartQuantity,
}).strict();

// Only an absent discriminator means a historical ordinary Product line.
export function cartLineKind(line) {
  if (line?.kind === undefined || line?.kind === 'product') return 'product';
  if (line?.kind === 'gift_box_v2') return 'gift_box_v2';
  throw commerceError(400, 'CART_LINE_KIND_INVALID', 'The cart line type is not supported.');
}
export const cartItemInput = z.preprocess(value => value && typeof value === 'object' && !Array.isArray(value) && value.kind === undefined
  ? { ...value, kind: 'product' } : value, z.discriminatedUnion('kind', [productCartItem, giftCartItem]));
