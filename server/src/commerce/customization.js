import mongoose from 'mongoose';
import CustomizationTemplate from '../models/CustomizationTemplate.js';
import { ComponentOption } from '../models/ComponentOption.js';

export function configurationError(message, code = 'CUSTOMIZATION_INVALID', status = 400) {
  return Object.assign(new Error(message), { status, code });
}

const objectId = (value) => mongoose.isValidObjectId(value) && /^[a-f0-9]{24}$/i.test(String(value));
const stringId = (value) => String(value?._id ?? value);
const plain = (value) => value?.toObject ? value.toObject() : value;
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const sum = (a, b) => {
  const value = a + b;
  if (!Number.isSafeInteger(value)) throw configurationError('Customization price exceeds supported limits.');
  return value;
};

export function componentAvailable(component, quantity = 1) {
  return Boolean(component && !component.reviewRequired && component.enabledForCustomization && component.configurationApproved && component.priceApproved && integer(component.pricePiastres, 0, 100000000) && component.inventory?.approved && component.inventory?.available && (component.inventory.mode === 'made_to_order' || (component.inventory.mode === 'tracked' && integer(component.inventory.quantity, quantity, Number.MAX_SAFE_INTEGER))));
}

export function customizationFields(template) {
  const fields = (template.fields || []).map((field) => ({ ...plain(field) }));
  if (template.kind === 'laser_engraving') {
    const engraving = template.engraving;
    fields.push({ key: 'engraving_text', label: 'Engraving text', type: (engraving.allowedTextLines || 1) > 1 ? 'textarea' : 'text', required: engraving.textRequired, maxChars: engraving.maxChars, allowedTextLines: engraving.allowedTextLines || 1, maxCharsPerLine: engraving.maxCharsPerLine || engraving.maxChars });
    for (const [property, key, label] of [['materials', 'engraving_material', 'Material'], ['fonts', 'engraving_font', 'Font'], ['placements', 'engraving_placement', 'Placement']]) {
      if (engraving[property]?.length) fields.push({ key, label, type: 'select', required: true, choices: engraving[property].filter((choice) => choice.active).map((choice) => choice.key), options: engraving[property].filter((choice) => choice.active).map((choice) => ({ key: choice.key, label: choice.label })) });
    }
    if (engraving.artworkAllowed) fields.push({ key: 'engraving_artwork', label: 'Engraving artwork', type: 'image', required: engraving.artworkRequired, minFiles: engraving.artworkRequired ? 1 : 0, maxFiles: engraving.artworkMaxFiles, maxBytes: engraving.artworkMaxBytes, acceptedMimeTypes: [...engraving.artworkAcceptedMimeTypes] });
  }
  return fields;
}

function validateFields(definitions, input, requireFields) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 30) throw configurationError('Customization fields must be a field-value object.');
  const supported = new Set(definitions.map((field) => field.key));
  for (const key of Object.keys(input)) if (!supported.has(key)) throw configurationError('An unconfigured customization field was supplied.');
  const normalized = {};
  for (const field of definitions) {
    const value = input[field.key];
    if (field.type === 'image') {
      if (value !== undefined && (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || !objectId(id)) || value.length > field.maxFiles || new Set(value).size !== value.length)) throw configurationError(`Check the selected files for ${field.label}.`);
      // Ownership, verified file formats and counts are enforced by the cart/storage service.
      normalized[field.key] = value ? [...value] : [];
      continue;
    }
    if (value === undefined || value === '') {
      if (requireFields && field.required) throw configurationError(`${field.label} is required.`);
      normalized[field.key] = '';
      continue;
    }
    if (typeof value !== 'string' || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value)) throw configurationError(`Check ${field.label}.`);
    const cleaned = value.trim();
    if (field.required && requireFields && !cleaned) throw configurationError(`${field.label} is required.`);
    if (Array.from(cleaned).length > (field.maxChars || 2000)) throw configurationError(`${field.label} is too long.`);
    if (field.allowedTextLines && (cleaned.split(/\r?\n/u).length > field.allowedTextLines || cleaned.split(/\r?\n/u).some((line) => Array.from(line).length > field.maxCharsPerLine))) throw configurationError(`Check the allowed lines and characters for ${field.label}.`);
    if (field.type === 'select' && !field.options.some((choice) => choice.key === cleaned)) throw configurationError(`Choose an available ${field.label.toLowerCase()}.`);
    normalized[field.key] = cleaned;
  }
  return normalized;
}

