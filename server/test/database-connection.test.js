import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';
import { connectDatabase, isDatabaseReady } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { Product } from '../src/models/Product.js';
import { Category } from '../src/models/Category.js';
import { ComponentOption } from '../src/models/ComponentOption.js';
import { User } from '../src/models/User.js';
import { Session } from '../src/models/Session.js';
import { commerceModels } from '../src/commerce/models.js';
import { websiteModels } from '../src/website/service.js';
import { AccountActionToken } from '../src/models/AccountActionToken.js';
import { EmailRateWindow } from '../src/models/EmailRateWindow.js';
import { TrackingConsent } from '../src/models/TrackingConsent.js';
import { MetaEvent } from '../src/models/MetaEvent.js';

const stagingUri = 'mongodb+srv://fixture-user:fixture-secret@fixture.mongodb.net/tapandwrap_staging?retryWrites=true&w=majority';
const models = [Product, Category, ComponentOption, User, Session, ...commerceModels, ...websiteModels, AccountActionToken, EmailRateWindow, TrackingConsent, MetaEvent];

function isolatedConnection(t, { connectedName = 'tapandwrap_staging', connectionError, changeAfterCollection = false } = {}) {
  const previousEnv = { ...env };
  Object.assign(env, { nodeEnv: 'development', databaseTarget: 'staging', mongoUri: stagingUri });
  t.after(() => Object.assign(env, previousEnv));
  const state = { readyState: 0, name: undefined, host: 'fixture.mongodb.net' };
  for (const field of ['readyState', 'name', 'host']) {
    const previous = Object.getOwnPropertyDescriptor(mongoose.connection, field);
    Object.defineProperty(mongoose.connection, field, { configurable: true, get: () => state[field] });
    t.after(() => {
      if (previous) Object.defineProperty(mongoose.connection, field, previous);
      else delete mongoose.connection[field];
    });
  }
  const connectCalls = [];
  const writes = [];
  const logs = [];
  t.mock.method(mongoose, 'connect', async (...args) => {
    connectCalls.push(args);
    if (connectionError) throw connectionError;
    Object.assign(state, { readyState: 1, name: connectedName });
    return mongoose;
  });
  t.mock.method(mongoose, 'disconnect', async () => { state.readyState = 0; });
  for (const method of ['warn', 'error', 'log']) {
    t.mock.method(console, method, (...args) => { logs.push(args.map(String).join(' ')); });
  }
  for (const Model of models) {
    assert.equal(Model.db, mongoose.connection);
    t.mock.method(Model, 'createCollection', async () => {
      writes.push(`${Model.modelName}:collection`);
      if (changeAfterCollection) state.name = 'tapandwrap_production';
    });
    t.mock.method(Model, 'createIndexes', async () => { writes.push(`${Model.modelName}:indexes`); });
  }
  return { state, connectCalls, writes, logs };
}

function assertRedacted(logs) {
  const output = logs.join('\n');
  for (const secret of ['fixture-user', 'fixture-secret', 'fixture.mongodb.net', stagingUri, 'mongodb+srv://']) {
    assert.equal(output.includes(secret), false, 'Connection diagnostics must redact sensitive input');
  }
}

test('unsafe configured databases are rejected before connecting or creating any collections or indexes', async (t) => {
  const observed = isolatedConnection(t);
  env.mongoUri = stagingUri.replace('tapandwrap_staging', 'tapandwrap_production');
  await connectDatabase();
  assert.deepEqual(observed.connectCalls, []);
  assert.deepEqual(observed.writes, []);
  assert.equal(isDatabaseReady(), false);
  assert.match(observed.logs.join(' '), /DATABASE_NAME_REJECTED/);
  assertRedacted(observed.logs);
});

test('validated staging connections pin the database and defer collection/index writes until after validation', async (t) => {
  const observed = isolatedConnection(t);
  await connectDatabase();
  assert.equal(observed.connectCalls.length, 1);
  const [, options] = observed.connectCalls[0];
  assert.equal(options.dbName, 'tapandwrap_staging');
  assert.equal(options.autoCreate, false);
  assert.equal(options.autoIndex, false);
  assert.deepEqual(observed.writes, models.flatMap((Model) => [`${Model.modelName}:collection`, `${Model.modelName}:indexes`]));
  assert.equal(isDatabaseReady(), true);
  assertRedacted(observed.logs);
});

test('a driver connected to an unexpected database cannot perform the first persistent model operation', async (t) => {
  const observed = isolatedConnection(t, { connectedName: 'tapandwrap_production' });
  await connectDatabase();
  assert.equal(observed.connectCalls.length, 1);
  assert.deepEqual(observed.writes, []);
  assert.equal(isDatabaseReady(), false);
  assert.match(observed.logs.join(' '), /DATABASE_NAME_REJECTED/);
  assertRedacted(observed.logs);
});

test('a target change during initialization blocks the next index write and every subsequent model operation', async (t) => {
  const observed = isolatedConnection(t, { changeAfterCollection: true });
  await connectDatabase();
  assert.deepEqual(observed.writes, [`${Product.modelName}:collection`]);
  assert.equal(isDatabaseReady(), false);
  assert.match(observed.logs.join(' '), /DATABASE_NAME_REJECTED/);
  assertRedacted(observed.logs);
});

test('driver failures produce useful credential-free diagnostics and cannot initialize models', async (t) => {
  const connectionError = new Error(`Connection failed for fixture-user fixture-secret at ${stagingUri}`);
  connectionError.name = 'MongoServerSelectionError';
  const observed = isolatedConnection(t, { connectionError });
  await connectDatabase();
  assert.deepEqual(observed.writes, []);
  assert.equal(isDatabaseReady(), false);
  assert.match(observed.logs.join(' '), /DATABASE_CONNECTION_FAILED/);
  assertRedacted(observed.logs);
});
