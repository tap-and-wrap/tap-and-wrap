// Pure rules for the owner-bound customization queue. No browser/network APIs.
export const PREPARATION_LIMIT = 12;
export function validPreparation(value) {
  return Boolean(value && ['gift_box_v2', 'engraving_service_v2'].includes(value.kind)
    && typeof value.operationKey === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.operationKey)
    && typeof value.ownerContext === 'string' && /^[a-f0-9]{64}$/.test(value.ownerContext)
    && value.snapshot && typeof value.snapshot === 'object'
    && value.receipts && typeof value.receipts === 'object');
}
export const restoredPreparationStatus = job => job.status === 'failed' && job.definitiveReject ? 'failed'
  : job.payload || job.stage === 'saving' || job.status === 'uncertain'
    ? 'uncertain' : job.status === 'failed' ? 'failed' : 'queued';
export const uncertainCartFailure = (job, error) => Boolean(job?.payload) &&
  (!error?.response || error.response.status >= 500 || error.response.data?.error?.code === 'OPERATION_IN_PROGRESS');
export const canCancelPreparation = job => Boolean(job && job.status !== 'uncertain'
  && (job.status === 'failed' && job.definitiveReject || job.stage !== 'saving' && !job.payload));
export const visiblePreparation = job => {
  const {operationKey, kind, label, status, stage, progress, error, createdAt} = job;
  return {operationKey, kind, label, status, stage, progress, error, createdAt, canCancel:canCancelPreparation(job)};
};

/** Reuse a verified existing cart image only while editing its same-owner line.
 * The connected API independently checks owner, image role, itemKey, expiry,
 * and the immutable cart-line fingerprint before accepting the edit. */
export function reusableEngravingUploadId({assetId, replaceLineId, replaceFingerprint, ownerScope, ownerContext}) {
  return typeof assetId === 'string' && /^[a-f0-9]{24}$/i.test(assetId)
    && typeof replaceLineId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(replaceLineId)
    && typeof replaceFingerprint === 'string' && /^[a-f0-9]{64}$/i.test(replaceFingerprint)
    && typeof ownerScope === 'string' && ownerScope.length === 64 && /^[a-f0-9]{64}$/i.test(ownerScope)
    && ownerScope === ownerContext ? assetId : null;
}
