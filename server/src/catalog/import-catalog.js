import { assertConnectedDatabase } from '../config/database-safety.js';
import { resolveCategoryImportIdentities } from './category-import-identity.js';

const chunks = (entries, size) => Array.from({ length: Math.ceil(entries.length / size) }, (_, index) => entries.slice(index * size, (index + 1) * size));

function requireValidPlan(plan) {
  if (!plan?.report || plan.report.fatalErrors.length || plan.report.invalidRows.length) {
    throw new Error('Catalog validation failed. Resolve every invalid row and header before applying the import.');
  }
}

async function validatedInsert(Model, payload) {
  const now = new Date();
  const document = new Model({ ...payload, createdAt: now, updatedAt: now });
  await document.validate();
  return { ...document.toObject({ depopulate: true, minimize: false, versionKey: false }), __v: 0 };
}

/** Validate every schema and relationship offline, without opening a connection. */
export async function validateCatalogModels(plan, { Product, ComponentOption, Category } = {}) {
  requireValidPlan(plan);
  const categoryIds = new Map();
  const ordered = [...plan.categories].sort((left, right) => Number(Boolean(left.parentKey)) - Number(Boolean(right.parentKey)));
  for (const { key, parentKey, sourceMainCategory, ...payload } of ordered) {
    const parentId = parentKey ? categoryIds.get(parentKey) : null;
    if (parentKey && !parentId) throw new Error('Catalog schema preflight found an unresolved parent category');
    const insert = await validatedInsert(Category, { ...payload, parentId, importCategoryKey: key });
    categoryIds.set(key, insert._id);
  }
  for (const [records, Model] of [[plan.products, Product], [plan.components, ComponentOption]]) {
    for (const { mainCategoryKey, subcategoryKey, ...payload } of records) {
      const categoryId = categoryIds.get(mainCategoryKey);
      const subcategoryId = categoryIds.get(subcategoryKey);
      if (!categoryId || !subcategoryId) throw new Error('Catalog schema preflight found unresolved product categories');
      await validatedInsert(Model, { ...payload, categoryId, subcategoryId });
    }
  }
  return { valid: true, products: plan.products.length, components: plan.components.length, categories: plan.categories.length };
}

function assertImportConnections(models) {
  if (process.env.NODE_ENV === 'production') throw new Error('Catalog database writes are disabled in production');
  if (!models.every((Model) => Model.db === models[0].db)) throw new Error('Import models must share the same dedicated staging connection');
  for (const Model of models) assertConnectedDatabase(Model.db, { target: 'staging', nodeEnv: process.env.NODE_ENV });
}

async function fenceImportedRelations(Category, operations, kind, models, session) {
  const inserts = operations.map(operation => operation.updateOne.update.$setOnInsert);
  const references = new Set();
  if (kind === 'categories') {
    for (const insert of inserts) if (insert.parentId) references.add(String(insert.parentId));
  } else {
    for (const insert of inserts) {
      references.add(String(insert.categoryId));
      if (insert.subcategoryId) references.add(String(insert.subcategoryId));
    }
  }
  if (!references.size) return;
  const categories = await Category.find({ _id: { $in: [...references] } }).select('_id parentId').session(session).lean().maxTimeMS(3000);
  const byId = new Map(categories.map(category => [String(category._id), category]));
  const reject = () => { throw Object.assign(new Error('Imported category relationships changed. Review the hierarchy before resuming.'), { code: 'CATEGORY_HIERARCHY_CHANGED', status: 409 }); };
  for (const insert of inserts) {
    const mainId = kind === 'categories' ? insert.parentId : insert.categoryId;
    if (!mainId) continue;
    const main = byId.get(String(mainId));
    if (!main || main.parentId) reject();
    if (kind !== 'categories' && insert.subcategoryId) {
      const child = byId.get(String(insert.subcategoryId));
      if (!child || String(child.parentId) !== String(mainId)) reject();
    }
  }
  // Same per-category field as admin relationship writes. Only referenced
  // categories contend; merchant labels, IDs, timestamps and approvals stay intact.
  for (const category of categories.sort((a, b) => String(a._id).localeCompare(String(b._id)))) {
    assertImportConnections(models);
    const result = await Category.updateOne({ _id: category._id, parentId: category.parentId ?? null }, { $inc: { relationshipRevision: 1 } }, { session, timestamps: false });
    if (result.matchedCount !== 1) reject();
  }
}

function uncertainCommit(error, callbackCompleted) {
  const labelled = error?.hasErrorLabel?.('UnknownTransactionCommitResult') || error?.errorLabels?.includes('UnknownTransactionCommitResult');
  return Boolean(labelled || (callbackCompleted && /Network|Timeout/i.test(error?.name || '')));
}

/**
 * Applies an already audited plan to explicitly supplied staging/test models.
 * This module never opens a connection and never reads application credentials.
 * Catalog records are insert-only. Referenced categories receive an internal
 * relationship fence; merchant fields and timestamps are never overwritten.
 */
