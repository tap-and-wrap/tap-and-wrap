export function authenticationError(error) {
  const status = error.response?.status;
  if (status === 401) return 'The email or password is incorrect. Check your details and try again.';
  if (status === 429) return 'Too many attempts. Please wait a few minutes before trying again.';
  if (!error.response) return 'We could not reach the store. Check your connection and try again.';
  // Keep the server's enumeration-safe signup and validation messages.
  return error.response?.data?.error?.message || 'Unable to sign in. Please try again in a moment.';
}

export function accountDestination(administrator, returnTo) {
  const safe = typeof returnTo === 'string' && !returnTo.includes('\\') && !returnTo.startsWith('//');
  if (administrator) return safe && /^\/admin(?:\/|$)/.test(returnTo) ? returnTo : '/admin';
  return safe && /^\/(?:cart|checkout|my-orders|orders)(?:[/?]|$)/.test(returnTo) ? returnTo : '/my-orders';
}