export function evaluateCustomization(templateInput, componentsInput, input, { requireFields = true } = {}) {
  const template = plain(templateInput);
  if (!template || template.status !== 'approved' || !template.active) throw configurationError('This customization template is not available.', 'CUSTOMIZATION_UNAVAILABLE', 409);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw configurationError('A customization configuration is required.');
  if (stringId(input.templateId) !== stringId(template._id) || input.version !== template.version) throw configurationError('This template has changed. Reload the available options.', 'CUSTOMIZATION_VERSION_CHANGED', 409);
  if (Object.keys(input).some((key) => !['templateId', 'version', 'selections', 'fields'].includes(key))) throw configurationError('Unsupported customization data.');
  const components = new Map(componentsInput.map((component) => [stringId(component._id), plain(component)]));
  const groups = template.groups || [];
  const groupByKey = new Map(groups.map((group) => [group.key, group]));
  const supplied = input.selections !== undefined;
  if (supplied && (!Array.isArray(input.selections) || input.selections.length > 100)) throw configurationError('Customization selections must be a bounded list.');
  const selected = new Map();
  for (const selection of input.selections || []) {
    if (!selection || Object.keys(selection).some((key) => !['groupKey', 'optionKey', 'quantity'].includes(key))) throw configurationError('Invalid customization selection.');
    const group = groupByKey.get(selection.groupKey);
    const option = group?.options.find((candidate) => candidate.key === selection.optionKey);
    if (!option || !option.active) throw configurationError('An option is unavailable or not configured.');
    if (!integer(selection.quantity, option.minQuantity, option.maxQuantity)) throw configurationError(`Check the quantity for ${option.label}.`);
    const selectionKey = `${group.key}:${option.key}`;
    if (selected.has(selectionKey)) throw configurationError('Each customization option may appear only once.');
    selected.set(selectionKey, selection.quantity);
  }
  let adjustmentPiastres = template.baseAdjustmentPiastres || 0;
  const snapshotSelections = [];
  const inventoryClaims = [];
  for (const group of groups) {
    if (!supplied) for (const option of group.options) if (option.defaultQuantity > 0) selected.set(`${group.key}:${option.key}`, option.defaultQuantity);
    const selections = group.options.filter((option) => (selected.get(`${group.key}:${option.key}`) || 0) > 0);
    if (selections.length < group.minChoices || selections.length > group.maxChoices) throw configurationError(`${group.label} requires between ${group.minChoices} and ${group.maxChoices} choices.`);
    const added = group.options.some((option) => (selected.get(`${group.key}:${option.key}`) || 0) > option.defaultQuantity);
    const removed = group.options.some((option) => (selected.get(`${group.key}:${option.key}`) || 0) < option.defaultQuantity);
    const replacing = added && removed && group.allowedActions.includes('replace');
    if (added && !replacing && !group.allowedActions.includes('add')) throw configurationError(`Adding options to ${group.label} is not allowed.`);
    if (removed && !replacing && !group.allowedActions.includes('remove')) throw configurationError(`Removing options from ${group.label} is not allowed.`);
    for (const option of group.options) {
      const quantity = selected.get(`${group.key}:${option.key}`) || 0;
      const baseline = template.pricingMode === 'delta' ? option.defaultQuantity : 0;
      if (!quantity && !baseline) continue;
      const component = option.componentId ? components.get(stringId(option.componentId)) : null;
      if (option.componentId && (!component || component.reviewRequired || !component.enabledForCustomization || !component.configurationApproved || !component.priceApproved || !integer(component.pricePiastres, 0, 100000000))) throw configurationError('A configured component is awaiting approval.', 'COMPONENT_UNAVAILABLE', 409);
      if (quantity && (!option.active || (component && !componentAvailable(component, quantity)))) throw configurationError(`${option.label} is currently unavailable.`, 'COMPONENT_UNAVAILABLE', 409);
      const optionUnitPiastres = sum(option.priceAdjustmentPiastres || 0, component?.pricePiastres || 0);
      adjustmentPiastres = sum(adjustmentPiastres, optionUnitPiastres * (quantity - baseline));
      if (quantity) {
        snapshotSelections.push({ groupKey: group.key, groupLabel: group.label, optionKey: option.key, label: option.label, componentId: component ? stringId(component._id) : null, componentName: component?.name || null, quantity, unitAdjustmentPiastres: optionUnitPiastres });
        if (component) inventoryClaims.push({ kind: 'component', id: stringId(component._id), variantKey: null, mode: component.inventory.mode, quantityPerUnit: quantity, ...(component.updatedAt ? { expectedUpdatedAt: component.updatedAt } : {}) });
      }
    }
  }
  const fields = customizationFields(template);
  const values = validateFields(fields, input.fields || {}, requireFields);
  let engravingSnapshot = null;
  if (template.kind === 'laser_engraving') {
    const engraving = template.engraving;
    let engravingAdjustment = engraving.baseAdjustmentPiastres || 0;
    const choices = {};
    for (const [property, key] of [['materials', 'engraving_material'], ['fonts', 'engraving_font'], ['placements', 'engraving_placement']]) {
      if (!engraving[property].length) continue;
      const choice = engraving[property].find((candidate) => candidate.key === values[key] && candidate.active);
      if (!choice && values[key]) throw configurationError('Choose an approved engraving option.');
      if (!choice && requireFields) throw configurationError('Select the engraving material, font and placement.');
      if (choice) {
        engravingAdjustment = sum(engravingAdjustment, choice.adjustmentPiastres);
        choices[key] = { key: choice.key, label: choice.label, adjustmentPiastres: choice.adjustmentPiastres };
      }
    }
    adjustmentPiastres = sum(adjustmentPiastres, engravingAdjustment);
    engravingSnapshot = { ...choices, text: values.engraving_text || '', adjustmentPiastres: engravingAdjustment };
  }
  return { adjustmentPiastres, snapshot: { templateId: stringId(template._id), templateKey: template.key, templateName: template.name, kind: template.kind, version: template.version, pricingMode: template.pricingMode, selections: snapshotSelections, fields: values, engraving: engravingSnapshot, adjustmentPiastres }, inventoryClaims, fields };
}

