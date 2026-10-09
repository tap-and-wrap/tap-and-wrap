import mongoose from 'mongoose';
import { MongoMemoryServer, MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as productModule from '../../src/models/Product.js';
import * as categoryModule from '../../src/models/Category.js';
import * as componentModule from '../../src/models/ComponentOption.js';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cacheRoot = join(serverRoot, '.cache');
const binaryCache = join(cacheRoot, 'mongodb');
const catalogModels = [
  productModule.Product || productModule.default,
  categoryModule.Category || categoryModule.default,
  componentModule.ComponentOption || componentModule.default,
];

function assertOwnedDirectory(cacheDirectory, dbDirectory) {
  const child = relative(cacheDirectory, dbDirectory);
  if (!child || child === '..' || child.startsWith(`..${sep}`) || resolve(dbDirectory) !== join(cacheDirectory, child)) {
    throw new Error('Refusing to remove a test database outside the project cache.');
  }
}

/** Starts a new, empty local database. It never reads the application's database URI. */
export async function startTestDatabase({ models = [], transactions = false } = {}) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Isolated database helper can only run with NODE_ENV=test.');
  }
  if (process.env.MONGODB_URI || process.env.CATALOG_IMPORT_STAGING_URI) {
    throw new Error('Refusing a test environment that inherited an application or import database URI.');
  }
  if (mongoose.connection.readyState !== 0) {
    throw new Error('Refusing to reuse an existing Mongoose connection.');
  }

  await mkdir(binaryCache, { recursive: true });
  const resolvedCache = await realpath(cacheRoot);
  assertOwnedDirectory(await realpath(serverRoot), resolvedCache);
  const resolvedBinaryCache = await realpath(binaryCache);
  assertOwnedDirectory(resolvedCache, resolvedBinaryCache);
  const dbDirectory = await mkdtemp(join(resolvedCache, 'catalog-test-'));
  assertOwnedDirectory(resolvedCache, dbDirectory);

  // A system-binary override could point at an unrelated project's installation.
  delete process.env.MONGOMS_SYSTEM_BINARY;
  let mongod;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    try {
      await mongoose.disconnect();
    } finally {
      try {
        if (mongod) await mongod.stop({ doCleanup: false, force: true });
      } finally {
        assertOwnedDirectory(resolvedCache, dbDirectory);
        await rm(dbDirectory, { recursive: true, force: true });
      }
    }
  };

  try {
    const binary = { version: '8.2.6', downloadDir: resolvedBinaryCache, systemBinary: undefined };
    mongod = transactions ? await MongoMemoryReplSet.create({
      binary,
      replSet: { count: 1, ip: '127.0.0.1', dbName: 'tap_wrap_catalog_test', storageEngine: 'wiredTiger' },
      instanceOpts: [{ dbPath: dbDirectory, port: 0 }],
    }) : await MongoMemoryServer.create({
      binary: { version: '8.2.6', downloadDir: resolvedBinaryCache, systemBinary: undefined },
      instance: {
        ip: '127.0.0.1',
        port: 0,
        dbName: 'tap_wrap_catalog_test',
        dbPath: dbDirectory,
        storageEngine: 'wiredTiger',
      },
    });
    const uri = mongod.getUri('tap_wrap_catalog_test');
    const parsed = new URL(uri);
    if (parsed.protocol !== 'mongodb:' || parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/tap_wrap_catalog_test') {
      throw new Error('Isolated database returned an unexpected network address.');
    }
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    const uniqueModels = [...new Set([...catalogModels, ...models, ...Object.values(mongoose.models)])];
    if (uniqueModels.some((model) => !model || typeof model.init !== 'function')) {
      throw new Error('Isolated database received an invalid model.');
    }
    await Promise.all(uniqueModels.map((model) => model.init()));
    return { stop, uri };
  } catch (error) {
    await stop();
    throw error;
  }
}
