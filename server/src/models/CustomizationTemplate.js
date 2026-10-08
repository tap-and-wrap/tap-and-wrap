import mongoose from 'mongoose';

const integer = (min = 0, max = Number.MAX_SAFE_INTEGER) => ({ type: Number, min, max, validate: Number.isSafeInteger });
const key = { type: String, required: true, trim: true, match: /^[a-z][a-z0-9_-]{0,63}$/ };
const fieldSchema = new mongoose.Schema({
  key,
  label: { type: String, required: true, trim: true, maxlength: 120 },
  type: { type: String, enum: ['text', 'textarea', 'image'], required: true },
  required: { type: Boolean, default: false },
  maxChars: { ...integer(1, 2000), default: 200 },
  minFiles: { ...integer(0, 10), default: 0 },
  maxFiles: { ...integer(1, 10), default: 1 },
  maxBytes: { ...integer(1, 10485760), default: 5242880 },
  acceptedMimeTypes: [{ type: String, enum: ['image/jpeg', 'image/png', 'image/webp'] }]
}, { _id: false, strict: 'throw' });
const optionSchema = new mongoose.Schema({
  key,
  label: { type: String, required: true, trim: true, maxlength: 120 },
  componentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ComponentOption', default: null },
  active: { type: Boolean, default: true },
  priceAdjustmentPiastres: { ...integer(-100000000, 100000000), default: 0 },
  minQuantity: { ...integer(1, 20), default: 1 },
  maxQuantity: { ...integer(1, 20), default: 1 },
  defaultQuantity: { ...integer(0, 20), default: 0 }
}, { _id: false, strict: 'throw' });
const groupSchema = new mongoose.Schema({
  key,
  label: { type: String, required: true, trim: true, maxlength: 120 },
  minChoices: { ...integer(0, 50), default: 0 },
  maxChoices: { ...integer(1, 50), default: 1 },
  allowedActions: { type: [{ type: String, enum: ['add', 'remove', 'replace'] }], default: ['add', 'remove', 'replace'] },
  options: { type: [optionSchema], default: [], validate: (value) => value.length <= 100 }
}, { _id: false, strict: 'throw' });
const pricedChoice = new mongoose.Schema({
  key,
  label: { type: String, required: true, trim: true, maxlength: 120 },
  adjustmentPiastres: { ...integer(0, 100000000), default: 0 },
  active: { type: Boolean, default: true }
}, { _id: false, strict: 'throw' });
const engravingSchema = new mongoose.Schema({
  materials: { type: [pricedChoice], default: [], validate: (value) => value.length <= 30 },
  fonts: { type: [pricedChoice], default: [], validate: (value) => value.length <= 30 },
  placements: { type: [pricedChoice], default: [], validate: (value) => value.length <= 30 },
  maxChars: { ...integer(1, 500), default: 80 },
  allowedTextLines: { ...integer(1, 5), default: 1 },
  maxCharsPerLine: { ...integer(1, 500), default: 80 },
  textRequired: { type: Boolean, default: true },
  baseAdjustmentPiastres: { ...integer(0, 100000000), default: 0 },
  artworkAllowed: { type: Boolean, default: false },
  artworkRequired: { type: Boolean, default: false },
  artworkMaxFiles: { ...integer(1, 5), default: 1 },
  artworkMaxBytes: { ...integer(1, 10485760), default: 5242880 },
  artworkAcceptedMimeTypes: { type: [{ type: String, enum: ['image/jpeg', 'image/png', 'image/webp'] }], default: ['image/jpeg', 'image/png', 'image/webp'] }
}, { _id: false, strict: 'throw' });
const schema = new mongoose.Schema({
  key,
  name: { type: String, required: true, trim: true, maxlength: 160 },
  kind: { type: String, enum: ['gift_box', 'laser_engraving', 'tray', 'generic'], required: true },
  version: { ...integer(1, 1000000), default: 1 },
  status: { type: String, enum: ['draft', 'approved', 'retired'], default: 'draft' },
  active: { type: Boolean, default: false },
  pricingMode: { type: String, enum: ['additive', 'delta'], default: 'additive' },
  baseAdjustmentPiastres: { ...integer(-100000000, 100000000), default: 0 },
  groups: { type: [groupSchema], default: [], validate: (value) => value.length <= 30 },
  fields: { type: [fieldSchema], default: [], validate: (value) => value.length <= 20 },
  engraving: { type: engravingSchema, default: undefined },
  supersedes: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomizationTemplate', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, strict: 'throw', optimisticConcurrency: true });

schema.index({ key: 1, version: 1 }, { unique: true });
schema.index({ kind: 1, status: 1, active: 1, updatedAt: -1 });
schema.index({ updatedAt: -1, _id: -1 });
schema.index({ status: 1, kind: 1, updatedAt: -1, _id: -1 });
schema.index({ name: 'text' }, { name: 'customization_template_search', default_language: 'none' });
schema.pre('validate', function validateConfiguration() {
  const unique = (values, path) => {
    if (new Set(values.map((value) => value.key)).size !== values.length) this.invalidate(path, 'Keys must be unique.');
  };
  unique(this.groups, 'groups');
  unique(this.fields, 'fields');
  if (this.groups.reduce((total, group) => total + group.options.length, 0) > 300 || this.groups.reduce((total, group) => total + group.minChoices, 0) > 100) this.invalidate('groups', 'Templates support at most 300 configured options and 100 required selections.');
  for (const [index, group] of this.groups.entries()) {
    unique(group.options, `groups.${index}.options`);
    if (group.minChoices > group.maxChoices || group.maxChoices > group.options.length) this.invalidate(`groups.${index}`, 'Choice limits must fit available configured options.');
    for (const [optionIndex, option] of group.options.entries()) {
      if (option.minQuantity > option.maxQuantity || (option.defaultQuantity > 0 && (option.defaultQuantity < option.minQuantity || option.defaultQuantity > option.maxQuantity))) this.invalidate(`groups.${index}.options.${optionIndex}`, 'Quantity limits and defaults are inconsistent.');
    }
    const defaults = group.options.filter((option) => option.defaultQuantity > 0).length;
    if (this.pricingMode === 'delta' && (defaults < group.minChoices || defaults > group.maxChoices)) this.invalidate(`groups.${index}.options`, 'Delta templates need a valid original configuration.');
  }
  for (const [index, field] of this.fields.entries()) {
    if (field.minFiles > field.maxFiles || (field.type === 'image' && !field.acceptedMimeTypes.length)) this.invalidate(`fields.${index}`, 'Image limits and accepted formats are required.');
    if (['engraving_text', 'engraving_material', 'engraving_font', 'engraving_placement', 'engraving_artwork'].includes(field.key)) this.invalidate(`fields.${index}.key`, 'This key is reserved for engraving.');
  }
  if (this.kind === 'laser_engraving') {
    if (!this.engraving || !this.engraving.materials.length || !this.engraving.fonts.length) this.invalidate('engraving', 'Explicit engraving materials and approved fonts are required.');
  }
  if (this.engraving) {
    for (const property of ['materials', 'fonts', 'placements']) unique(this.engraving[property], `engraving.${property}`);
    if (this.engraving.artworkRequired && !this.engraving.artworkAllowed) this.invalidate('engraving.artworkRequired', 'Required artwork must be enabled.');
    if (this.engraving.artworkAllowed && !this.engraving.artworkAcceptedMimeTypes.length) this.invalidate('engraving.artworkAcceptedMimeTypes', 'Configure accepted artwork image formats.');
    if (this.kind === 'laser_engraving' && this.status === 'approved' && this.active) {
      for (const property of ['materials', 'fonts', 'placements']) if ((property !== 'placements' || this.engraving.placements.length) && !this.engraving[property].some((choice) => choice.active)) this.invalidate(`engraving.${property}`, 'An active approved engraving choice is required.');
    }
  }
});
schema.post('init', function rememberApprovedVersion() {
  this.$locals.loadedApprovedVersion = this.status !== 'draft';
});
schema.pre('save', function protectApprovedConfiguration() {
  if (this.$locals.loadedApprovedVersion && this.modifiedPaths().some((path) => !['status', 'active', 'updatedAt', '__v'].includes(path))) {
    throw new Error('Approved customization rules are immutable. Create a new revision.');
  }
});
schema.post('save', function rememberSavedApproval() {
  this.$locals.loadedApprovedVersion = this.status !== 'draft';
});

export { fieldSchema as customizationFieldSchema };
export const CustomizationTemplate = mongoose.models.CustomizationTemplate || mongoose.model('CustomizationTemplate', schema);
export default CustomizationTemplate;
