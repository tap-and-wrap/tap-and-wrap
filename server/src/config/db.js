import mongoose from 'mongoose';
import { env } from './env.js';
import { Product } from '../models/Product.js';
import { Category } from '../models/Category.js';
import { ComponentOption } from '../models/ComponentOption.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { validateDatabaseUri, assertDatabaseWriteAllowed, databaseDiagnostic } from './database-safety.js';
import { commerceModels } from '../commerce/models.js';
import { websiteModels } from '../website/service.js';
import { AccountActionToken } from '../models/AccountActionToken.js';
import { EmailRateWindow } from '../models/EmailRateWindow.js';
import { TrackingConsent } from '../models/TrackingConsent.js';
import { MetaEvent } from '../models/MetaEvent.js';
export async function connectDatabase() {
  if (!env.mongoUri) { console.warn('MONGODB_URI missing: health/ready will return 503'); return; }
  try {
    const target = validateDatabaseUri(env.mongoUri, { target: env.databaseTarget, nodeEnv: env.nodeEnv });
    // Disable automatic writes until the actual connected database is verified.
    await mongoose.connect(env.mongoUri, { dbName: target.dbName, autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 6000, maxPoolSize: 5 });
    assertDatabaseWriteAllowed(mongoose.connection, env);
    for (const Model of [Product, Category, ComponentOption, User, Session, ...commerceModels, ...websiteModels, AccountActionToken, EmailRateWindow, TrackingConsent, MetaEvent]) {
      assertDatabaseWriteAllowed(Model.db, env);
      await Model.createCollection();
      assertDatabaseWriteAllowed(Model.db, env);
      await Model.createIndexes(); // Enforce declared indexes without dropping existing ones.
    }
    console.log(`MongoDB ready: target=${target.target}, database=${target.dbName}`);
  } catch (error) {
    await mongoose.disconnect().catch(() => {});
    console.warn(`MongoDB not ready: ${databaseDiagnostic(error).code}. Check the dedicated database, scoped network access and credentials privately.`);
  }
}
export function isDatabaseReady() {
  try { assertDatabaseWriteAllowed(mongoose.connection, env); return true; } catch { return false; }
}
