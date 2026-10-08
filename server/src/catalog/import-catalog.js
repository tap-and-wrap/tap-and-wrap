import { assertConnectedDatabase } from '../config/database-safety.js';

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
  return document.toObject({ depopulate: true, minimize: false, versionKey: false });
}

/** Validate every schema and relationship offline, without opening a connection. */
export async function validateCatalogModels(plan, { Product, ComponentOption, Category } = {}) {
  requireValidPlan(plan);
  const categoryIds = new Map();
  const ordered = [...plan.categories].sort((left, right) => Number(Boolean(left.parentKey)) - Number(Boolean(right.parentKey)));
  for (const { key, parentKey, sourceMainCategory, ...payload } of ordered) {
    const parentId = parentKey ? categoryIds.get(parentKey) : null;
    if (parentKey && !parentId) throw new Error('Catalog schema preflight found an unresolved parent category');
    const insert = await validatedInsert(Category, { ...payload, parentId });
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

/**
 * Applies an already audited plan to explicitly supplied staging/test models.
 * This module never opens a connection and never reads application credentials.
 * All writes are inserts; matched records, including timestamps, are untouched.
 */
export async function applyCatalogPlan(plan, { Product, ComponentOption, Category, batchSize = 50 } = {}) {
  requireValidPlan(plan);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error('Batch size must be an integer from 1 to 100');
  if (![Product, ComponentOption, Category].every((Model) => typeof Model === 'function')) throw new Error('Explicit staging/test models are required');
  const models = [Product, ComponentOption, Category];
  assertImportConnections(models);
  const applied = { mode: 'apply', target: 'staging', inserted: { products: 0, components: 0, categories: 0 },
    preserved: { products: 0, components: 0, categories: 0 }, sourceChanges: [], classificationConflicts: [], batchSize };
  const categoryIds = new Map();
  const pendingCategories = [];
  // Main categories precede children so existing merchant category IDs remain authoritative.
  const orderedCategories = [...plan.categories].sort((left, right) => Number(Boolean(left.parentKey)) - Number(Boolean(right.parentKey)));
  for (const entry of orderedCategories) {
    const parentId = entry.parentKey ? categoryIds.get(entry.parentKey) : null;
    if (entry.parentKey && !parentId) throw new Error(`Missing parent category for ${entry.name}`);
    const filter = { parentId, nameNormalized: entry.nameNormalized };
    const existing = await Category.findOne(filter).select('_id').lean();
    if (existing) {
      categoryIds.set(entry.key, existing._id);
      applied.preserved.categories += 1;
      continue;
    }
    const { key, parentKey, sourceMainCategory, ...payload } = entry;
    const insert = await validatedInsert(Category, { ...payload, parentId });
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
  for (const batch of chunks(pendingCategories, batchSize)) {
    assertImportConnections(models);
    const result = await Category.bulkWrite(batch.map(({ filter, insert }) => ({ updateOne: {
      filter, update: { $setOnInsert: insert }, upsert: true, timestamps: false,
    } })), { ordered: true, timestamps: false });
    applied.inserted.categories += result.upsertedCount;
    applied.preserved.categories += batch.length - result.upsertedCount;
    // Stop if a concurrent writer chose a different parent ID; never attach new
    // products/children to an ID that was not actually inserted.
    if (result.upsertedCount !== batch.length) {
      for (const { filter, insert } of batch) {
        const persisted = await Category.findOne(filter).select('_id').lean();
        if (!persisted || String(persisted._id) !== String(insert._id)) throw new Error('Concurrent category changes detected; retry the validated import without concurrent writers');
      }
    }
  }
  for (const batch of chunks(entries, batchSize)) {
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
      assertImportConnections(models);
      const result = await Model.bulkWrite(operations[kind], { ordered: true, timestamps: false });
      applied.inserted[kind] += result.upsertedCount;
      applied.preserved[kind] += operations[kind].length - result.upsertedCount;
    }
  }
  return applied;
}
