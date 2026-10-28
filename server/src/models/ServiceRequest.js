import mongoose from 'mongoose';
import { GIFT_BOX_REQUEST_KIND, GIFT_BOX_REQUEST_CONTRACT_VERSION } from '../../../shared/gift-box/request-contract.mjs';
const schema = new mongoose.Schema({
  giftBoxV2Snapshot: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true, validate: { validator: function (value) {
    return value === null || this.service === 'gift_box' && value.kind === GIFT_BOX_REQUEST_KIND && value.contractVersion === GIFT_BOX_REQUEST_CONTRACT_VERSION
      && value.physicalFitReviewRequired === true && value.arrangementApproved === false && value.submissionAllowed === false && value.orderConversionAllowed === false && value.inventoryReserved === false;
  }, message: 'V2 request snapshots must preserve all foundation review and conversion gates.' } },
  templateSnapshot: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
  reference: { type: String, required: true, unique: true, immutable: true },
  owner: { type: String, required: true, immutable: true }, requestKey: { type: String, required: true, immutable: true }, requestHash: { type: String, required: true, immutable: true },
  service: { type: String, enum: ['gift_box', 'laser_engraving'], required: true, immutable: true },
  customer: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true }, details: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  estimate: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true }, components: { type: [mongoose.Schema.Types.Mixed], default: [], immutable: true },
  productSnapshot: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true }, uploadIds: { type: [mongoose.Schema.Types.ObjectId], default: [], immutable: true },
  state: { type: String, enum: ['submitted', 'needs_review', 'quote_prepared', 'quote_shared', 'accepted', 'declined', 'cancelled'], default: 'submitted' },
  followUpDueAt: { type: Date, required: true, immutable: true }, revision: { type: Number, default: 0 },
  quotations: { type: [mongoose.Schema.Types.Mixed], default: [], validate: value => value.length <= 20 },
  history: { type: [mongoose.Schema.Types.Mixed], default: [], validate: value => value.length <= 100 },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  initialContactAt: Date,
  responseState: { type: String, enum: ['requires_action', 'waiting_customer', 'clear'], default: 'requires_action' },
  contactHistory: { type: [mongoose.Schema.Types.Mixed], default: [], validate: value => value.length <= 100 },
}, { timestamps: true, strict: 'throw' });
schema.index({ owner: 1, requestKey: 1 }, { unique: true });
schema.index({ state: 1, createdAt: -1, _id: -1 });
schema.index({ followUpDueAt: 1, state: 1 });
export const ServiceRequest = mongoose.model('ServiceRequest', schema);
