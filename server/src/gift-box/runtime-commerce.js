// Public gift commerce has an independent operational switch. Missing prices,
// stored physical policies, inventory, or ordinary checkout activation still fail
// in their existing authoritative validators. The switch never creates data.
export function giftBoxRuntimeCommerceOpen(settings) {
  return settings?.giftBoxDirectCommerceEnabled === true
    && settings?.giftBoxBuilderBackendEnabled === true
    && settings?.checkoutEnabled === true;
}
