// Missing switch preserves existing field-based products. Explicit false disables
// requirements without deleting the merchant's saved field definitions.
export function productPersonalizationFields(personalization) {
  return personalization?.requiredBeforePurchase === false ? [] : personalization?.fields || [];
}

export function productPersonalizationIssues(personalization) {
  if (personalization?.requiredBeforePurchase !== true) return [...photoSpaceIssues(personalization), ...customerPhotoIssues(personalization)];
  const fields = personalization.fields;
  const issues = [...photoSpaceIssues(personalization), ...customerPhotoIssues(personalization)];
  if (!Array.isArray(fields) || !fields.length || fields.length > 20) return ['Configure between one and twenty personalization fields.'];
  if (new Set(fields.map(field => field.key)).size !== fields.length) issues.push('Personalization fields must have unique identities.');
  let minimumImages = 0;
  for (const field of fields) {
    if (!/^[a-z][a-z0-9_-]{0,49}$/.test(field.key || '') || typeof field.label !== 'string' || !field.label.trim() || field.label.length > 160 || !['image', 'short_text', 'long_text', 'select'].includes(field.type)) issues.push('Every personalization field needs a label and supported input type.');
    if (field.type === 'image') {
      const minimum = Math.max(field.minFiles || 0, field.required ? 1 : 0);
      minimumImages += minimum;
      if (!Number.isSafeInteger(field.maxFiles) || field.maxFiles < 1 || field.maxFiles > 10 || !Number.isSafeInteger(minimum) || minimum < 0 || minimum > field.maxFiles) issues.push('Choose valid image counts, up to ten per field.');
      if (field.maxBytes !== undefined && (!Number.isSafeInteger(field.maxBytes) || field.maxBytes < 1 || field.maxBytes > 10 * 1024 * 1024)) issues.push('Choose a supported image size limit.');
      if (field.acceptedMimeTypes && (!field.acceptedMimeTypes.length || field.acceptedMimeTypes.some(type => !['image/jpeg', 'image/png', 'image/webp'].includes(type)))) issues.push('Choose JPEG, PNG or WebP for customer images.');
    } else if (field.type === 'select') {
      if (!Array.isArray(field.choices) || !field.choices.length || field.choices.length > 50 || new Set(field.choices).size !== field.choices.length || field.choices.some(choice => typeof choice !== 'string' || !choice.trim() || choice.length > 160)) issues.push('Choices must be distinct, nonempty labels.');
    } else if (!Number.isSafeInteger(field.maxLength) || field.maxLength < 1 || field.maxLength > 5000) issues.push('Text fields need a character limit between one and 5000.');
  }
  if (minimumImages > 10) issues.push('The required images across all fields cannot exceed ten per item.');
  return issues;
}

// Optional ready-made photo spaces live alongside the historical required fields.
export function photoSpaceIssues(personalization) {
  const spaces = personalization?.photoSpaces;
  if (spaces == null || Array.isArray(spaces) && !spaces.length) return [];
  if (!Array.isArray(spaces) || spaces.length > 10) return ['Use at most ten personal photo spaces.'];
  const keys = new Set((personalization.fields || []).map(field => field.key));
  for (const space of spaces) {
    if (!/^photo_[a-z0-9_]{1,43}$/.test(space?.key || '') || keys.has(space.key) || typeof space.label !== 'string' || !space.label.trim() || space.label.length > 160 || typeof space.instructions !== 'string' || space.instructions.length > 500) return ['Photo spaces need unique identities, labels and supported instructions.'];
    keys.add(space.key);
  }
  const required = productPersonalizationFields(personalization).filter(field => field.type === 'image').reduce((sum, field) => sum + Math.max(field.minFiles || 0, field.required ? 1 : 0), 0);
  return personalization.acceptCustomerPhotos === undefined && required + spaces.length > 10 ? ['All required photos and personal photo spaces must fit within ten images per item.'] : [];
}
export function legacyPhotoFields(personalization) {
  return personalization?.acceptCustomerPhotos === false || photoSpaceIssues(personalization).length ? [] : (personalization?.photoSpaces || []).map(space => ({ key: space.key, label: space.label, instructions: space.instructions, photoSlot: true, type: 'image', required: true, minFiles: 1, maxFiles: 1, maxBytes: 8388608, acceptedMimeTypes: ['image/jpeg','image/png','image/webp'] }));
}

export const CUSTOMER_PHOTOS_KEY = 'customer_photos';
export function customerPhotoIssues(personalization) {
  if (personalization?.acceptCustomerPhotos !== true) return [];
  const fields = productPersonalizationFields(personalization);
  if (fields.some(field => field.key === CUSTOMER_PHOTOS_KEY)) return ['The customer photo collection identity conflicts with an existing required field.'];
  const required = fields.filter(field => field.type === 'image').reduce((sum, field) => sum + Math.max(field.minFiles || 0, field.required ? 1 : 0), 0);
  return required >= 10 ? ['Other required image fields leave no room for customer photos within the ten-image limit.'] : [];
}
export function optionalPhotoFields(personalization) {
  if (personalization?.acceptCustomerPhotos !== true || customerPhotoIssues(personalization).length) return [];
  const minimum = productPersonalizationFields(personalization).filter(field => field.type === 'image').reduce((sum, field) => sum + Math.max(field.minFiles || 0, field.required ? 1 : 0), 0);
  return [{ key: CUSTOMER_PHOTOS_KEY, label: 'Your personal photos', type: 'image', required: true, minFiles: 1, maxFiles: 10 - minimum, maxBytes: 8388608, acceptedMimeTypes: ['image/jpeg','image/png','image/webp'] }];
}
