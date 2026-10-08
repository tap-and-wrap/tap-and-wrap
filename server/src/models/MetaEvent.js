import mongoose from 'mongoose';

export const META_EVENTS = ['PageView', 'ViewContent', 'Search', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo', 'CompleteRegistration', 'Contact', 'Purchase', 'CustomizationStart', 'CustomizedAddToCart', 'OrderSubmitted'];
const schema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, maxlength: 80, immutable: true },
  dedupKey: { type: String, required: true, unique: true, maxlength: 240, immutable: true },
  consentId: { type: mongoose.Schema.Types.ObjectId, ref: 'TrackingConsent', required: true, immutable: true },
  name: { type: String, required: true, enum: META_EVENTS, immutable: true },
  sourcePath: { type: String, required: true, maxlength: 250, immutable: true },
  parameters: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  state: { type: String, enum: ['queued', 'processing', 'sent', 'failed', 'dead', 'suppressed'], default: 'queued' },
  attempts: { type: Number, default: 0, min: 0, max: 5 },
  nextAttemptAt: { type: Date, default: Date.now }, leaseUntil: Date, leaseToken: { type: String, select: false },
  lastErrorCode: { type: String, maxlength: 60 }, sentAt: Date,
  browserAcknowledgedAt: { type: Date, default: null },
  // Purchase markers remain durable so later order reads/retries cannot recreate them.
  expiresAt: Date,
}, { timestamps: true, strict: 'throw' });
schema.index({ state: 1, nextAttemptAt: 1, leaseUntil: 1 });
schema.index({ consentId: 1, state: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const MetaEvent = mongoose.models.MetaEvent || mongoose.model('MetaEvent', schema);
