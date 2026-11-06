import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEngravingSchemaArguments, runEngravingSchema, prepareEngravingSchema } from '../scripts/prepare-engraving-schema.js';
import { schemaConfiguration } from '../scripts/initialize-schema.js';

const configName = 'engravingserviceconfigurations';
const settings = { databaseTarget: 'local', nodeEnv: 'test' };
function fixture({ records = false } = {}) {
  const indexes = new Map([['orders', [{ name: '_id_', key: { _id: 1 } }]],
    ['unrelated', [{ name: '_id_', key: { _id: 1 } }]]]);
  const commands = [];
  const connection = { readyState: 1, host: '127.0.0.1', name: 'tap_wrap_catalog_test', db: {
    listCollections(filter) {
      assert.deepEqual(filter, { name: { $in: [configName, 'orders'] } });
      return { toArray: async () => [...indexes.keys()].filter(name => filter.name.$in.includes(name))
        .map(name => ({ name, type: 'collection', options: {} })) };
    },
    collection(name) {
      assert.ok([configName, 'orders'].includes(name), 'no unrelated collection handles');
      return {
        find(filter, options) {
          assert.equal(name, configName); assert.deepEqual(filter, {});
          assert.deepEqual(options.projection, { _id: 1 }); assert.equal(options.limit, 1);
          return { hasNext: async () => records, close: async () => {} };
        },
        listIndexes: () => ({ toArray: async () => structuredClone(indexes.get(name)) }),
        createIndex: async (key, options) => {
          commands.push({ command: 'createIndex', collection: name, key, options });
          indexes.get(name).push({ key, ...options });
        },
      };
    },
    async createCollection(name) {
      assert.equal(name, configName); commands.push({ command: 'createCollection', collection: name });
      indexes.set(name, [{ name: '_id_', key: { _id: 1 } }]);
    },
  } };
  return { connection, commands, indexes };
}

test('default dry-run is offline even with an unusable production URI', async () => {
  const result = await runEngravingSchema(parseEngravingSchemaArguments([]), { MONGODB_URI: 'invalid-secret-do-not-use' });
  assert.equal(result.connected, false); assert.equal(result.writes, false); assert.equal(result.definitions.length, 3);
});
test('explicit production apply needs both confirmations and cannot inspect-and-apply', () => {
  for (const args of [['--apply'], ['--apply', '--target', 'production', '--confirm-engraving-schema-writes'],
    ['--inspect', '--apply', '--target', 'local', '--confirm-engraving-schema-writes'], ['--target', 'other']]) {
    assert.throws(() => parseEngravingSchemaArguments(args));
  }
});
test('wrong target and missing production settings refuse before connection', async () => {
  const options = parseEngravingSchemaArguments(['--inspect', '--target', 'production']);
  await assert.rejects(runEngravingSchema(options, { DATABASE_TARGET: 'staging' }), { code: 'DATABASE_TARGET_REJECTED' });
  await assert.rejects(runEngravingSchema(options, { DATABASE_TARGET: 'production' }), { code: 'DATABASE_TARGET_REJECTED' });
});
test('production host and exact database guards apply without network access', () => {
  const configuration = { DATABASE_TARGET: 'production', NODE_ENV: 'production', PRODUCTION_DATABASE_AUTHORIZED: 'true',
    PRODUCTION_DATABASE_HOST: 'approved.synthetic.test',
    MONGODB_URI: 'mongodb+srv://synthetic:synthetic@wrong.synthetic.test/tapandwrap_production' };
  assert.throws(() => schemaConfiguration({ target: 'production' }, configuration), { code: 'DATABASE_PRODUCTION_HOST_REJECTED' });
  configuration.MONGODB_URI = 'mongodb+srv://synthetic:synthetic@approved.synthetic.test/tapandwrap_staging';
  assert.throws(() => schemaConfiguration({ target: 'production' }, configuration), { code: 'DATABASE_NAME_REJECTED' });
});
test('returned plans cannot mutate the internal DDL allowlist', async () => {
  const result = await runEngravingSchema(parseEngravingSchemaArguments([]));
  result.definitions[0].collection = 'unrelated'; result.definitions[0].key.typeId = -1;
  const next = await runEngravingSchema(parseEngravingSchemaArguments([]));
  assert.equal(next.definitions[0].collection, configName); assert.equal(next.definitions[0].key.typeId, 1);
});
test('connected read-only preflight reports missing objects with zero writes', async () => {
  const f = fixture(); const result = await prepareEngravingSchema(f.connection, settings);
  assert.equal(result.status, 'MISSING_SCHEMA'); assert.equal(result.missing.length, 4); assert.deepEqual(f.commands, []);
});
test('wrong live database fails before metadata or writes', async () => {
  const f = fixture(); f.connection.name = 'another_database';
  await assert.rejects(prepareEngravingSchema(f.connection, settings, { authorized: true }), { code: 'DATABASE_NAME_REJECTED' });
  assert.deepEqual(f.commands, []);
});
test('narrow creation is exact, leaves unrelated indexes untouched and is idempotent', async () => {
  const f = fixture(); const unrelated = structuredClone(f.indexes.get('unrelated'));
  const result = await prepareEngravingSchema(f.connection, settings, { authorized: true });
  assert.equal(result.status, 'SCHEMA_READY'); assert.equal(f.commands.length, 4);
  assert.deepEqual(f.commands.map(c => c.collection), [configName, 'orders', configName, configName]);
  const order = f.commands.find(c => c.collection === 'orders');
  assert.deepEqual(order.key, { owner: 1, 'cartAddOperations.key': 1 });
  assert.deepEqual(order.options, { name: 'owner_1_cartAddOperations.key_1' });
  assert.deepEqual(f.commands.find(c => c.options?.partialFilterExpression)?.options,
    { name: 'typeId_1', unique: true, partialFilterExpression: { current: true } });
  assert.deepEqual(f.indexes.get('unrelated'), unrelated);
  const repeated = await prepareEngravingSchema(f.connection, settings, { authorized: true });
  assert.equal(repeated.writes, false); assert.equal(f.commands.length, 4);
});
for (const [label, fields] of Object.entries({ unique: { unique: true }, sparse: { sparse: true },
  partial: { partialFilterExpression: { owner: { $exists: true } } }, ttl: { expireAfterSeconds: 0 },
  collation: { collation: { locale: 'en' } }, hidden: { hidden: true },
  wrongKeys: { key: { owner: -1, 'cartAddOperations.key': 1 } } })) {
  test(`Order ${label} conflict stops before any collection creation`, async () => {
    const f = fixture(); f.indexes.get('orders').push({ name: 'owner_1_cartAddOperations.key_1',
      key: { owner: 1, 'cartAddOperations.key': 1 }, ...fields });
    await assert.rejects(prepareEngravingSchema(f.connection, settings, { authorized: true }), { code: 'ENGRAVING_INDEX_MISMATCH' });
    assert.deepEqual(f.commands, []);
  });
}
test('existing configuration records stop without returning any document', async () => {
  const f = fixture({ records: true }); f.indexes.set(configName, [{ name: '_id_', key: { _id: 1 } }]);
  await assert.rejects(prepareEngravingSchema(f.connection, settings, { authorized: true }), { code: 'ENGRAVING_CONFIGURATION_RECORDS_PRESENT' });
  assert.deepEqual(f.commands, []);
});
test('wrong configuration partial filter fails closed', async () => {
  const f = fixture(); f.indexes.set(configName, [{ name: 'typeId_1', key: { typeId: 1 }, unique: true,
    partialFilterExpression: { current: { $eq: true } } }]);
  await assert.rejects(prepareEngravingSchema(f.connection, settings, { authorized: true }), { code: 'ENGRAVING_INDEX_MISMATCH' });
  assert.deepEqual(f.commands, []);
});
test('missing orders collection is never created', async () => {
  const f = fixture(); f.indexes.delete('orders');
  await assert.rejects(prepareEngravingSchema(f.connection, settings, { authorized: true }), { code: 'ENGRAVING_ORDERS_COLLECTION_MISSING' });
  assert.deepEqual(f.commands, []);
});

