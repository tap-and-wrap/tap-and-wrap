import { BOX_PLACEMENT_DEFINITIONS } from '../../../shared/gift-box/geometry.mjs';
import { GIFT_BOX_REQUEST_KIND } from '../../../shared/gift-box/request-contract.mjs';
import { builderError } from './validation.js';

export const isGiftBoxV2Request = record => record?.giftBoxV2Snapshot != null || record?.kind === GIFT_BOX_REQUEST_KIND;

// Deliberately unconditional: neither feature flags nor a test option can open
// HTTP/runtime submissions during this foundation phase.
export function assertGiftBoxV2SubmissionClosed() {
  throw builderError(503, 'GIFT_BOX_V2_SUBMISSION_DISABLED', 'Gift Box V2 requests are not open. Physical-fit and geometry review are still required.');
}
export function assertGiftBoxV2ProductionAcceptance(snapshot) {
  const geometry = BOX_PLACEMENT_DEFINITIONS.find(box => box.boxId === snapshot?.selection?.boxId);
  if (!geometry || geometry.reviewStatus !== 'approved' || snapshot?.physicalFitReviewRequired !== false || snapshot?.arrangementApproved !== true) {
    throw builderError(409, 'GIFT_BOX_GEOMETRY_REVIEW_REQUIRED', 'This layout requires owner review of authoritative geometry and physical fit.');
  }
  assertGiftBoxV2SubmissionClosed();
}
export function assertLegacyRequestAction(record, action) {
  if (isGiftBoxV2Request(record) && ['prepare', 'share', 'accept', 'convert'].includes(action)) {
    throw builderError(409, action === 'convert' ? 'GIFT_BOX_V2_CONVERSION_DISABLED' : 'GIFT_BOX_V2_QUOTATION_DISABLED', 'Gift Box V2 needs a dedicated reviewed quotation contract. Legacy base amounts and component charges cannot be used for this saved estimate.');
  }
}
