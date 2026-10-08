import mongoose from 'mongoose';

const text = (maximum) => ({ type: String, trim: true, maxlength: maximum, default: '' });
const section = new mongoose.Schema({
  title: text(160), body: text(15000), approved: { type: Boolean, default: false }, updatedAt: { type: Date, default: null },
}, { _id: false, strict: 'throw' });
const contact = new mongoose.Schema({
  email: text(254), phone: text(40), whatsapp: text(40), instagram: text(300), address: text(1000), body: text(3000),
  approved: { type: Boolean, default: false }, updatedAt: { type: Date, default: null },
}, { _id: false, strict: 'throw' });
const faqItem = new mongoose.Schema({ question: { ...text(250), required: true }, answer: { ...text(3000), required: true } }, { _id: false, strict: 'throw' });
const schema = new mongoose.Schema({
  key: { type: String, enum: ['website-v1'], default: 'website-v1', unique: true },
  about: { type: section, default: () => ({}) },
  contact: { type: contact, default: () => ({}) },
  privacyPolicy: { type: section, default: () => ({}) },
  refundPolicy: { type: section, default: () => ({}) },
  shippingPolicy: { type: section, default: () => ({}) },
  termsOfService: { type: section, default: () => ({}) },
  faq: { type: [faqItem], default: [], validate: (items) => items.length <= 20 },
  faqApproved: { type: Boolean, default: false },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, strict: 'throw', optimisticConcurrency: true });
schema.pre('validate', function () {
  for (const name of ['about', 'privacyPolicy', 'refundPolicy', 'shippingPolicy', 'termsOfService']) {
    if (this[name]?.approved && (!this[name].title?.trim() || !this[name].body?.trim())) this.invalidate(name, 'Approved content requires a title and body.');
  }
  if (this.contact?.approved && !['email', 'phone', 'whatsapp', 'instagram'].some((key) => this.contact[key]?.trim())) this.invalidate('contact', 'Approved contact information requires an owner-provided contact method.');
});
export const SiteContent = mongoose.models.SiteContent || mongoose.model('SiteContent', schema);

