import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestDatabase } from './helpers/database.js';

for (const key of ['MONGODB_URI', 'CATALOG_IMPORT_STAGING_URI']) {
  test(`disposable database helper rejects inherited ${key} before starting or connecting`, async () => {
    const original = process.env[key];
    process.env[key] = 'mongodb+srv://synthetic.invalid/tapandwrap_staging';
    try {
      await assert.rejects(startTestDatabase(), /inherited an application or import database URI/);
    } finally {
      if (original === undefined) delete process.env[key]; else process.env[key] = original;
    }
  });
}
