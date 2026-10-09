import mongoose from 'mongoose';

const adminAuditSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  action: { type: String, required: true, maxlength: 80, immutable: true },
  resourceType: { type: String, required: true, enum: ['order', 'upload', 'configuration', 'review', 'site_content', 'product', 'category'], immutable: true },
  resourceId: { type: String, required: true, maxlength: 100, immutable: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {}, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' });

adminAuditSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
adminAuditSchema.index({ actorId: 1, createdAt: -1 });

export const AdminAudit = mongoose.models.AdminAudit || mongoose.model('AdminAudit', adminAuditSchema);