export async function applyCatalogPlan(plan, { Product, ComponentOption, Category, batchSize = 50, onProgress } = {}) {
  requireValidPlan(plan);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error('Batch size must be an integer from 1 to 100');
  if (![Product, ComponentOption, Category].every((Model) => typeof Model === 'function')) throw new Error('Explicit staging/test models are required');
  const models = [Product, ComponentOption, Category];
  assertImportConnections(models);
  const applied = { mode: 'apply', target: 'staging', inserted: { products: 0, components: 0, categories: 0 },
    preserved: { products: 0, components: 0, categories: 0 }, sourceChanges: [], classificationConflicts: [], batchSize,
    status: 'preparing', journal: [], startedAt: new Date().toISOString() };
  const progress = async (event) => {
    if (event) applied.journal.push({ ...event, at: new Date().toISOString() });
    if (onProgress) await onProgress(structuredClone(applied));
  };
  const writeBatch = async (Model, operations, kind, batchNumber) => {
    assertImportConnections(models);
    await progress({ stage: kind, batch: batchNumber, status: 'started', attempted: operations.length });
    let result;
    let callbackCompleted = false;
    let committed = false;
    let failure;
    const session = await Model.db.startSession();
    try {
      // Use the driver session directly. A retried bulk uses immutable prepared
      // operations, rather than hydrated documents/Mongoose rollback state.
      await session.withTransaction(async () => {
        callbackCompleted = false;
        assertImportConnections(models);
        result = await Model.bulkWrite(operations, { ordered: true, timestamps: false, session });
        // Validate after the bulk so parents newly inserted in this batch are
        // visible. A failed fence aborts every write in this batch.
        await fenceImportedRelations(Category, operations, kind, models, session);
        callbackCompleted = true;
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 10000 });
      committed = true;
      // Commit acknowledgement is authoritative even if journaling or session
      // cleanup later fails. Never hide this batch's known persistent writes.
      applied.inserted[kind] += result.upsertedCount;
      applied.preserved[kind] += result.matchedCount;
      await progress({ stage: kind, batch: batchNumber, status: 'completed', attempted: operations.length, inserted: result.upsertedCount, preserved: result.matchedCount });
    } catch (error) {
      failure = error;
      // A bulk prefix acknowledged inside an aborted transaction did NOT commit.
      // Ambiguous commit failures remain explicitly uncertain; never guess totals.
      if (!committed) {
        const uncertain = uncertainCommit(error, callbackCompleted);
        try {
          await progress({ stage: kind, batch: batchNumber, status: 'failed', attempted: operations.length,
            inserted: uncertain ? null : 0, preserved: uncertain ? null : 0, rolledBack: !uncertain, uncertain });
        } catch { /* Preserve the transaction failure and its in-memory report. */ }
      }
    } finally {
      try { await session.endSession(); }
      catch {
        try { await progress({ stage: kind, batch: batchNumber, status: 'cleanup-failed', code: 'IMPORT_SESSION_CLEANUP_FAILED' }); }
        catch { /* A cleanup journal failure cannot replace the primary failure. */ }
        failure ||= Object.assign(new Error('Import session cleanup failed. Review the committed batch report before resuming.'), { code: 'IMPORT_SESSION_CLEANUP_FAILED' });
      }
    }
    if (failure) throw failure;
    return result;
  };
  try {
  const identities = await resolveCategoryImportIdentities(plan, { Product, ComponentOption, Category });
  if (identities.issues.length) {
    applied.identityIssues = identities.issues;
    throw Object.assign(new Error('Review ambiguous category source identities before importing.'), { code: 'CATEGORY_IMPORT_IDENTITY_AMBIGUOUS' });
  }
  applied.legacyCategoryIdentities = identities.proposals;
  const categoryIds = new Map();
  const pendingCategories = [];
  // Main categories precede children so existing merchant category IDs remain authoritative.
  const orderedCategories = [...plan.categories].sort((left, right) => Number(Boolean(left.parentKey)) - Number(Boolean(right.parentKey)));
  for (const entry of orderedCategories) {
    const parentId = entry.parentKey ? categoryIds.get(entry.parentKey) : null;
    if (entry.parentKey && !parentId) throw new Error(`Missing parent category for ${entry.name}`);
    const filter = { importCategoryKey: entry.key };
    const existing = identities.mapping.get(entry.key);
    if (existing) {
      categoryIds.set(entry.key, existing._id);
      applied.preserved.categories += 1;
      continue;
    }
    const { key, parentKey, sourceMainCategory, ...payload } = entry;
    const insert = await validatedInsert(Category, { ...payload, parentId, importCategoryKey: key });
    categoryIds.set(key, insert._id);
    pendingCategories.push({ filter, insert });
  }

  const entries = [...plan.products.map((record) => ({ record, kind: 'products' })),
    ...plan.components.map((record) => ({ record, kind: 'components' }))];
  const preparedRecords = new Map();
  // Run asynchronous model hooks on the complete incoming plan before the first
  // catalog write, so a schema mismatch cannot leave a partial category import.
  for (const { record, kind } of entries) {
    const { mainCategoryKey, subcategoryKey, ...payload } = record;
    const categoryId = categoryIds.get(mainCategoryKey);
    const subcategoryId = categoryIds.get(subcategoryKey);
    if (!categoryId || !subcategoryId) throw new Error(`Unresolved category for ${record.externalCatalogId}`);
    const Model = kind === 'products' ? Product : ComponentOption;
    preparedRecords.set(record.externalCatalogId, await validatedInsert(Model, { ...payload, categoryId, subcategoryId }));
  }
  // Automatic index/collection creation is disabled on the import connection.
  // Only fully validated plans may perform these explicit database operations.
  for (const Model of models) {
    assertImportConnections(models);
    await Model.createCollection();
    assertImportConnections(models);
    await Model.createIndexes();
  }
  applied.status = 'applying';
  await progress({ stage: 'preflight', status: 'completed' });
  let categoryBatch = 0;
  for (const batch of chunks(pendingCategories, batchSize)) {
    const result = await writeBatch(Category, batch.map(({ filter, insert }) => ({ updateOne: {
      filter, update: { $setOnInsert: insert }, upsert: true, timestamps: false,
    } })), 'categories', ++categoryBatch);
    // Stop if a concurrent writer chose a different parent ID; never attach new
    // products/children to an ID that was not actually inserted.
    if (result.upsertedCount !== batch.length) {
      for (const { filter, insert } of batch) {
        const persisted = await Category.findOne(filter).select('_id').lean();
        if (!persisted || String(persisted._id) !== String(insert._id)) throw new Error('Concurrent category changes detected; retry the validated import without concurrent writers');
      }
    }
  }
  let recordBatch = 0;
  for (const batch of chunks(entries, batchSize)) {
    recordBatch += 1;
    const ids = batch.map(({ record }) => record.externalCatalogId);
    const [existingProducts, existingComponents] = await Promise.all([
      Product.find({ externalCatalogId: { $in: ids } }).select('_id externalCatalogId catalogRole importSource.fingerprint').lean(),
      ComponentOption.find({ externalCatalogId: { $in: ids } }).select('_id externalCatalogId catalogRole importSource.fingerprint').lean(),
    ]);
    const productById = new Map(existingProducts.map((record) => [record.externalCatalogId, record]));
    const componentById = new Map(existingComponents.map((record) => [record.externalCatalogId, record]));
    const operations = { products: [], components: [] };
    for (const { record, kind } of batch) {
      const correct = kind === 'products' ? productById.get(record.externalCatalogId) : componentById.get(record.externalCatalogId);
      const wrong = kind === 'products' ? componentById.get(record.externalCatalogId) : productById.get(record.externalCatalogId);
      if (wrong) {
        applied.classificationConflicts.push({ productId: record.externalCatalogId, expectedCollection: kind,
          existingRole: wrong.catalogRole, incomingRole: record.catalogRole });
        continue;
      }
      if (correct) {
        applied.preserved[kind] += 1;
        if (correct.importSource?.fingerprint !== record.importSource.fingerprint) applied.sourceChanges.push({ productId: record.externalCatalogId,
          collection: kind, existingRole: correct.catalogRole, incomingRole: record.catalogRole,
          previousFingerprint: correct.importSource?.fingerprint || null, incomingFingerprint: record.importSource.fingerprint });
        continue;
      }
      const insert = preparedRecords.get(record.externalCatalogId);
      operations[kind].push({ updateOne: { filter: { externalCatalogId: record.externalCatalogId },
        update: { $setOnInsert: insert }, upsert: true, timestamps: false } });
    }
    for (const [kind, Model] of [['products', Product], ['components', ComponentOption]]) {
      if (!operations[kind].length) continue;
      await writeBatch(Model, operations[kind], kind, recordBatch);
    }
    await progress({ stage: 'catalog', batch: recordBatch, status: 'processed', examined: batch.length });
  }
  applied.status = 'completed';
  applied.finishedAt = new Date().toISOString();
  await progress();
  return applied;
  } catch (error) {
    applied.status = 'failed';
    applied.failureCode = ['CATEGORY_IMPORT_IDENTITY_AMBIGUOUS', 'CATEGORY_HIERARCHY_CHANGED', 'IMPORT_SESSION_CLEANUP_FAILED', 'DATABASE_NAME_REJECTED', 'DATABASE_HOST_REJECTED', 'DATABASE_NOT_CONNECTED'].includes(error.code) ? error.code : 'IMPORT_INTERRUPTED';
    applied.finishedAt = new Date().toISOString();
    error.importReport = structuredClone(applied);
    // A journal-write failure must not hide acknowledged database work.
    try { await progress(); } catch { /* The caller still receives importReport. */ }
    throw error;
  }
}
