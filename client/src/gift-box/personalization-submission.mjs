// Explicit customer-initiated bridge from memory-only Gift Box drafts to the
// current private upload, server quote, and immutable gift cart contracts.
// No File, object URL, original filename, amount, or approval flag enters cart.
import { prepareGiftBoxPersonalizationHandoff } from './personalization-handoff.mjs';
import { uploadGiftBoxPrivatePhotos } from './private-photo-upload.mjs';
import { prepareGiftBoxCommerceConfiguration } from './commerce-payload.mjs';

export function eligibleGiftBoxOptions(options, boxId, kind, engraving = null) {
  if (!Array.isArray(options)) return [];
  return options.filter(option => option?.kind === kind && option.enabled === true && option.available === true
    && Number.isSafeInteger(option.pricePiastres) && option.pricePiastres >= 0
    && Array.isArray(option.boxIds) && option.boxIds.includes(boxId)
    && (kind !== 'engraving_surface' || (option.approvedStyleIds?.includes(engraving?.styleId)
      && option.approvedColorIds?.includes(engraving?.colorId))));
}

// A display-only estimate from approved public options; never sent as an order
// amount. The server independently recalculates after verified private upload.
export function estimateGiftBoxPersonalizationChoices({ boxId, personal, options, printOptionsByPhoto, surfaceOptionsByEngraving }) {
  if (!personal.hasContent || !Array.isArray(options)) return null;
  let total = 0;
  const selected = [
    ...personal.photos.map(photo => [printOptionsByPhoto[photo.id], 'photo_print', null]),
    ...personal.engravings.filter(line => line.text.trim()).map(line => [surfaceOptionsByEngraving[line.id], 'engraving_surface', line]),
  ];
  for (const [optionId, kind, engraving] of selected) {
    if (kind === 'engraving_surface' && !engraving.styleId) return null;
    const option = eligibleGiftBoxOptions(options, boxId, kind, engraving).find(item => item.optionId === optionId);
    if (!option || !Number.isSafeInteger(total + option.pricePiastres)) return null;
    total += option.pricePiastres;
  }
  return total;
}

export function assertGiftBoxPersonalizationPriceUnchanged(quoted, expectedPiastres) {
  if (!Number.isSafeInteger(expectedPiastres) || expectedPiastres < 0
    || !Number.isSafeInteger(quoted?.unitAdjustmentPiastres)
    || quoted.unitAdjustmentPiastres !== expectedPiastres)
    throw new Error('Personalization prices changed. Review the updated options and total before adding this gift.');
  return true;
}

export function giftBoxPersonalDraftSignature(boxId, personal, printOptionsByPhoto, surfaceOptionsByEngraving) {
  return JSON.stringify({ boxId,
    photos: personal.photos.map(photo => [photo.id, photo.fileKey, personal.photoPositions?.[photo.id] || null, printOptionsByPhoto[photo.id] || null]),
    engravings: personal.engravings.map(line => [line.id, line.text, line.styleId, line.colorId, surfaceOptionsByEngraving[line.id] || null]),
  });
}

export function giftBoxConfigurationWithPersonalization(state, { cardId, intent }) {
  const configuration = prepareGiftBoxCommerceConfiguration(state, { cardId });
  // The backend canonicalizes this versioned intent with the main selection.
  return { ...configuration, ...(intent ? { personalizationIntent: intent } : {}) };
}

export async function verifyGiftBoxPersonalDraft({ boxId, personal, ownerKey, options,
  printOptionsByPhoto, surfaceOptionsByEngraving, uploadFile, quote, cache, uploadedIds,
  ownerIsCurrent, draftIsCurrent, onProgress }) {
  if (!personal.hasContent) throw new Error('Choose a photo or enter an engraving before verification.');
  if (typeof ownerIsCurrent !== 'function' || typeof draftIsCurrent !== 'function'
    || !ownerIsCurrent() || !draftIsCurrent()) throw new Error('Your session or Gift Box changed. Review it again.');
  for (const photo of personal.photos) {
    const chosen = printOptionsByPhoto[photo.id];
    if (!eligibleGiftBoxOptions(options, boxId, 'photo_print').some(option => option.optionId === chosen))
      throw new Error('Select an available, priced print option for each photo.');
  }
  for (const line of personal.engravings.filter(item => item.text.trim())) {
    const chosen = surfaceOptionsByEngraving[line.id];
    if (!line.styleId || !eligibleGiftBoxOptions(options, boxId, 'engraving_surface', line).some(option => option.optionId === chosen))
      throw new Error('Choose an approved lettering style, color and surface for each engraving.');
  }
  const uploaded = await uploadGiftBoxPrivatePhotos({ photos: personal.photos, boxId, ownerKey,
    uploadFile, cache, uploadedIds, onProgress });
  if (!ownerIsCurrent() || !draftIsCurrent()) throw new Error('Your session or Gift Box changed during upload. Review it again.');
  const intent = prepareGiftBoxPersonalizationHandoff({ boxId, personal, uploaded, printOptionsByPhoto, surfaceOptionsByEngraving });
  const result = await quote(boxId, intent);
  if (!ownerIsCurrent() || !draftIsCurrent()) throw new Error('Your session or Gift Box changed during pricing. Review it again.');
  if (!result || !Number.isSafeInteger(result.unitAdjustmentPiastres) || result.unitAdjustmentPiastres < 0
    || result.checkoutAuthorized !== false || result.physicallyApproved !== false
    || result.photoPrints?.length !== intent.photoPrints.length || result.engravings?.length !== intent.engravings.length)
    throw new Error('Personalization prices could not be verified. Try again.');
  return { intent, quote: result };
}
