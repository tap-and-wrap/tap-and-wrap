import mongoose from 'mongoose';
import { GIFT_BOX_OPTION_KINDS, giftBoxOptionIsOrderPriced } from '../../../shared/gift-box/personalization-option-contract.mjs';
const schema = new mongoose.Schema({
  optionId: { type: String, required: true, immutable: true, match: /^[a-z][a-z0-9-]{0,79}$/ },
  kind: { type: String, required: true, immutable: true, enum: GIFT_BOX_OPTION_KINDS },
  displayName: { type: String, required: true, maxlength: 120 },
  enabled: { type: Boolean, default: false }, available: { type: Boolean, default: false },
  boxIds: { type: [String], default: [] },
  pricePiastres: { type: Number, default: null, validate: value => value === null || Number.isSafeInteger(value) && value >= 0 },
  priceApproval: { type: String, enum: ['pending','paid','complimentary'], default: 'pending' },
  priceApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  priceApprovedAt: { type: Date, default: null },
  approvedStyleIds: { type: [String], default: [] }, approvedColorIds: { type: [String], default: [] },
  fontLicensesConfirmed: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { strict: 'throw', timestamps: true, optimisticConcurrency: true, autoCreate: false, autoIndex: false });
schema.index({ optionId: 1 }, { unique: true });
schema.pre('validate', function() {
  const pending = this.pricePiastres === null && this.priceApproval === 'pending' && !this.priceApprovedBy && !this.priceApprovedAt;
  const priced = this.pricePiastres !== null && (this.pricePiastres === 0 && this.priceApproval === 'complimentary'
    || this.pricePiastres > 0 && this.priceApproval === 'paid') && this.priceApprovedBy && this.priceApprovedAt;
  if (!pending && !priced) this.invalidate('pricePiastres','Unpriced or explicitly approved paid/complimentary price required.');
  // An option can be staged while incomplete. It cannot be enabled for sale prematurely.
  if (this.enabled && this.available && !giftBoxOptionIsOrderPriced(this)) this.invalidate('enabled','Approved price, box applicability and licensed engraving options required.');
});
export const GiftBoxPersonalizationOption = mongoose.models.GiftBoxPersonalizationOption
  || mongoose.model('GiftBoxPersonalizationOption',schema);
