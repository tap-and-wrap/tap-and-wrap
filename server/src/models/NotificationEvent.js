import mongoose from 'mongoose';

export const ORDER_NOTIFICATION_EVENTS = Object.freeze([
  'order_received', 'payment_confirmed', 'payment_rejected', 'order_confirmed',
  'preparing', 'out_for_delivery', 'delivered', 'cancelled',
]);
export const ACCOUNT_NOTIFICATION_EVENTS = Object.freeze(['password_reset', 'password_changed', 'email_verification']);

const notificationEventSchema = new mongoose.Schema({
  eventKey: { type: String, required: true, unique: true, maxlength: 180, immutable: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', immutable: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', immutable: true },
  actionTokenId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccountActionToken', immutable: true },
  // Encrypted queued secret is erased after delivery/terminal failure.
  sealedActionToken: { type: String, maxlength: 200, select: false },
  expiresAt: { type: Date, immutable: true },
  event: { type: String, required: true, enum: [...ORDER_NOTIFICATION_EVENTS, ...ACCOUNT_NOTIFICATION_EVENTS], immutable: true },
  recipient: { type: String, required: true, maxlength: 254, immutable: true, select: false },
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true },
  state: { type: String, enum: ['queued', 'processing', 'failed', 'sent', 'dead', 'uncertain'], default: 'queued' },
  attempts: { type: Number, min: 0, max: 20, default: 0, validate: Number.isSafeInteger },
  nextAttemptAt: { type: Date, default: Date.now, required: true },
  leaseUntil: Date,
  leaseToken: { type: String, select: false },
  dispatchStartedAt: Date,
  lastErrorCode: { type: String, maxlength: 80 },
  providerMessageId: { type: String, maxlength: 180, select: false },
  sentAt: Date,
}, { timestamps: true, strict: 'throw', minimize: false });

notificationEventSchema.index({ state: 1, nextAttemptAt: 1, leaseUntil: 1 });
notificationEventSchema.index({ state: 1, expiresAt: 1, _id: 1 });
notificationEventSchema.index({ state: 1, leaseUntil: 1, attempts: 1 });
notificationEventSchema.index({ orderId: 1, createdAt: -1 });
notificationEventSchema.index({ userId: 1, createdAt: -1 });
notificationEventSchema.index({ state: 1, createdAt: -1, _id: -1 });
notificationEventSchema.index({ createdAt: -1, _id: -1 });
notificationEventSchema.pre('validate', function () {
  if (ORDER_NOTIFICATION_EVENTS.includes(this.event) && !this.orderId) this.invalidate('orderId', 'Order events require an order');
  if (ACCOUNT_NOTIFICATION_EVENTS.includes(this.event) && !this.userId) this.invalidate('userId', 'Account events require an account');
  if (['password_reset', 'email_verification'].includes(this.event)
    && (!this.actionTokenId || !this.expiresAt || (!['sent', 'dead', 'uncertain'].includes(this.state) && !this.sealedActionToken))) {
    this.invalidate('actionTokenId', 'Pending account action events require an expiring encrypted token');
  }
});

export const NotificationEvent = mongoose.models.NotificationEvent || mongoose.model('NotificationEvent', notificationEventSchema);
