import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { Upload } from '../models/Upload.js';
import { UploadQuota } from '../models/UploadQuota.js';
import { AdminAudit } from '../models/AdminAudit.js';
import { CheckoutIntent } from '../models/CheckoutIntent.js';
import { loadEligibleProduct } from './pricing.js';
import { resolveArtworkUploadField } from './customization.js';
import {
  getStorage, inspectStoredImage, privateObjectKey, UPLOAD_MIME_TYPES,
  MAX_UPLOAD_BYTES, UPLOAD_URL_SECONDS, storageError,
} from './storage.js';

const MAX_ACTIVE_UPLOADS = 20;
const MAX_OWNER_BYTES = 100 * 1024 * 1024;
const TEMPORARY_LIFETIME_MS = 24 * 60 * 60 * 1000;
let artworkPolicyResolver = resolveArtworkUploadField;

function fail(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function writeGuard() { assertDatabaseWriteAllowed(Upload.db, env); }

export function assertUploadOwner(owner) {
  if (typeof owner !== 'string' || !/^(?:user:[a-f0-9]{24}|guest:[a-f0-9]{64})$/i.test(owner)) {
    throw fail('UPLOAD_OWNER_REQUIRED', 'A valid shopping session is required.', 401);
  }
  return owner;
}

function idsForQuery(ids) {
  if (!Array.isArray(ids) || ids.length > 30 || ids.some((id) => !mongoose.isObjectIdOrHexString(id))
      || new Set(ids.map(String)).size !== ids.length) throw fail('INVALID_UPLOAD_REFERENCES', 'Select valid, distinct uploaded images.');
  return ids.map((id) => new mongoose.Types.ObjectId(String(id)));
}

// Set only by server composition, never by a request. The resolver checks approved template eligibility.
export function configureArtworkPolicyResolver(resolver) {
  if (typeof resolver !== 'function') throw fail('INVALID_UPLOAD_POLICY', 'An artwork upload policy is required.');
  artworkPolicyResolver = resolver;
}

export function serializeUpload(upload) {
  return {
    id: String(upload._id), purpose: upload.purpose, state: upload.state,
    mimeType: upload.mimeType, sizeBytes: upload.sizeBytes,
    width: upload.width || null, height: upload.height || null,
    productId: upload.productId ? String(upload.productId) : null,
    fieldKey: upload.fieldKey || null, expiresAt: upload.state === 'retained' ? null : upload.expiresAt,
  };
}

async function policyForUpload(owner, body) {
  if (!body || !['personalization', 'artwork', 'payment_proof'].includes(body.purpose)) {
    throw fail('INVALID_UPLOAD_PURPOSE', 'Choose a supported upload purpose.');
  }
  if (body.purpose === 'payment_proof') {
    if (!env.checkoutEnabled) throw fail('CHECKOUT_DISABLED', 'Checkout is not available yet.', 503);
    if (typeof body.checkoutKey !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.checkoutKey)) {
      throw fail('CHECKOUT_REVIEW_REQUIRED', 'Review your checkout total before uploading payment proof.');
    }
    const intent = await CheckoutIntent.findOne({
      owner, checkoutKey: body.checkoutKey, state: 'open', paymentMethod: 'instapay', expiresAt: { $gt: new Date() },
    }).select('_id').lean();
    if (!intent) throw fail('CHECKOUT_REVIEW_REQUIRED', 'Review your checkout total before uploading payment proof.');
    return { acceptedMimeTypes: UPLOAD_MIME_TYPES, maxBytes: 5 * 1024 * 1024, fieldKey: 'payment_proof' };
  }
  if (!mongoose.isObjectIdOrHexString(body.productId) || typeof body.fieldKey !== 'string'
      || !/^[a-zA-Z0-9_-]{1,80}$/.test(body.fieldKey)) throw fail('INVALID_UPLOAD_FIELD', 'Choose a configured product image field.');
  const product = await loadEligibleProduct(body.productId);
  let field;
  if (body.purpose === 'personalization' && product.personalization?.enabled !== false) {
    field = product.personalization?.fields?.find((candidate) => candidate.key === body.fieldKey && candidate.type === 'image');
  } else if (artworkPolicyResolver) {
    field = await artworkPolicyResolver(product, body.fieldKey, body);
  }
  if (!field || field.type !== 'image') throw fail('INVALID_UPLOAD_FIELD', 'This product does not support the selected image field.');
  return {
    acceptedMimeTypes: (field.acceptedMimeTypes || UPLOAD_MIME_TYPES).filter((mime) => UPLOAD_MIME_TYPES.includes(mime)),
    maxBytes: Math.min(Number(field.maxBytes) || 8 * 1024 * 1024, MAX_UPLOAD_BYTES),
    fieldKey: field.key,
  };
}

