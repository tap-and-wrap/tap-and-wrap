function revisionError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

export function revisionOf(record) {
  return Number.isSafeInteger(record?.__v) && record.__v >= 0 ? record.__v : 0;
}

export function assertExpectedRevision(record, expectedRevision) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw revisionError(400, 'INVALID_REVISION', 'Load the current record and provide its revision before saving.');
  }
  if (revisionOf(record) !== expectedRevision) {
    throw revisionError(409, 'EDIT_CONFLICT', 'This record changed after you opened it. Your changes were not saved. Review the latest record before trying again.');
  }
}

/** Legacy insert-only imports omitted __v. Initialize it only during an explicitly
 * authorized edit, inside its transaction; never rewrite the catalog at startup. */
export async function prepareAdminRevision(record, expectedRevision, { session } = {}) {
  assertExpectedRevision(record, expectedRevision);
  if (record.isNew) return;
  if (record.__v === undefined) {
    if (!session) throw revisionError(503, 'TRANSACTION_REQUIRED', 'A transaction is required to update this record safely.');
    const result = await record.constructor.updateOne({ _id: record._id, __v: { $exists: false } }, { $set: { __v: 0 } }, { session, timestamps: false });
    if (result.matchedCount !== 1) throw revisionError(409, 'EDIT_CONFLICT', 'This record changed. Reload it before saving.');
    record.__v = 0;
  }
}

export function adminRevision(record) {
  const value = record?.toObject ? record.toObject() : record;
  if (!value) return value;
  const { __v, ...data } = value;
  return { ...data, revision: revisionOf({ __v }) };
}
