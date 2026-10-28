import mongoose from 'mongoose';
import { getFixedComponent } from '../../../shared/gift-box/definitions.mjs';

const safe = value => value === null || Number.isSafeInteger(value) && value >= 0;
const schema = new mongoose.Schema({
  componentId: { type: String, required: true, immutable: true, validate: value => Boolean(getFixedComponent(value)) },
  displayName: { type: String, default: null, maxlength: 120 },
  displayOrder: { type: Number, required: true, min: 0, max: 1000000, validate: Number.isSafeInteger },
  pricePiastres: { type: Number, default: null, validate: safe },
  enabled: { type: Boolean, default: false },
  available: { type: Boolean, default: false },
  inventoryMode: { type: String, enum: ['tracked', 'made_to_order', 'status_only', null], default: null },
  inventoryQuantity: { type: Number, default: null, validate: safe },
  // Server-owned approval/audit metadata, never accepted as arbitrary admin fields.
  priceApproval: { type: String, enum: ['pending', 'paid', 'complimentary'], default: 'pending' },
  priceApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  priceApprovedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  initialProvisioningVersion: { type: String, default: null, immutable: true },
  initialProvisionedAt: { type: Date, default: null, immutable: true },
}, { timestamps: true, strict: 'throw', optimisticConcurrency: true, autoCreate: false, autoIndex: false });
schema.index({ componentId: 1 }, { unique: true });
schema.pre('validate', function () {
  const definition = getFixedComponent(this.componentId);
  if (definition?.category === 'ribbon') {
    if (this.inventoryMode !== 'status_only' || this.inventoryQuantity !== null) this.invalidate('inventoryMode', 'Ribbons use availability only, without numeric stock.');
  } else {
    if (this.inventoryMode === 'status_only') this.invalidate('inventoryMode', 'Physical components require tracked or made-to-order inventory.');
    if (this.inventoryMode === 'tracked' && !Number.isSafeInteger(this.inventoryQuantity)) this.invalidate('inventoryQuantity', 'Confirm a nonnegative tracked quantity.');
  }
  const pending = this.pricePiastres === null && this.priceApproval === 'pending' && !this.priceApprovedBy && !this.priceApprovedAt;
  const approved = Number.isSafeInteger(this.pricePiastres) && this.priceApprovedBy && this.priceApprovedAt
    && (this.pricePiastres > 0 && this.priceApproval === 'paid' || this.pricePiastres === 0 && this.priceApproval === 'complimentary');
  if (!pending && !approved) this.invalidate('pricePiastres', 'Use an approved paid/complimentary price or an unpriced pending state.');
});
export const GiftBoxComponentSetting = mongoose.models.GiftBoxComponentSetting || mongoose.model('GiftBoxComponentSetting', schema);