async function reserveQuota(owner, sizeBytes, { session } = {}) {
  writeGuard();
  try {
    await UploadQuota.updateOne({ owner }, { $setOnInsert: { owner, activeCount: 0, activeBytes: 0 } }, { upsert: true, session });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  writeGuard();
  const quota = await UploadQuota.findOneAndUpdate({
    owner, activeCount: { $lt: MAX_ACTIVE_UPLOADS }, activeBytes: { $lte: MAX_OWNER_BYTES - sizeBytes },
  }, { $inc: { activeCount: 1, activeBytes: sizeBytes } }, { new: true, session });
  if (!quota) throw fail('UPLOAD_QUOTA_EXCEEDED', 'Remove unused uploads before adding more images.', 429);
}

async function releaseQuota(upload, { session } = {}) {
  if (upload.quotaReleased) return;
  if (!session) {
    await Upload.db.transaction(async (transactionSession) => releaseQuota(upload, { session: transactionSession }));
    return;
  }
  writeGuard();
  const changed = await Upload.updateOne({ _id: upload._id, quotaReleased: false }, { $set: { quotaReleased: true } }, { session });
  if (changed.modifiedCount) {
    writeGuard();
    await UploadQuota.updateOne({ owner: upload.owner, activeCount: { $gte: 1 }, activeBytes: { $gte: upload.sizeBytes } }, {
      $inc: { activeCount: -1, activeBytes: -upload.sizeBytes },
    }, { session });
  }
}

export async function signUpload(owner, body) {
  assertUploadOwner(owner);
  const policy = await policyForUpload(owner, body);
  if (!policy.acceptedMimeTypes.includes(body.mimeType) || !Number.isSafeInteger(body.sizeBytes)
      || body.sizeBytes < 1 || body.sizeBytes > policy.maxBytes) throw fail('INVALID_UPLOAD_FILE', 'The selected image format or size is not allowed.');
  const storage = getStorage(); // A disabled provider fails before creating records or consuming quota.
  writeGuard();
  let upload;
  try {
    const now = Date.now();
    await Upload.db.transaction(async (session) => {
      await reserveQuota(owner, body.sizeBytes, { session });
      writeGuard();
      [upload] = await Upload.create([{
        owner, purpose: body.purpose, productId: body.purpose === 'payment_proof' ? undefined : body.productId,
        fieldKey: policy.fieldKey, checkoutKey: body.purpose === 'payment_proof' ? body.checkoutKey : undefined,
        mimeType: body.mimeType, sizeBytes: body.sizeBytes, temporaryKey: privateObjectKey(),
        signedExpiresAt: new Date(now + UPLOAD_URL_SECONDS * 1000), expiresAt: new Date(now + TEMPORARY_LIFETIME_MS),
      }], { session });
    });
    const signed = await storage.signPut(upload.temporaryKey, upload);
    return { upload: serializeUpload(upload), uploadUrl: signed.url, headers: signed.headers, expiresInSeconds: signed.expiresInSeconds };
  } catch (error) {
    if (upload) {
      await Upload.db.transaction(async (session) => {
        await releaseQuota(upload, { session });
        writeGuard();
        await Upload.deleteOne({ _id: upload._id }, { session });
      });
    }
    if (error.status) throw error;
    throw storageError();
  }
}

export async function completeUpload(id, owner) {
  assertUploadOwner(owner);
  if (!mongoose.isObjectIdOrHexString(id)) throw fail('UPLOAD_NOT_FOUND', 'Upload not found.', 404);
  const storage = getStorage();
  const existing = await Upload.findOne({ _id: id, owner }).select('+temporaryKey +objectKey');
  if (!existing) throw fail('UPLOAD_NOT_FOUND', 'Upload not found.', 404);
  if (existing.state === 'complete' && existing.expiresAt > new Date()) return serializeUpload(existing);
  if (existing.state !== 'pending' || existing.expiresAt <= new Date()) throw fail('UPLOAD_NOT_READY', 'The upload has expired or is already being processed.', 409);
  writeGuard();
  const upload = await Upload.findOneAndUpdate({ _id: id, owner, state: 'pending', expiresAt: { $gt: new Date() } }, {
    $set: { state: 'verifying', objectKey: privateObjectKey('verified'), verificationLeaseUntil: new Date(Date.now() + 300000) },
  }, { new: true }).select('+temporaryKey +objectKey');
  if (!upload) throw fail('UPLOAD_NOT_READY', 'The upload is already being processed.', 409);
  try {
    const verified = await inspectStoredImage(storage, upload.temporaryKey, upload);
    await storage.copy(upload.temporaryKey, upload.objectKey, { mimeType: upload.mimeType, etag: verified.etag });
    const copied = await inspectStoredImage(storage, upload.objectKey, upload);
    writeGuard();
    const result = await Upload.findOneAndUpdate({ _id: id, owner, state: 'verifying' }, {
      $set: { state: 'complete', width: copied.width, height: copied.height, etag: copied.etag, expiresAt: new Date(Date.now() + TEMPORARY_LIFETIME_MS) },
      $unset: { verificationLeaseUntil: 1 },
    }, { new: true });
    if (!result) throw fail('UPLOAD_NOT_READY', 'The upload is no longer available.', 409);
    // The signed source key is retained in the record for cleanup after its URL expires.
    return serializeUpload(result);
  } catch (error) {
    writeGuard();
    await Upload.updateOne({ _id: id, owner, state: 'verifying' }, { $set: {
      state: 'failed', failureCode: error.code === 'INVALID_IMAGE' ? 'INVALID_IMAGE' : 'UPLOAD_VERIFICATION_FAILED',
      expiresAt: new Date(Math.max(Date.now() + 300000, upload.signedExpiresAt.getTime() + 60000)),
    }, $unset: { verificationLeaseUntil: 1 } });
    if (error.status && error.status < 500) throw error;
    throw storageError();
  }
}

export async function validateUploadReferences(ids, owner, { purpose, session, productId, fieldKey, checkoutKey } = {}) {
  assertUploadOwner(owner);
  const objectIds = idsForQuery(ids);
  if (!objectIds.length) return [];
  const filter = { _id: { $in: objectIds }, owner, state: 'complete', expiresAt: { $gt: new Date() } };
  if (purpose) filter.purpose = purpose;
  if (productId) filter.productId = productId;
  if (fieldKey) filter.fieldKey = fieldKey;
  if (checkoutKey) filter.checkoutKey = checkoutKey;
  const records = await Upload.find(filter).session(session || null).lean();
  if (records.length !== objectIds.length) throw fail('INVALID_UPLOAD_REFERENCES', 'An image is missing, expired or belongs to another shopping session.');
  const ordered = new Map(records.map((record) => [String(record._id), record]));
  return objectIds.map((id) => ordered.get(String(id)));
}

export async function retainUploads(ids, owner, orderId, { session } = {}) {
  if (!session?.inTransaction()) throw fail('UPLOAD_TRANSACTION_REQUIRED', 'Order files require an atomic order transaction.', 503);
  if (!mongoose.isObjectIdOrHexString(orderId)) throw fail('INVALID_ORDER_REFERENCE', 'A valid order is required.');
  const uploads = await validateUploadReferences(ids, owner, { session });
  if (!uploads.length) return [];
  writeGuard();
  const changed = await Upload.updateMany({ _id: { $in: uploads.map((upload) => upload._id) }, owner, state: 'complete' }, {
    $set: { state: 'retained', orderId }, $unset: { cartId: 1 },
  }, { session });
  if (changed.modifiedCount !== uploads.length) throw fail('UPLOAD_ALREADY_RETAINED', 'One or more images have already been used by an order.', 409);
  for (const upload of uploads) await releaseQuota(upload, { session });
  return uploads.map((upload) => String(upload._id));
}

export async function transferUploadOwnership(ids, fromOwner, toOwner, { session, cartId } = {}) {
  assertUploadOwner(toOwner);
  if (!session?.inTransaction()) throw fail('UPLOAD_TRANSACTION_REQUIRED', 'Cart files require an atomic cart merge transaction.', 503);
  const uploads = await validateUploadReferences(ids, fromOwner, { session });
  if (!uploads.length || fromOwner === toOwner) return;
  const sizeBytes = uploads.reduce((sum, upload) => sum + upload.sizeBytes, 0);
  writeGuard();
  try {
    await UploadQuota.updateOne({ owner: toOwner }, { $setOnInsert: { owner: toOwner, activeCount: 0, activeBytes: 0 } }, { upsert: true, session });
  } catch (error) { if (error.code !== 11000) throw error; }
  writeGuard();
  const quota = await UploadQuota.findOneAndUpdate({ owner: toOwner,
    activeCount: { $lte: MAX_ACTIVE_UPLOADS - uploads.length }, activeBytes: { $lte: MAX_OWNER_BYTES - sizeBytes },
  }, { $inc: { activeCount: uploads.length, activeBytes: sizeBytes } }, { new: true, session });
  if (!quota) throw fail('UPLOAD_QUOTA_EXCEEDED', 'Your account already contains the maximum temporary upload allowance.', 429);
  writeGuard();
  if (cartId && !mongoose.isObjectIdOrHexString(cartId)) throw fail('INVALID_CART_REFERENCE', 'A valid cart is required.');
  const transferred = await Upload.updateMany({ _id: { $in: uploads.map((upload) => upload._id) }, owner: fromOwner, state: 'complete' }, {
    $set: { owner: toOwner, ...(cartId ? { cartId } : {}) }, ...(!cartId ? { $unset: { cartId: 1 } } : {}),
  }, { session });
  if (transferred.modifiedCount !== uploads.length) throw fail('UPLOAD_TRANSFER_CONFLICT', 'The images changed while the cart was being merged.', 409);
  writeGuard();
  await UploadQuota.updateOne({ owner: fromOwner, activeCount: { $gte: uploads.length }, activeBytes: { $gte: sizeBytes } }, {
    $inc: { activeCount: -uploads.length, activeBytes: -sizeBytes },
  }, { session });
}

export async function attachUploadsToCart(ids, owner, cartId, { session } = {}) {
  if (!session?.inTransaction()) throw fail('UPLOAD_TRANSACTION_REQUIRED', 'Cart files require an atomic cart transaction.', 503);
  if (!mongoose.isObjectIdOrHexString(cartId)) throw fail('INVALID_CART_REFERENCE', 'A valid cart is required.');
  const records = await validateUploadReferences(ids, owner, { session });
  if (!records.length) return;
  writeGuard();
  const attached = await Upload.updateMany({ _id: { $in: records.map((record) => record._id) }, owner, state: 'complete',
    $or: [{ cartId: { $exists: false } }, { cartId }],
  }, { $set: { cartId } }, { session });
  if (attached.matchedCount !== records.length) throw fail('UPLOAD_CART_CONFLICT', 'An image already belongs to another cart.', 409);
}

// The caller derives IDs no longer referenced by any remaining line, inside the same cart transaction.
export async function detachUploadsFromCart(ids, owner, cartId, { session } = {}) {
  assertUploadOwner(owner);
  if (!session?.inTransaction()) throw fail('UPLOAD_TRANSACTION_REQUIRED', 'Cart files require an atomic cart transaction.', 503);
  const objectIds = idsForQuery(ids);
  if (!objectIds.length) return;
  if (!mongoose.isObjectIdOrHexString(cartId)) throw fail('INVALID_CART_REFERENCE', 'A valid cart is required.');
  writeGuard();
  await Upload.updateMany({ _id: { $in: objectIds }, owner, state: 'complete', cartId }, { $unset: { cartId: 1 } }, { session });
}

export async function detachUnusedCartUploads(cartId, referencedIds, owner, { session } = {}) {
  assertUploadOwner(owner);
  if (!session?.inTransaction()) throw fail('UPLOAD_TRANSACTION_REQUIRED', 'Cart files require an atomic cart transaction.', 503);
  if (!mongoose.isObjectIdOrHexString(cartId)) throw fail('INVALID_CART_REFERENCE', 'A valid cart is required.');
  const objectIds = idsForQuery(referencedIds);
  writeGuard();
  await Upload.updateMany({ cartId, owner, state: 'complete', _id: { $nin: objectIds } }, { $unset: { cartId: 1 } }, { session });
}

export async function deleteUpload(id, owner) {
  assertUploadOwner(owner);
  if (!mongoose.isObjectIdOrHexString(id)) throw fail('UPLOAD_NOT_FOUND', 'Upload not found.', 404);
  const upload = await Upload.findOne({ _id: id, owner });
  if (!upload) throw fail('UPLOAD_NOT_FOUND', 'Upload not found.', 404);
  if (upload.state === 'retained') throw fail('ORDER_FILE_RETAINED', 'Order files cannot be removed from a shopping cart.', 409);
  if (upload.state === 'verifying') throw fail('UPLOAD_PROCESSING', 'The image is being verified. Please try again shortly.', 409);
  if (upload.cartId) throw fail('CART_FILE_ATTACHED', 'Remove the cart item before deleting its images.', 409);
  writeGuard();
  const removed = await Upload.updateOne({ _id: id, owner, state: { $nin: ['retained', 'verifying'] }, cartId: { $exists: false } }, { $set: {
    state: 'deleting', expiresAt: new Date(Math.max(Date.now(), upload.signedExpiresAt.getTime() + 60000)),
  } });
  if (!removed.matchedCount) throw fail('UPLOAD_IN_USE', 'This image is already attached to a cart or order.', 409);
  return { cleanupQueued: true };
}

export async function openPrivateUpload(id, owner, { adminUser } = {}) {
  if (!mongoose.isObjectIdOrHexString(id)) throw fail('UPLOAD_NOT_FOUND', 'Upload not found.', 404);
  const isAdmin = adminUser?.role === 'admin' && adminUser.active !== false && mongoose.isObjectIdOrHexString(adminUser._id);
  if (!isAdmin) assertUploadOwner(owner);
  const upload = await Upload.findOne({ _id: id, ...(isAdmin ? {} : { owner }), state: { $in: ['complete', 'retained'] } }).select('+objectKey');
  if (!upload || (upload.state !== 'retained' && upload.expiresAt <= new Date())) throw fail('UPLOAD_NOT_FOUND', 'Upload not found.', 404);
  if (isAdmin) {
    writeGuard();
    await AdminAudit.create({ actorId: adminUser._id, action: 'private_file_viewed', resourceType: 'upload', resourceId: String(upload._id),
      details: { purpose: upload.purpose, orderId: upload.orderId ? String(upload.orderId) : null } });
  }
  try {
    const result = await getStorage().open(upload.objectKey);
    if (result.mimeType !== upload.mimeType || result.sizeBytes !== upload.sizeBytes) {
      result.body.destroy?.();
      throw storageError();
    }
    return { ...result, upload: serializeUpload(upload) };
  } catch { throw storageError(); }
}

export async function cleanupExpiredUploads({ batchSize = 20, now = new Date() } = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw fail('INVALID_CLEANUP_BATCH', 'Cleanup batches must contain 1–100 records.');
  const storage = getStorage();
  const result = { processed: 0, deleted: 0, failed: 0, temporarySourcesDeleted: 0 };
  // Retained verified objects remain private; only their obsolete signed source is cleaned.
  const retained = await Upload.find({ state: 'retained', signedExpiresAt: { $lt: new Date(now.getTime() - 60000) }, temporaryKey: { $exists: true } })
    .select('+temporaryKey').sort({ signedExpiresAt: 1 }).limit(batchSize).lean();
  for (const upload of retained) {
    try {
      await storage.remove(upload.temporaryKey);
      writeGuard();
      await Upload.updateOne({ _id: upload._id, state: 'retained', temporaryKey: upload.temporaryKey }, { $unset: { temporaryKey: 1 } });
      result.temporarySourcesDeleted += 1;
    } catch { result.failed += 1; }
  }
  for (let count = 0; count < batchSize; count += 1) {
    writeGuard();
    const upload = await Upload.findOneAndUpdate({
      state: { $ne: 'retained' }, expiresAt: { $lte: now }, signedExpiresAt: { $lt: new Date(now.getTime() - 60000) },
      $or: [{ cleanupLeaseUntil: { $exists: false } }, { cleanupLeaseUntil: { $lt: now } }],
      $and: [{ $or: [{ state: { $ne: 'verifying' } }, { verificationLeaseUntil: { $lte: now } }, { verificationLeaseUntil: { $exists: false } }] }],
    }, { $set: { state: 'deleting', cleanupLeaseUntil: new Date(now.getTime() + 60000) } }, { new: true, sort: { expiresAt: 1 } })
      .select('+temporaryKey +objectKey');
    if (!upload) break;
    result.processed += 1;
    try {
      if (upload.temporaryKey) await storage.remove(upload.temporaryKey);
      if (upload.objectKey) await storage.remove(upload.objectKey);
      await releaseQuota(upload);
      writeGuard();
      await Upload.deleteOne({ _id: upload._id, state: 'deleting', cleanupLeaseUntil: upload.cleanupLeaseUntil });
      result.deleted += 1;
    } catch { result.failed += 1; }
  }
  return result;
}
