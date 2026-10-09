import { assertConnectedDatabase } from '../config/database-safety.js';
import { sourceCategoryKey } from './import-workbook.js';
import { revisionOf } from '../utils/admin-revision.js';
import mongoose from 'mongoose';

const batches = (rows, size = 100) => Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));
const same = (a, b) => String(a ?? '') === String(b ?? '');
const conflict = () => Object.assign(new Error('Category source identities are ambiguous. Review the identity dry-run; no categories were changed.'), { code: 'CATEGORY_IMPORT_IDENTITY_AMBIGUOUS' });

export function assertIdentityModels({ Product, ComponentOption, Category }) {
  const models = [Product, ComponentOption, Category];
  if (process.env.NODE_ENV === 'production') throw new Error('Category identity operations are disabled in production.');
  if (models.some((Model) => typeof Model !== 'function') || models.some((Model) => Model.db !== models[0].db)) throw new Error('Explicit models on one dedicated staging/test connection are required.');
  for (const Model of models) assertConnectedDatabase(Model.db, { target: 'staging', nodeEnv: process.env.NODE_ENV });
}

/** Resolve immutable source identities without changing any existing record.
 * Legacy IDs can be proven from original catalogSource metadata and stable product
 * IDs, even after merchant names/slugs changed. Names alone are never identity. */
export async function resolveCategoryImportIdentities(plan, models, { session } = {}) {
  assertIdentityModels(models);
  if (!plan?.report || plan.report.fatalErrors?.length || plan.report.invalidRows?.length) throw new Error('A fully validated catalog plan is required.');
  const { Product, ComponentOption, Category } = models;
  const references = new Map();
  const sourceIssues = [];
  const incomingById = new Map([...plan.products, ...plan.components].map(entry => [entry.externalCatalogId, entry]));
  const remember = (key, id) => {
    if (!key || !id) return;
    const ids = references.get(key) || new Set(); ids.add(String(id)); references.set(key, ids);
  };
  const ids = [...new Set([...plan.products, ...plan.components].map((entry) => entry.externalCatalogId))];
  for (const batch of batches(ids)) {
    for (const Model of [Product, ComponentOption]) {
      const records = await Model.find({ externalCatalogId: { $in: batch } }).select('externalCatalogId categoryId subcategoryId catalogSource.mainCategory catalogSource.subcategory').session(session || null).lean().maxTimeMS(3000);
      for (const record of records) {
        if (!record.catalogSource?.mainCategory) continue;
        const mainKey = sourceCategoryKey(record.catalogSource.mainCategory);
        const childKey = record.catalogSource.subcategory ? sourceCategoryKey(record.catalogSource.mainCategory, record.catalogSource.subcategory) : null;
        const incoming = incomingById.get(record.externalCatalogId);
        // A workbook grouping rename/move requires an explicit mapping review.
        // Stable source IDs must not silently create a second category identity.
        if (incoming && (incoming.mainCategoryKey !== mainKey || (incoming.subcategoryKey || null) !== childKey)) {
          sourceIssues.push({ productId: record.externalCatalogId, key: incoming.mainCategoryKey,
            reason: 'Source grouping changed for an existing catalog ID; review an explicit identity mapping' });
        }
        remember(mainKey, record.categoryId);
        if (childKey) remember(childKey, record.subcategoryId);
      }
    }
  }
  const keys = plan.categories.map((entry) => entry.key);
  const referencedIds = [...new Set([...references.values()].flatMap((set) => [...set]))];
  const categories = await Category.find({ $or: [
    { importCategoryKey: { $in: keys } }, { _id: { $in: referencedIds } },
    { slug: { $in: plan.categories.map((entry) => entry.slug) } },
    { nameNormalized: { $in: plan.categories.map((entry) => entry.nameNormalized) } },
  ] }).select('_id name slug parentId __v +nameNormalized +importCategoryKey').session(session || null).lean().maxTimeMS(3000);
  const byId = new Map(categories.map((category) => [String(category._id), category]));
  const mapping = new Map(), proposals = [], issues = [...sourceIssues];
  const used = new Map();
  for (const entry of [...plan.categories].sort((a, b) => Number(Boolean(a.parentKey)) - Number(Boolean(b.parentKey)))) {
    const parentId = entry.parentKey ? mapping.get(entry.parentKey)?._id : null;
    const candidates = categories.filter((category) => category.importCategoryKey === entry.key);
    for (const id of references.get(entry.key) || []) {
      const record = byId.get(id);
      if (!record || (record.importCategoryKey && record.importCategoryKey !== entry.key)) issues.push({ key: entry.key, reason: 'Conflicting or missing source-record category' });
      else if (!candidates.some((category) => same(category._id, id))) candidates.push(record);
    }
    // Original importer slugs include a source-key hash. This fallback is only
    // accepted with the resolved original parent; mutable labels are not matched.
    if (!candidates.length && (!entry.parentKey || parentId)) {
      candidates.push(...categories.filter((category) => category.slug === entry.slug && same(category.parentId, parentId) && (!category.importCategoryKey || category.importCategoryKey === entry.key)));
    }
    if (candidates.length > 1 || (candidates.length && entry.parentKey && !parentId)) {
      issues.push({ key: entry.key, reason: 'Multiple candidates or unresolved original parent' }); continue;
    }
    const category = candidates[0];
    if (category) {
      if (!same(category.parentId, parentId) || (used.has(String(category._id)) && used.get(String(category._id)) !== entry.key)) {
        issues.push({ key: entry.key, reason: 'Source identity does not match preserved hierarchy' }); continue;
      }
      used.set(String(category._id), entry.key); mapping.set(entry.key, category);
      if (!category.importCategoryKey) proposals.push({ categoryId: String(category._id), importCategoryKey: entry.key, expectedRevision: revisionOf(category), expectedParentId: category.parentId ? String(category.parentId) : null,
        expectedName: category.name, expectedSlug: category.slug, evidence: references.get(entry.key)?.has(String(category._id)) ? 'source-records' : 'original-source-slug' });
    } else if (categories.some((record) => record.slug === entry.slug || (record.nameNormalized === entry.nameNormalized && same(record.parentId, parentId)))) {
      issues.push({ key: entry.key, reason: 'Unproven category collision requires manual mapping' });
    }
  }
  return { mapping, proposals, issues };
}

