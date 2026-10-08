import test from 'node:test';
import assert from 'node:assert/strict';
import { configurationPagination } from '../src/commerce/configuration.routes.js';

test('configuration and customization service pagination caps responses at twenty records', () => {
  assert.deepEqual(configurationPagination(), { page: 1, limit: 20, skip: 0 });
  assert.deepEqual(configurationPagination({ page: '3', limit: '20' }), { page: 3, limit: 20, skip: 40 });
  assert.deepEqual(configurationPagination({ page: '200' }), { page: 200, limit: 20, skip: 3980 });
  for (const query of [{ limit: '21' }, { limit: '0' }, { limit: '-1' }, { limit: '1.5' }, { page: '0' }, { page: '-1' }, { page: '201' }, { page: 'not-a-page' }, { search: 'a'.repeat(101) }]) assert.throws(() => configurationPagination(query));
});
