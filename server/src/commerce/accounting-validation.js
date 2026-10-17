import { z } from 'zod';
const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
export const accountingInput = z.object({
  revision: z.number().int().nonnegative(),
  action: z.enum(['quote_charge', 'accept_charge', 'submit_proof', 'reject_proof', 'collection', 'refund', 'request_cancel', 'cancel', 'inventory_return', 'release_discount']),
  chargeId: z.string().max(80).optional(), kind: z.enum(['shipping', 'addon']).optional(), label: z.string().trim().min(2).max(120).optional(),
  pricing: z.enum(['quoted', 'quote_required', 'free']).optional(), amountPiastres: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  allowedPaymentMethods: z.array(z.enum(['cod', 'instapay'])).min(1).max(2).optional(), codAuthorized: z.boolean().optional(),
  collectionMethod: z.enum(['cod', 'instapay']).optional(), customerConfirmed: z.boolean().optional(), accepted: z.boolean().optional(),
  uploadId: objectId.optional(), operationKey: z.uuid().optional(), scope: z.string().min(1).max(80).optional(),
  allocations: z.array(z.object({ scope: z.string().min(1).max(80), amountPiastres: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict()).min(1).max(31).optional(),
  method: z.enum(['cod', 'instapay']).optional(), reference: z.string().trim().min(3).max(120).regex(/^[A-Za-z0-9/_-]+$/).optional(), refundOf: objectId.optional(),
  reconciled: z.boolean().optional(), exceptionConfirmed: z.boolean().optional(), reducePayable: z.boolean().optional(), reason: z.string().trim().min(2).max(500).optional(),
  publicReason: z.string().trim().max(500).optional(),
  inspected: z.boolean().optional(), quantities: z.array(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)).max(200).optional(),
}).strict().superRefine((input, ctx) => {
  const required = (...keys) => keys.forEach(key => { if (input[key] === undefined) ctx.addIssue({ code: 'custom', path: [key], message: 'Required for this operation.' }); });
  if (input.action === 'quote_charge') { required('pricing', 'collectionMethod'); if (!input.chargeId) required('kind', 'label'); }
  if (input.action === 'accept_charge') required('chargeId', 'accepted');
  if (input.action === 'submit_proof') required('uploadId');
  if (['reject_proof', 'cancel', 'inventory_return', 'release_discount', 'collection', 'refund'].includes(input.action)) required('reason');
  if (['collection', 'refund'].includes(input.action)) {
    required('operationKey', 'method', 'reference', 'reconciled', 'amountPiastres');
    if (input.action === 'collection' || !input.allocations) required('scope');
    if (!input.amountPiastres) ctx.addIssue({ code: 'custom', path: ['amountPiastres'], message: 'Record a positive actual amount.' });
  }
  if (input.action === 'refund') required('refundOf');
  if (input.allocations && input.action !== 'refund') ctx.addIssue({ code: 'custom', path: ['allocations'], message: 'Explicit allocations are only supported for refunds.' });
  if (input.action === 'inventory_return') required('quantities', 'inspected');
});
