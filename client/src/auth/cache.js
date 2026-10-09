import { hashKey } from '@tanstack/react-query';

export const LEGACY_PRIVATE_ROOTS = ['admin', 'account', 'commerce', 'auth'];

/** Captured owner closures keep exact matching and setQueryData consistent. */
export function scopeLegacyPrivateQueries(client, owner) {
  for (const root of LEGACY_PRIVATE_ROOTS) {
    const defaults = client.getQueryDefaults([root]);
    client.setQueryDefaults([root], { ...defaults, queryKeyHashFn: key => hashKey(['private', owner, ...key]) });
  }
}
