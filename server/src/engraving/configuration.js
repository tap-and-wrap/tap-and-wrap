import { isDeepStrictEqual } from 'node:util';
import mongoose from 'mongoose';
import { EngravingServiceConfiguration as Config } from '../models/EngravingServiceConfiguration.js';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { recordAdminAudit } from '../commerce/audit.js';
import { commerceError } from '../commerce/errors.js';
import { configurationInput } from './contracts.js';
export const engravingOpen = () => env.engravingEnabled === true;
export function requireEngraving() { if (!engravingOpen()) throw commerceError(409, 'ENGRAVING_DISABLED', 'New engraving orders are not available yet. Existing orders remain accessible.'); }
export function configurationDTO(record) { return { ...record.configuration, version: record.version, revision: record.revision }; }
export async function currentConfiguration(typeId, { session, fence = false } = {}) {
  const record = await Config.findOne({ typeId, current: true }).session(session || null).lean().maxTimeMS(3000);
  if (!record || record.configuration.status !== 'active' || !record.configuration.assetsApproved) throw commerceError(409, 'ENGRAVING_TYPE_UNAVAILABLE', 'This engraving type is unavailable. Review your selection.');
  if (fence) {
    assertDatabaseWriteAllowed(Config.db, env);
    if (!(await Config.updateOne({ _id: record._id, current: true, version: record.version }, { $inc: { commerceFence: 1 } }, { session })).matchedCount) throw commerceError(409, 'ENGRAVING_CHANGED', 'Engraving configuration changed. Review it again.');
  }
  return record;
}
export async function publishConfiguration(raw, expectedRevision, actor) {
  if (actor?.role !== 'admin' || actor.active === false) throw commerceError(403, 'ADMIN_REQUIRED', 'Administrator authorization required.');
  const configuration = configurationInput.parse(raw);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw commerceError(400, 'REVISION_REQUIRED', 'Load the current revision before saving.');
  assertDatabaseWriteAllowed(Config.db, env);
  let result;
  try { await mongoose.connection.transaction(async session => {
    const old = await Config.findOne({ typeId: configuration.typeId, current: true }).session(session).lean();
    if ((old?.revision ?? 0) !== expectedRevision) throw commerceError(409, 'EDIT_CONFLICT', 'This configuration changed. Your draft is retained.');
    if (old && isDeepStrictEqual(old.configuration, configuration)) { result = old; return; }
    if (old) {
      if (old.configuration.status === 'retired') throw commerceError(409, 'RETIRED_ID', 'Retired type identifiers cannot be reused.');
      for (const placement of old.configuration.placements) {
        const next = configuration.placements.find(value => value.id === placement.id);
        if (!next || placement.status === 'retired' && next.status !== 'retired') throw commerceError(409, 'PLACEMENT_HISTORY_REQUIRED', 'Preserve placement IDs; retire an option instead of removing or reusing it.');
      }
      if (!(await Config.updateOne({ _id: old._id, current: true, revision: expectedRevision }, { $set: { current: false }, $inc: { __v: 1 } }, { session })).matchedCount) throw commerceError(409, 'EDIT_CONFLICT', 'Configuration changed.');
    }
    [result] = await Config.create([{ typeId: configuration.typeId, version: (old?.version || 0) + 1, configuration, current: true, createdBy: actor._id, revision: expectedRevision + 1 }], { session });
    await recordAdminAudit(actor, { action: 'engraving.configuration_published', resourceType: 'configuration', resourceId: String(result._id), details: { version: result.version, typeId: result.typeId, revision: result.revision } }, { session });
  }); } catch (error) { if (error.code === 11000) throw commerceError(409, 'EDIT_CONFLICT', 'Another editor published this type. Your draft is retained.'); throw error; }
  return configurationDTO(result);
}
