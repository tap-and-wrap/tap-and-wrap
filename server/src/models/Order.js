import { env } from '../config/env.js';
import mongoose from 'mongoose';
import { validOrderLineKinds } from '../gift-box/order-snapshot.js';
const schema = new mongoose.Schema({
  cartAddOperations: { type: [mongoose.Schema.Types.Mixed], default: [], immutable: true },
  paymentGroups: { type: [mongoose.Schema.Types.Mixed], default: undefined, immutable: true },
  merchandiseFulfillment: { type: String, enum: ['received', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned', 'cancelled'] },
  engraving: { type: mongoose.Schema.Types.Mixed, default: null },
  orderNumber: { type: String, required: true, unique: true, match: /^[1-9][0-9]{5}$/ },
  owner: { type: String, required: true }, userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  checkoutKey: { type: String, required: true }, requestHash: { type: String, required: true },
  customer: { type: mongoose.Schema.Types.Mixed, required: true },
  trackingConsentId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrackingConsent', default: null, immutable: true },
  lines: { type: [mongoose.Schema.Types.Mixed], required: true, immutable: true,
    validate: { validator: validOrderLineKinds, message: 'Use a supported order line kind and complete immutable gift snapshot.' } },
  totals: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  inventoryClaims: { type: [mongoose.Schema.Types.Mixed], default: [], immutable: true },
  paymentMethod: { type: String, enum: ['cod', 'instapay'], required: true, immutable: true },
  paymentState: { type: String, enum: ['unpaid', 'awaiting_transfer', 'awaiting_verification', 'partially_paid', 'paid', 'rejected', 'refunded'], required: true },
  fulfillmentState: { type: String, enum: ['received', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned', 'cancelled'], default: 'received' },
  orderChannel: { type: String, enum: ['website', 'owner_quotation'], default: 'website', immutable: true },
  serviceRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceRequest', immutable: true },
  acceptedQuotation: { type: mongoose.Schema.Types.Mixed, immutable: true },
  personalized: { type: Boolean, default: false, immutable: true },
  allowedPaymentMethods: { type: [String], enum: ['cod', 'instapay'], default() { return this.orderChannel === 'owner_quotation' || this.personalized ? ['instapay'] : ['cod', 'instapay']; }, immutable: true },
  quotationAcceptedAt: { type: Date, immutable: true },
  codAuthorizedAt: { type: Date, immutable: true },
  accountingVersion: { type: Number, immutable: true },
  financialSummary: mongoose.Schema.Types.Mixed,
  charges: { type: [mongoose.Schema.Types.Mixed], default: [] },
  proofReviewRequired: { type: Boolean, default: false },
  proofHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
  cancellationRequestedAt: Date,
  followUpDueAt: Date,
  initialContactAt: Date,
  lastQuotationSharedAt: Date,
  responseState: { type: String, enum: ['requires_action', 'waiting_customer', 'clear'], default: 'requires_action' },
  contactHistory: { type: [mongoose.Schema.Types.Mixed], default: [], validate: value => value.length <= 100 },
  paymentProofId: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload', default: null },
  uploadIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  history: { type: [mongoose.Schema.Types.Mixed], default: [] },
  restockedAt: { type: Date, default: null }, revision: { type: Number, default: 0 },
}, { timestamps: true, strict: 'throw', optimisticConcurrency: true });
schema.pre('validate', function () {
  if (this.accountingVersion === 2) {
    const groups = this.paymentGroups || [];
    if (!groups.length || groups.length > 2 || new Set(groups.map(group => group.id)).size !== groups.length
      || groups.some(group => !['merchandise','engraving'].includes(group.id) || !['cod','instapay'].includes(group.method) || !Number.isSafeInteger(group.amountPiastres) || group.amountPiastres < 0)
      || groups.reduce((sum, group) => sum + group.amountPiastres, 0) !== this.totals?.totalPiastres
      || !this.allowedPaymentMethods.includes(this.paymentMethod)) this.invalidate('paymentGroups', 'Payment obligations must exactly allocate the immutable order total');
    const engravingAmount = this.lines.filter(line => line.kind === 'engraving_service_v1').reduce((sum, line) => sum + line.lineTotalPiastres, 0);
    if ((groups.find(group => group.id === 'engraving')?.amountPiastres || 0) !== engravingAmount) this.invalidate('paymentGroups', 'Engraving must retain its exact approved service amount');
    return;
  }
  if (this.accountingVersion !== 1) return;
  if (!this.allowedPaymentMethods.includes(this.paymentMethod)) this.invalidate('paymentMethod', 'Use an accepted available payment method');
  if (this.orderChannel === 'owner_quotation') {
    if (!this.quotationAcceptedAt) this.invalidate('quotationAcceptedAt', 'Custom quotations must be accepted before creating a payable order');
    if (this.allowedPaymentMethods.includes('cod') && (!this.codAuthorizedAt || this.codAuthorizedAt > this.quotationAcceptedAt)) this.invalidate('codAuthorizedAt', 'Custom COD requires explicit authorization before acceptance');
  }
});
schema.index({ owner: 1, checkoutKey: 1 }, { unique: true });
if (env.engravingConfigurationEnabled) schema.index({ owner: 1, 'cartAddOperations.key': 1 });
schema.index({ createdAt: -1, _id: -1 });
schema.index({ userId: 1, createdAt: -1, _id: -1 });
schema.index({ fulfillmentState: 1, createdAt: -1, _id: -1 });
schema.index({ paymentState: 1, createdAt: -1, _id: -1 });
export const Order = mongoose.model('Order', schema);
