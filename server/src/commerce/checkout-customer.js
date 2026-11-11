import { z } from 'zod';
import { GOVERNORATES } from './promotions.js';
export const checkoutCustomer = z.object({ name: z.string().trim().min(2).max(100), email: z.union([z.email().max(254), z.literal('')]).optional(), phone: z.string().min(10).max(25),
  governorate: z.enum(GOVERNORATES.map(value => value.id)), address: z.string().trim().min(10).max(500).optional(), addressVersion: z.literal('delivery-address-v2').optional(), city: z.string().trim().min(2).max(100).optional(), street: z.string().trim().min(5).max(300).optional(), building: z.string().trim().max(100).optional(), notes: z.string().trim().max(1000).optional() }).strict().superRefine((value, ctx) => {
  if (value.addressVersion === 'delivery-address-v2') {
    for (const key of ['city', 'street']) if (!value[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'Enter this part of your delivery address.' });
    if (value.address) ctx.addIssue({ code: 'custom', path: ['address'], message: 'Use the structured address fields.' });
  } else if (!value.address || ['city', 'street', 'building'].some(key => value[key] !== undefined)) ctx.addIssue({ code: 'custom', path: ['address'], message: 'Enter a complete delivery address.' });
});
