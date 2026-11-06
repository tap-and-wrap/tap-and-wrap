import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createProductionClient, publishInitialTypes } from '../scripts/launch-engraving-production.js';

test('launch authenticates against actual isolated API, publishes audited versions and repeats without writes', async () => {
  const { env } = await import('../src/config/env.js');
  const original = { ...env };
  Object.assign(env, { clientOrigin: 'https://tapandwrap.net', engravingConfigurationEnabled: true,
    engravingEnabled: false, checkoutEnabled: true });
  const [{ app }, { default: mongoose }, { default: bcrypt }, { startTestDatabase }, { initializeDatabaseSchema },
    { connectDatabase }, { databaseModels }] = await Promise.all([
    import('../src/app.js'), import('mongoose'), import('bcryptjs'), import('./helpers/database.js'),
    import('../src/config/schema.js'), import('../src/config/db.js'), import('../src/config/schema.js'),
  ]);
  let database, server, client;
  try {
    database = await startTestDatabase({ transactions: true });
    env.mongoUri = database.uri;
    await initializeDatabaseSchema(env, { authorized: true, models: databaseModels });
    assert.equal((await connectDatabase({ configuration: env, logger: { log() {}, warn() {} } })).connected, true);
    const admin = await mongoose.models.User.create({ name: 'Disposable Launch Operator', email: 'operator@isolated.example.test',
      passwordHash: await bcrypt.hash('isolated-launch-password', 4), role: 'admin', active: true });
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const request = (url, options, callback) => http.request(new URL(url.pathname + url.search,
      `http://127.0.0.1:${server.address().port}`), { method: options.method, headers: options.headers, timeout: options.timeout }, callback);
    client = createProductionClient({ request, lookup() {} });
    const identity = await client.login('operator@isolated.example.test', 'isolated-launch-password');
    assert.equal(identity.id, String(admin._id));
    const result = await publishInitialTypes(client, identity);
    assert.equal(result.length, 9);
    const model = mongoose.models.EngravingServiceConfiguration;
    assert.equal(await model.countDocuments({ current: true }), 9);
    assert.equal(await model.countDocuments({ createdBy: admin._id }), 9);
    assert.equal(await mongoose.models.AdminAudit.countDocuments({ action: 'engraving.configuration_published' }), 9);
    await publishInitialTypes(client, identity);
    assert.equal(await model.countDocuments(), 9);
    assert.equal(await mongoose.models.AdminAudit.countDocuments({ action: 'engraving.configuration_published' }), 9);
    assert.equal(await mongoose.models.Order.countDocuments(), 0);
    assert.equal((await client.get('/api/v1/commerce/engraving/types?page=1')).enabled, false);
    await client.close(); client = null;
    assert.equal(await mongoose.models.Session.countDocuments(), 0);
  } finally {
    await client?.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await database?.stop(); Object.assign(env, original);
  }
});
