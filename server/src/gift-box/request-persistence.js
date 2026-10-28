import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { ServiceRequest } from '../models/ServiceRequest.js';
import { GiftBoxComponentSetting } from '../models/GiftBoxComponentSetting.js';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { assertUploadOwner } from '../commerce/uploads.js';
import { fingerprint } from '../commerce/pricing.js';
import { giftBoxV2RequestInput } from './request-contract.js';
import { normalizeGiftBoxV2Request, prepareGiftBoxV2Request } from './request-preparation.js';
import { selectionLines } from './pricing.js';
import { builderError } from './validation.js';

function assertDisposableTestOnly() {
  if (process.env.NODE_ENV !== 'test' || env.nodeEnv !== 'test' || env.databaseTarget !== 'local' || env.mongoUri || process.env.MONGODB_URI || process.env.CATALOG_IMPORT_STAGING_URI) {
    throw builderError(503, 'GIFT_BOX_TEST_PERSISTENCE_ONLY', 'V2 request persistence is available only in a fresh isolated test fixture.');
  }
  const target = assertDatabaseWriteAllowed(ServiceRequest.db, env);
  if (!target.disposableTest || ServiceRequest.db.host !== '127.0.0.1' || ServiceRequest.db.name !== 'tap_wrap_catalog_test') {
    throw builderError(503, 'GIFT_BOX_TEST_PERSISTENCE_ONLY', 'V2 request persistence requires the dedicated disposable loopback test database.');
  }
}
// This helper has no HTTP caller and never opens the runtime submission gate.
// It exercises the prepared persistence contract with real unique indexes and
// transactions, only against the existing disposable test helper's exact target.
export async function persistGiftBoxV2RequestForDisposableTest(owner, raw) {
  assertDisposableTestOnly(); assertUploadOwner(owner);
  const input = giftBoxV2RequestInput.parse(raw);
  const { lines } = selectionLines(input.selection);
  const hello = await ServiceRequest.db.db.admin().command({ hello: 1 });
  if (!hello.setName) throw builderError(503, 'GIFT_BOX_TEST_TRANSACTIONS_REQUIRED', 'A disposable transaction-capable test fixture is required.');
  const expectedHash = fingerprint(normalizeGiftBoxV2Request(input));
  const previous = async () => {
    const record = await ServiceRequest.findOne({ owner, requestKey: input.requestKey }).lean().maxTimeMS(3000);
    if (record && record.requestHash !== expectedHash) throw builderError(409, 'GIFT_BOX_REQUEST_KEY_CONFLICT', 'This request key belongs to a different immutable submission.');
    return record;
  };
  const existing = await previous(); if (existing) return existing;
  const session = await mongoose.startSession(); let result;
  try {
    await session.withTransaction(async () => {
      assertDisposableTestOnly();
      const old = await ServiceRequest.findOne({ owner, requestKey: input.requestKey }).session(session).lean().maxTimeMS(3000);
      if (old) {
        if (old.requestHash !== expectedHash) throw builderError(409, 'GIFT_BOX_REQUEST_KEY_CONFLICT', 'This request key belongs to a different immutable submission.');
        result = old; return;
      }
      const settings = await GiftBoxComponentSetting.find({ componentId: { $in: lines.map(line => line.definition.id) } }).session(session).lean().maxTimeMS(3000);
      const prepared = prepareGiftBoxV2Request(input, settings);
      if (await ServiceRequest.countDocuments({ owner, orderId: null, state: { $nin: ['cancelled', 'declined'] } }).session(session) >= 20) throw builderError(409, 'GIFT_BOX_REQUEST_LIMIT', 'Review existing requests before adding another.');
      const now = new Date();
      const [record] = await ServiceRequest.create([{ owner, requestKey: prepared.requestKey, requestHash: prepared.requestHash,
        reference: `TW-${randomBytes(6).toString('hex').toUpperCase()}`, service: 'gift_box', customer: prepared.customer, details: { quantity: 1 },
        giftBoxV2Snapshot: prepared.snapshot, estimate: { baseUnitPiastres: null, knownSubtotalPiastres: prepared.snapshot.estimate.componentSubtotalPiastres, pendingCount: 1, shippingPiastres: null },
        // V2 selected items are already priced once in the dedicated snapshot.
        // They must never become a second set of legacy quotation charges.
        components: [], uploadIds: [], state: 'submitted', followUpDueAt: new Date(now.getTime() + 12 * 3600000),
        history: [{ event: 'submitted', at: now, actor: 'customer' }] }], { session });
      result = record.toObject();
    }, { readConcern: { level: 'snapshot' } });
  } catch (error) {
    if (error.code === 11000 && expectedHash) { const old = await previous(); if (old) return old; }
    throw error;
  } finally { await session.endSession(); }
  return result;
}
