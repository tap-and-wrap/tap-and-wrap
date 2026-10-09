import { Category } from '../models/Category.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { env } from '../config/env.js';

const invalid = (code, message) => Object.assign(new Error(message), { status: 400, code });

/** A per-category write fence makes reference creation and parent changes
 * conflict in MongoDB transactions, without a global catalog lock. */
export async function fenceCategoryRelation(category, { session } = {}) {
  if (!session) throw Object.assign(new Error('A transaction is required for category relationship changes.'), { status: 503, code: 'TRANSACTION_REQUIRED' });
  assertDatabaseWriteAllowed(Category.db, env);
  const result = await Category.updateOne({ _id: category._id, parentId: category.parentId ?? null }, { $inc: { relationshipRevision: 1 } }, { session, timestamps: false });
  if (result.matchedCount !== 1) throw Object.assign(new Error('The category relationship changed. Reload before saving.'), { status: 409, code: 'EDIT_CONFLICT' });
}

export async function validateCatalogCategoryReferences(categoryId, subcategoryId, { session, fence = false } = {}) {
  const main = await Category.findOne({ _id: categoryId, parentId: null }).select('_id parentId').session(session || null).lean().maxTimeMS(3000);
  if (!main) throw invalid('INVALID_CATEGORY', 'Choose an existing main category');
  let child;
  if (subcategoryId) {
    child = await Category.findOne({ _id: subcategoryId, parentId: categoryId }).select('_id parentId').session(session || null).lean().maxTimeMS(3000);
    if (!child) throw invalid('INVALID_SUBCATEGORY', 'Choose a subcategory belonging to the main category');
  }
  if (fence) {
    // Sequential writes on a session; transactions do not support parallel writes.
    for (const category of [main, child].filter(Boolean).sort((a, b) => String(a._id).localeCompare(String(b._id)))) await fenceCategoryRelation(category, { session });
  }
}
