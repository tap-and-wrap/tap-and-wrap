import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { AdminAudit } from '../models/AdminAudit.js';

function safeDetails(value, depth = 0) {
  if (depth > 3) throw new Error('Audit details exceed the supported depth.');
  if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (typeof value === 'string' && value.length <= 120 && !/[\r\n]/.test(value)) return value;
  if (Array.isArray(value) && value.length <= 20) return value.map((entry) => safeDetails(entry, depth + 1));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length <= 20) {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      if (!/^[a-zA-Z0-9_]{1,60}$/.test(key)
          || /password|secret|token|uri|email|phone|address|objectKey|temporaryKey|receipt|artwork|engravingText|personalization/i.test(key)) {
        throw new Error('Private fields must not be included in audit details.');
      }
      result[key] = safeDetails(entry, depth + 1);
    }
    return result;
  }
  throw new Error('Audit details must contain bounded, redacted values.');
}

export async function recordAdminAudit(adminUser, record, { session } = {}) {
  if (adminUser?.role !== 'admin' || adminUser.active === false || !mongoose.isObjectIdOrHexString(adminUser._id)) {
    const error = new Error('Admin authorization is required.');
    error.status = 403;
    error.code = 'ADMIN_REQUIRED';
    throw error;
  }
  assertDatabaseWriteAllowed(AdminAudit.db, env);
  const [audit] = await AdminAudit.create([{
    actorId: adminUser._id, action: record.action, resourceType: record.resourceType,
    resourceId: String(record.resourceId), details: safeDetails(record.details || {}),
  }], { session });
  return audit;
}
