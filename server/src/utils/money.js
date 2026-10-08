export function assertPiastres(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Money must be a nonnegative integer number of piastres');
  return value;
}
export function shippingPiastres(governorate) {
  if (typeof governorate !== 'string' || !governorate.trim()) throw new Error('Governorate required');
  return /^(cairo|giza)$/i.test(governorate.trim()) ? 9000 : 12000;
}
export function calculateTotal({ subtotalPiastres, extrasPiastres=0, discountPiastres=0, shippingPiastres=0 }) {
  [subtotalPiastres, extrasPiastres, discountPiastres, shippingPiastres].forEach(assertPiastres);
  const total = subtotalPiastres + extrasPiastres + shippingPiastres - discountPiastres;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid order total');
  return total;
}
