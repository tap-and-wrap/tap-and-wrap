import mongoose from 'mongoose';
import { configurationInput } from '../engraving/contracts.js';
const schema = new mongoose.Schema({
  typeId: { type: String, required: true, immutable: true }, version: { type: Number, required: true, immutable: true },
  configuration: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true, validate: value => configurationInput.safeParse(value).success },
  revision: { type: Number, required: true, immutable: true },
  current: { type: Boolean, required: true }, commerceFence: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
}, { strict: 'throw', timestamps: true, optimisticConcurrency: true, autoCreate: false, autoIndex: false });
schema.index({ typeId: 1, version: 1 }, { unique: true });
schema.index({ typeId: 1 }, { unique: true, partialFilterExpression: { current: true } });
export const EngravingServiceConfiguration = mongoose.models.EngravingServiceConfiguration || mongoose.model('EngravingServiceConfiguration', schema);
