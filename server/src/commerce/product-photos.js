import { z } from 'zod';
import { CUSTOMER_PHOTOS_KEY, legacyPhotoFields, optionalPhotoFields } from '../../../shared/product-personalization.mjs';
import { commerceError } from './errors.js';
import { fingerprint } from './pricing.js';
export const photoSelectionInput = z.object({ contractVersion: z.enum(['product-photos-v1','product-photos-v2']), mode: z.enum(['as_is','photos']), configurationVersion: z.number().int().positive() }).strict();
export const photoEditFingerprint = line => fingerprint({ productId: String(line.productId), variantKey: line.variantKey ?? null, quantity: line.quantity, personalization: line.personalization || {}, photoSelection: line.photoSelection });
export function photoPurchase(product, line) {
  const configuration = product.personalization, selected = line.photoSelection ? photoSelectionInput.parse(line.photoSelection) : null;
  // Legacy records retain their original roles and exact v1 validation. No conversion.
  if (selected?.contractVersion === 'product-photos-v1') {
    const fields = legacyPhotoFields(configuration);
    if (selected.mode === 'photos' && (configuration?.acceptCustomerPhotos === false || !fields.length || selected.configurationVersion !== configuration?.photoSpacesVersion)) throw commerceError(409, 'PHOTO_SPACES_CHANGED', 'The earlier photo setup changed. Review this item or order it as is.');
    const selection = selected.mode === 'as_is' ? { ...selected, configurationVersion: configuration?.photoSpacesVersion || selected.configurationVersion } : selected;
    return { selection, fields: selection.mode === 'photos' ? fields : [], snapshot: { ...selection, slots: selection.mode === 'photos' ? fields.map(({ key, label, instructions }) => ({ key, label, instructions })) : [] } };
  }
  const fields = optionalPhotoFields(configuration);
  if (selected?.mode === 'photos' && (configuration?.acceptCustomerPhotos === false || !fields.length || selected.configurationVersion !== configuration?.customerPhotosVersion)) throw commerceError(409, 'CUSTOMER_PHOTOS_CHANGED', 'This product photo setting changed. Review the item or order it as is.');
  const selection = selected ? { ...selected, configurationVersion: configuration?.customerPhotosVersion || selected.configurationVersion } : fields.length ? { contractVersion: 'product-photos-v2', mode: 'as_is', configurationVersion: configuration.customerPhotosVersion } : legacyPhotoFields(configuration).length ? { contractVersion: 'product-photos-v1', mode: 'as_is', configurationVersion: configuration.photoSpacesVersion } : null;
  return { selection, fields: selection?.mode === 'photos' ? fields : [], snapshot: selection ? selection.contractVersion === 'product-photos-v1' ? { ...selection, slots: [] } : { ...selection, collectionKey: CUSTOMER_PHOTOS_KEY } : null };
}