export async function loadCustomizationTemplate(product, { session, context } = {}) {
  if (!(product.customization?.enabled || product.customization?.serviceEntryEligible) || !product.customization.templateId) throw configurationError('Customization is not enabled for this product.', 'CUSTOMIZATION_UNAVAILABLE', 409);
  let query = CustomizationTemplate.findById(product.customization.templateId).lean().maxTimeMS(3000);
  if (session) query = query.session(session);
  const template = context ? context.templates.get(String(product.customization.templateId)) : await query;
  if (!template || template.kind !== product.customization.serviceKind || template.status !== 'approved' || !template.active) throw configurationError('This customization template is not available.', 'CUSTOMIZATION_UNAVAILABLE', 409);
  const ids = [...new Set(template.groups.flatMap((group) => group.options.map((option) => option.componentId ? String(option.componentId) : null)).filter(Boolean))];
  let componentQuery = ComponentOption.find({ _id: { $in: ids } }).select('name pricePiastres priceApproved inventory enabledForCustomization configurationApproved reviewRequired updatedAt').lean().maxTimeMS(3000);
  if (session) componentQuery = componentQuery.session(session);
  return { template, components: context ? ids.map(id => context.components.get(id)).filter(Boolean) : await componentQuery };
}

export async function quoteCustomization(product, input, options = {}) {
  const { template, components } = await loadCustomizationTemplate(product, options);
  return evaluateCustomization(template, components, input, options);
}

export async function resolveArtworkUploadField(product, fieldKey, { templateId, templateVersion } = {}, options = {}) {
  const { template } = await loadCustomizationTemplate(product, options);
  if ((templateId && stringId(templateId) !== stringId(template._id)) || (templateVersion && templateVersion !== template.version)) throw configurationError('Reload the current customization template.', 'CUSTOMIZATION_VERSION_CHANGED', 409);
  const field = customizationFields(template).find((candidate) => candidate.key === fieldKey && candidate.type === 'image');
  if (!field) throw configurationError('This artwork upload is not configured for the product.', 'UPLOAD_FIELD_INVALID');
  return field;
}

export function publicTemplatePresentation(templateInput, componentsInput) {
  const template = plain(templateInput);
  const components = new Map(componentsInput.map((component) => [stringId(component._id), plain(component)]));
  return {
    _id: stringId(template._id), key: template.key, name: template.name, kind: template.kind, version: template.version,
    pricingMode: template.pricingMode, baseAdjustmentPiastres: template.baseAdjustmentPiastres,
    groups: template.groups.map((group) => ({ key: group.key, label: group.label, minChoices: group.minChoices, maxChoices: group.maxChoices, allowedActions: [...group.allowedActions], options: group.options.map((option) => {
      const component = option.componentId ? components.get(stringId(option.componentId)) : null;
      const approved = !component?.reviewRequired && component?.enabledForCustomization && component?.configurationApproved && component?.priceApproved;
      return { key: option.key, label: option.label, componentId: option.componentId ? stringId(option.componentId) : null, active: option.active, available: option.active && (!option.componentId || componentAvailable(component)), priceAdjustmentPiastres: option.priceAdjustmentPiastres, componentPricePiastres: option.componentId ? (approved ? component.pricePiastres : null) : 0, minQuantity: option.minQuantity, maxQuantity: option.maxQuantity, defaultQuantity: option.defaultQuantity };
    }) })),
    fields: customizationFields(template), engraving: template.engraving ? { ...template.engraving } : null
  };
}
