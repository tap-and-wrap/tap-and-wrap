import { engravingCollectionAllowed, isEngravingOrder } from '../../../shared/engraving/definitions.mjs';
import { commerceError } from '../commerce/errors.js';
export { engravingCollectionAllowed, isEngravingOrder };
export function requireCollectionAuthorization(order) {
  if (!engravingCollectionAllowed(order)) throw commerceError(409, 'ENGRAVING_PAYMENT_NOT_AUTHORIZED', 'Payment is not authorized until physical inspection and final design acceptance.');
}
