// Immutable policy for new website orders; absent markers preserve historical terms.
export const ALL_METHODS_POLICY = 'all-methods-v1';
export const allPaymentMethods = order => order?.paymentPolicyVersion === ALL_METHODS_POLICY;
