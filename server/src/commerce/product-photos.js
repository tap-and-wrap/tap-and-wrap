import { z } from 'zod';
import { optionalPhotoFields } from '../../../shared/product-personalization.mjs';
import { commerceError } from './errors.js';
import { fingerprint } from './pricing.js';
export const photoSelectionInput = z.object({ contractVersion: z.literal('product-photos-v1'), mode: z.enum(['as_is','photos']), configurationVersion: z.number().int().positive() }).strict();
export const photoEditFingerprint = line => fingerprint({ productId: String(line.productId), variantKey: line.variantKey ?? null, quantity: line.quantity, personalization: line.personalization || {}, photoSelection: line.photoSelection });
export function photoPurchase(product, line) {
  const slots = optionalPhotoFields(product.personalization), selected = line.photoSelection ? photoSelectionInput.parse(line.photoSelection) : null;
  if (selected?.mode === 'photos' && (!slots.length || selected.configurationVersion !== product.personalization?.photoSpacesVersion)) throw commerceError(409, 'PHOTO_SPACES_CHANGED', 'The personal photo spaces changed. Edit this item or order it as is.');
  const selection = (selected?.mode === 'as_is' ? { ...selected, configurationVersion: product.personalization?.photoSpacesVersion || selected.configurationVersion } : selected) || (slots.length ? { contractVersion: 'product-photos-v1', mode: 'as_is', configurationVersion: product.personalization.photoSpacesVersion } : null);
  return { selection, fields: selection?.mode === 'photos' ? slots : [], snapshot: selection ? { ...selection, slots: selection.mode === 'photos' ? slots.map(({ key, label, instructions }) => ({ key, label, instructions })) : [] } : null };
}
