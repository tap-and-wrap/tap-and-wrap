import mongoose from 'mongoose';
import { GiftBoxPersonalizationOption } from '../models/GiftBoxPersonalizationOption.js';
import { Upload } from '../models/Upload.js';
import { priceGiftBoxPersonalization } from './personalization-pricing.mjs';
import { parseGiftBoxPersonalizationIntent } from '../../../shared/gift-box/personalization-intent.mjs';
import { getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import { verifyDatabaseSchema } from '../config/schema.js';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { recordAdminAudit } from '../commerce/audit.js';
import { builderError } from './validation.js';
import { giftBoxOptionIsOrderPriced, parseGiftBoxPersonalizationOptionPatch } from '../../../shared/gift-box/personalization-option-contract.mjs';

async function ready() {
  if (!env.giftBoxBuilderBackendEnabled || !env.giftBoxPersonalizationOptionsEnabled)
    throw builderError(404,'GIFT_BOX_PERSONALIZATION_OPTIONS_DISABLED','Gift Box personalization options are not available.');
  await verifyDatabaseSchema(env, { models: [GiftBoxPersonalizationOption], timeoutMs: 3000 });
}
function actorCheck(actor) {
  if (actor?.role !== 'admin' || actor.active === false || !mongoose.isObjectIdOrHexString(actor._id))
    throw builderError(403,'ADMIN_REQUIRED','Admin authorization is required.');
}
function display(option, admin = false) {
  const readyForOrder = giftBoxOptionIsOrderPriced(option);
  const base = { optionId: option.optionId, kind: option.kind, displayName: option.displayName,
    boxIds: option.boxIds, enabled: option.enabled === true, available: option.available === true,
    pricePiastres: readyForOrder ? option.pricePiastres : null,
    ...(option.kind === 'engraving_surface' ? { approvedStyleIds: option.approvedStyleIds,
      approvedColorIds: option.approvedColorIds } : {}) };
  if (!admin) return base;
  return { ...base, configuredPricePiastres: option.pricePiastres, pricing: option.priceApproval,
    revision: option.__v, fontLicensesConfirmed: option.fontLicensesConfirmed,
    priceApprovedAt: option.priceApprovedAt, updatedAt: option.updatedAt };
}
export async function listGiftBoxPersonalizationOptions({ admin = false } = {}) {
  await ready();
  const records = await GiftBoxPersonalizationOption.find({}).sort({ kind: 1, optionId: 1 }).limit(100).lean().maxTimeMS(3000);
  const options = admin ? records : records.filter(giftBoxOptionIsOrderPriced);
  return { options: options.map(record => display(record, admin)),
    personalizationCheckoutEnabled: false };
}
export async function updateGiftBoxPersonalizationOption(optionId, raw, actor) {
  actorCheck(actor); await ready();
  assertDatabaseWriteAllowed(GiftBoxPersonalizationOption.db, env);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      assertDatabaseWriteAllowed(GiftBoxPersonalizationOption.db, env);
      let record = await GiftBoxPersonalizationOption.findOne({ optionId }).session(session).maxTimeMS(3000);
      const patch = parseGiftBoxPersonalizationOptionPatch(raw, { optionId, existingKind: record?.kind });
      if (patch.expectedRevision !== (record?.__v ?? 0)) throw builderError(409,'EDIT_CONFLICT','The option changed. Reload before saving.');
      if (!record) {
        if (typeof patch.displayName !== 'string') throw builderError(400,'OPTION_NAME_REQUIRED','Supply a display name for a new option.');
        record = new GiftBoxPersonalizationOption({ optionId,kind: patch.kind, displayName: patch.displayName,
          createdBy: actor._id, updatedBy: actor._id });
      }
      for (const key of ['displayName','enabled','available','boxIds','approvedStyleIds','approvedColorIds','fontLicensesConfirmed'])
        if (Object.hasOwn(patch,key)) record[key] = patch[key];
      if (Object.hasOwn(patch,'pricePiastres')) {
        record.pricePiastres = patch.pricePiastres;
        record.priceApproval = patch.pricePiastres === null ? 'pending' : patch.pricePiastres === 0 ? 'complimentary' : 'paid';
        record.priceApprovedBy = patch.pricePiastres === null ? null : actor._id;
        record.priceApprovedAt = patch.pricePiastres === null ? null : new Date();
      }
      record.updatedBy = actor._id; record.markModified('updatedBy');
      const creating = record.isNew;
      await record.save({ session });
      if (creating) {
        const claim = await GiftBoxPersonalizationOption.updateOne({ _id: record._id,__v: 0 },{$inc: {__v: 1}},{session});
        if (claim.matchedCount !== 1) throw builderError(409,'EDIT_CONFLICT','The option changed before its first save.');
        record.__v = 1;
      }
      await recordAdminAudit(actor, { action: 'gift_box.personalization_option.updated', resourceType: 'configuration',
        resourceId: `gift-box:personalization:${optionId}`, details: { optionId, revision: record.__v,
          changedFields: Object.keys(patch).filter(key => !['expectedRevision','confirmComplimentary'].includes(key)) } }, { session });
      result = display(record.toObject(), true);
    });
    return result;
  } catch(error) {
    if (error?.code === 11000 || error instanceof mongoose.Error.VersionError)
      throw builderError(409,'EDIT_CONFLICT','The option changed. Reload before saving.');
    throw error;
  } finally { await session.endSession(); }
}

// Read-only personalization quotation for a server-issued shopping owner.
// A valid preview is never an authorization to add a Gift Box to the cart or place an order.
export async function quoteGiftBoxPersonalizationPreview(owner, raw) {
  await ready();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 2
    || !Object.hasOwn(raw,'boxId') || !Object.hasOwn(raw,'intent')
    || getFixedComponent(raw.boxId)?.category !== 'box') {
    throw builderError(400,'GIFT_BOX_PERSONALIZATION_INVALID','Choose a supported gift box and personalization.');
  }
  let intent;
  try { intent = parseGiftBoxPersonalizationIntent(raw.intent); }
  catch { throw builderError(400,'GIFT_BOX_PERSONALIZATION_INVALID','Review your photo and engraving selections.'); }
  const ids = intent.photoPrints.map(photo => photo.uploadId);
  const optionIds = [...new Set([...intent.photoPrints.map(p=>p.printOptionId), ...intent.engravings.map(e=>e.surfaceOptionId)])];
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      // MongoDB sessions do not support parallel operations inside one transaction.
      const uploads = ids.length ? await Upload.find({ _id: { $in: ids }, owner })
        .select('_id owner purpose giftBoxId fieldKey state expiresAt cartId').session(session).lean().maxTimeMS(3000) : [];
      const options = optionIds.length ? await GiftBoxPersonalizationOption.find({ optionId: { $in: optionIds } })
        .session(session).lean().maxTimeMS(3000) : [];
      result = priceGiftBoxPersonalization({ intent, boxId: raw.boxId, owner, uploads, options });
    }, { readConcern: { level: 'snapshot' } });
    return { personalization: result, checkoutAllowed: false };
  } finally { await session.endSession(); }
}
