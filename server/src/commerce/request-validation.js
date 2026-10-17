import { z } from 'zod';
const id = z.string().regex(/^[a-f0-9]{24}$/i);
const text = max => z.string().trim().max(max);
const amount = z.number().int().nonnegative().max(100000000);
const options = z.array(text(120).min(1)).max(30).refine(values => new Set(values).size === values.length, 'Use distinct options.');
export const engravingRequestPolicy = z.object({ enabled: z.boolean(), fonts: options, placements: options, materials: options, maxTextLength: z.number().int().min(1).max(1000) }).strict();
export const componentRequestPolicy = z.object({ enabled: z.boolean(), services: z.array(z.enum(['gift_box', 'laser_engraving'])).max(2), availability: z.enum(['unconfirmed', 'available', 'unavailable']), pricing: z.enum(['pending', 'fixed', 'free']), unitPricePiastres: amount.nullable() }).strict();
export const serviceRequestInput = z.object({
  template: z.object({ id, version: z.number().int().min(1).max(1000000), fields: z.record(z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), z.union([text(2000), z.array(id).max(5)])).refine(value => Object.keys(value).length <= 20) }).strict().optional(),
  requestKey: z.uuid(), service: z.enum(['gift_box', 'laser_engraving']),
  customer: z.object({ name: text(100).min(2), phone: text(25).min(10), email: z.union([z.email().max(254), z.literal('')]).optional() }).strict(),
  details: z.object({ occasion: text(160).optional(), style: text(300).optional(), colors: text(160).optional(), contents: text(1500).optional(), budgetPiastres: amount.nullable().optional(), recipient: text(100).optional(), message: text(500).optional(), instructions: text(2000).optional(),
    productId: id.optional(), variantKey: text(80).optional(), productReference: text(500).optional(), engravingType: z.enum(['text', 'design', 'other']).optional(), engravingText: text(1000).optional(), font: text(120).optional(), placement: text(120).optional(), material: text(120).optional(), quantity: z.number().int().min(1).max(20).default(1) }).strict(),
  components: z.array(z.object({ componentId: id, quantity: z.number().int().min(1).max(20) }).strict()).max(20).default([]),
  uploadIds: z.array(id).max(5).default([]),
}).strict();
const charge = z.object({ componentId: id.optional(), label: text(120).min(1), quantity: z.number().int().min(1).max(20), pricing: z.enum(['fixed', 'free']), unitPricePiastres: amount }).strict().refine(value => value.pricing === 'free' ? value.unitPricePiastres === 0 : value.unitPricePiastres > 0, 'Use a positive confirmed price or explicit Free.');
export const requestActionInput = z.object({
  revision: z.number().int().nonnegative(), action: z.enum(['review', 'prepare', 'share', 'accept', 'convert', 'decline', 'cancel']),
  reason: text(500).min(2), customerConfirmed: z.boolean().optional(), method: z.enum(['cod', 'instapay']).optional(), acceptedAt: z.iso.datetime().optional(),
  delivery: z.object({ governorate: text(50).min(1), address: text(500).min(10) }).strict().optional(),
  quote: z.object({ baseUnitPiastres: amount, discountPiastres: amount, charges: z.array(charge).max(25), shippingPiastres: amount, shippingFree: z.boolean(), allowedPaymentMethods: z.array(z.enum(['cod', 'instapay'])).min(1).max(2).refine(value => new Set(value).size === value.length), codAuthorized: z.boolean() }).strict().optional(),
}).strict();
