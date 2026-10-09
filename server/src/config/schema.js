import { isDeepStrictEqual } from 'node:util';
import { Product } from '../models/Product.js';
import { Category } from '../models/Category.js';
import { ComponentOption } from '../models/ComponentOption.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { commerceModels } from '../commerce/models.js';
import { websiteModels } from '../website/service.js';
import { AccountActionToken } from '../models/AccountActionToken.js';
import { EmailRateWindow } from '../models/EmailRateWindow.js';
import { TrackingConsent } from '../models/TrackingConsent.js';
import { MetaEvent } from '../models/MetaEvent.js';
import { assertDatabaseWriteAllowed, DatabaseSafetyError } from './database-safety.js';

export const databaseModels = [...new Set([Product, Category, ComponentOption, User, Session, ...commerceModels,
  ...websiteModels, AccountActionToken, EmailRateWindow, TrackingConsent, MetaEvent])];

function sameKeys(required, actual) {
  const entries = Object.entries(required);
  // MongoDB serializes a text index as _fts/_ftsx; its weights preserve declared text fields.
  if (entries.some(([, value]) => value === 'text')) {
    return actual.key?._fts === 'text' && isDeepStrictEqual(
      Object.fromEntries(entries.filter(([, value]) => value === 'text').map(([key]) => [key, 1])), actual.weights,
    );
  }
  return isDeepStrictEqual(entries, Object.entries(actual.key || {}));
}

export function requiredIndexExists(keys, options, actualIndexes) {
  return actualIndexes.some(index => sameKeys(keys, index)
    && (!options.name || index.name === options.name)
    && Boolean(index.unique) === Boolean(options.unique)
    && Boolean(index.sparse) === Boolean(options.sparse)
    && index.expireAfterSeconds === options.expireAfterSeconds
    && isDeepStrictEqual(index.partialFilterExpression, options.partialFilterExpression)
    && (options.collation === undefined || Object.entries(options.collation).every(([key, value]) => isDeepStrictEqual(index.collation?.[key], value))));
}

/** Runtime startup reads declared indexes; it never creates, drops or repairs them. */
export async function verifyDatabaseSchema(configuration, { models = databaseModels, timeoutMs = 6000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new DatabaseSafetyError('DATABASE_SCHEMA_TIMEOUT_INVALID');
  const deadline = Date.now() + timeoutMs;
  for (const Model of models) {
    assertDatabaseWriteAllowed(Model.db, configuration);
    let actualIndexes;
    let cursor;
    let timer;
    try {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new DatabaseSafetyError('DATABASE_SCHEMA_TIMEOUT');
      // Driver CSOT bounds selection/network/cursor work; maxTimeMS also bounds server work.
      cursor = Model.collection.listIndexes({ timeoutMS: remaining, maxTimeMS: remaining });
      // Keep a hard aggregate bound even if an injected adapter ignores driver options.
      actualIndexes = await Promise.race([cursor.toArray(), new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new DatabaseSafetyError('DATABASE_SCHEMA_TIMEOUT')), remaining);
      })]);
    }
    catch (error) {
      if (error?.code === 26) throw new DatabaseSafetyError('DATABASE_SCHEMA_NOT_READY');
      if (error?.code === 50 || error?.name === 'MongoOperationTimeoutError') throw new DatabaseSafetyError('DATABASE_SCHEMA_TIMEOUT');
      throw error;
    } finally {
      clearTimeout(timer);
      // Cursor cleanup is itself bounded by the installed driver's CSOT support.
      if (cursor?.close) void Promise.resolve().then(() => cursor.close({ timeoutMS: 100 })).catch(() => {});
    }
    if (!Model.schema.indexes().every(([keys, options]) => requiredIndexExists(keys, options, actualIndexes))) {
      throw new DatabaseSafetyError('DATABASE_SCHEMA_NOT_READY');
    }
  }
  return { collectionsVerified: models.length };
}

/** Explicit operator operation only. Revalidate before each persistent DDL operation. */
export async function initializeDatabaseSchema(configuration, { authorized = false, models = databaseModels } = {}) {
  if (authorized !== true) throw new DatabaseSafetyError('DATABASE_SCHEMA_AUTHORIZATION_REQUIRED');
  for (const Model of models) {
    assertDatabaseWriteAllowed(Model.db, configuration);
    await Model.createCollection();
    assertDatabaseWriteAllowed(Model.db, configuration);
    await Model.createIndexes();
  }
  return verifyDatabaseSchema(configuration, { models });
}