test('real disposable MongoDB creates only the exact delta, verifies options and repeats without DDL', async () => {
  const { startTestDatabase } = await import('./helpers/database.js');
  const { default: mongoose } = await import('mongoose');
  const database = await startTestDatabase();
  let connection;
  try {
    await mongoose.connection.db.createCollection('orders');
    await mongoose.connection.db.createCollection('unrelated');
    await mongoose.connection.db.collection('unrelated').insertOne({ preserved: true });
    connection = await mongoose.createConnection(database.uri, { autoCreate: false, autoIndex: false, monitorCommands: true }).asPromise();
    const commands = [];
    connection.getClient().on('commandStarted', event => commands.push({ name: event.commandName, command: event.command }));
    const dry = await prepareEngravingSchema(connection, settings);
    assert.equal(dry.status, 'MISSING_SCHEMA');
    assert.equal(commands.some(c => ['create', 'createIndexes', 'insert', 'update', 'delete'].includes(c.name)), false);
    commands.length = 0;
    assert.equal((await prepareEngravingSchema(connection, settings, { authorized: true })).status, 'SCHEMA_READY');
    const writes = commands.filter(c => ['create', 'createIndexes', 'insert', 'update', 'delete', 'drop', 'dropIndexes'].includes(c.name));
    assert.equal(writes.length, 4);
    assert.equal(writes[0].command.create, configName);
    assert.ok(writes.slice(1).every(c => c.name === 'createIndexes' && [configName, 'orders'].includes(c.command.createIndexes)));
    const indexes = await connection.db.collection(configName).listIndexes().toArray();
    assert.equal(indexes.find(i => i.name === 'typeId_1_version_1').unique, true);
    assert.deepEqual(indexes.find(i => i.name === 'typeId_1').partialFilterExpression, { current: true });
    commands.length = 0;
    assert.equal((await prepareEngravingSchema(connection, settings, { authorized: true })).writes, false);
    assert.equal(commands.some(c => ['create', 'createIndexes', 'insert', 'update', 'delete'].includes(c.name)), false);
    assert.deepEqual(await connection.db.collection('unrelated').findOne({}, { projection: { _id: 0 } }), { preserved: true });
  } finally { await connection?.close(); await database.stop(); }
});