export async function planCategoryIdentityMigration(plan, models) {
  const { proposals, issues } = await resolveCategoryImportIdentities(plan, models);
  return { mode: 'identity-dry-run', workbookSha256: plan.report.workbookSha256, proposals, issues, writes: 0 };
}

/** Explicit metadata-only migration. No connection is opened here. A fresh
 * reviewed dry-run must still match every original ID, revision and merchant field. */
export async function applyCategoryIdentityMigration(plan, reviewed, models, { confirm = false } = {}) {
  assertIdentityModels(models);
  if (!confirm || reviewed?.mode !== 'identity-dry-run' || reviewed.issues?.length || reviewed.workbookSha256 !== plan.report.workbookSha256) throw new Error('An explicitly confirmed, error-free identity dry-run for this workbook is required.');
  const { Category } = models;
  return Category.db.transaction(async (session) => {
    const fresh = await resolveCategoryImportIdentities(plan, models, { session });
    if (fresh.issues.length) throw conflict();
    const pending = reviewed.proposals.filter((proposal) => {
      const mapped = fresh.mapping.get(proposal.importCategoryKey);
      if (mapped?.importCategoryKey === proposal.importCategoryKey && same(mapped._id, proposal.categoryId)) return false;
      return true;
    });
    if (JSON.stringify(fresh.proposals) !== JSON.stringify(pending)) throw conflict();
    let updated = 0;
    for (const proposal of fresh.proposals) {
      assertIdentityModels(models);
      const current = await Category.findById(proposal.categoryId).select('__v').session(session).lean();
      const version = current?.__v === undefined ? { __v: { $exists: false } } : { __v: proposal.expectedRevision };
      // Bypass immutable-path stripping solely for this explicit identity migration.
      // All mutable merchant fields/timestamps remain byte-for-byte untouched.
      const result = await Category.collection.updateOne({ _id: new mongoose.Types.ObjectId(proposal.categoryId), ...version,
        importCategoryKey: { $exists: false }, parentId: proposal.expectedParentId ? new mongoose.Types.ObjectId(proposal.expectedParentId) : null,
        name: proposal.expectedName, slug: proposal.expectedSlug }, { $set: { importCategoryKey: proposal.importCategoryKey }, $inc: { __v: 1 } }, { session });
      if (result.matchedCount !== 1) throw conflict();
      updated += 1;
    }
    return { mode: 'identity-apply', updated, preserved: reviewed.proposals.length - updated, merchantFieldsChanged: false };
  });
}
