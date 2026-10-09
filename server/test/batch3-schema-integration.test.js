import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startTestDatabase } from './helpers/database.js';
import { databaseModels, verifyDatabaseSchema, initializeDatabaseSchema } from '../src/config/schema.js';
import { connectDatabase, isDatabaseReady } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { Session } from '../src/models/Session.js';

let database;
let configuration;
const silent = { log() {}, warn() {} };
before(async () => {
  database = await startTestDatabase({ models: databaseModels, transactions: true });
  configuration = { ...env, mongoUri: database.uri, databaseTarget: 'local', nodeEnv: 'test', databaseConnectAttempts: 1 };
});
after(async () => { await database?.stop(); });

test('real disposable schema matches all declared unique, TTL, partial and text indexes', async () => {
  const result = await verifyDatabaseSchema(configuration);
  assert.equal(result.collectionsVerified, databaseModels.length);
});

test('ordinary real loopback startup only inspects schema and performs no collection/index DDL', async () => {
  await mongoose.disconnect();
  const commands = [];
  const result = await connectDatabase({ configuration, logger: silent, connect: async (uri, options) => {
    assert.equal(options.autoCreate, false); assert.equal(options.autoIndex, false);
    const connected = await mongoose.connect(uri, { ...options, monitorCommands: true });
    mongoose.connection.getClient().on('commandStarted', event => commands.push(event.commandName));
    return connected;
  } });
  assert.equal(result.connected, true); assert.equal(isDatabaseReady(), true);
  assert.equal(commands.filter(command => command === 'listIndexes').length, databaseModels.length);
  assert.equal(commands.some(command => ['create', 'createIndexes', 'dropIndexes', 'drop'].includes(command)), false);
});

test('missing uniqueness blocks runtime readiness and is repaired only by explicit guarded disposable schema initialization', async () => {
  // This is a synthetic throw-away local collection, never merchant/staging data.
  const indexes = await Session.collection.listIndexes().toArray();
  const unique = indexes.find(index => index.key.tokenHash === 1);
  assert.equal(unique.unique, true); await Session.collection.dropIndex(unique.name);
  await assert.rejects(verifyDatabaseSchema(configuration), { code: 'DATABASE_SCHEMA_NOT_READY' });
  const rejected = await connectDatabase({ configuration, logger: silent });
  assert.equal(rejected.connected, false); assert.equal(rejected.code, 'DATABASE_SCHEMA_NOT_READY'); assert.equal(isDatabaseReady(), false);
  await mongoose.connect(database.uri, { autoCreate: false, autoIndex: false });
  await assert.rejects(initializeDatabaseSchema(configuration), { code: 'DATABASE_SCHEMA_AUTHORIZATION_REQUIRED' });
  await initializeDatabaseSchema(configuration, { authorized: true });
  const recovered = await connectDatabase({ configuration, logger: silent });
  assert.equal(recovered.connected, true); assert.equal(isDatabaseReady(), true);
  assert.equal((await Session.collection.listIndexes().toArray()).some(index => index.key.tokenHash === 1 && index.unique), true);
});
