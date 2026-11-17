// Dedicated, resumable preparation for the two approved custom products.
// Files live exclusively in owner-scoped IndexedDB until the existing private
// upload service returns opaque, verified IDs. No client amount is an authority.
import { mapUploads } from './upload-batch.mjs';
import { validPreparation, reusableEngravingUploadId } from './background-cart-contract.mjs';
import { commerceGet, commercePost, uploadPrivateFile } from './api.js';
import { getGiftBoxPersonalizationOptions, getGiftBoxPersonalizationQuote } from '../gift-box/api.js';
import { estimateGiftBoxPersonalizationChoices, assertGiftBoxPersonalizationPriceUnchanged,
  giftBoxConfigurationWithPersonalization, verifyGiftBoxPersonalDraft } from '../gift-box/personalization-submission.mjs';
import { visualResources, visualSpecification } from '../engraving/visual/specification.mjs';

const HEX_ID = /^[0-9a-f]{24}$/i;
const fail = message => { throw new Error(message); };

// Restored photo entries are plain structured clones, not React preview state.
function giftPersonal(snapshot) {
  const { arrangement, personal: original, photoAspectRatios } = snapshot;
  const excluded = new Set(arrangement.hiddenPhotoIds || []);
  const photos = (original.photos || []).filter(photo => !excluded.has(photo.id)).map(photo => ({
    ...photo, fileKey: `${photo.name}\0${photo.file?.size}\0${photo.lastModified || 0}`,
    dimensionsPending: !(Number.isFinite(photo.aspectRatio) && photo.aspectRatio > 0),
  }));
  if (photos.some(photo => !(photo.file instanceof Blob) || photo.file.size > 8388608)) fail('A saved private photo is missing or invalid. Open the Gift Box editor and choose it again.');
  const personal = {
    photos, sticker: original.sticker, engravings: original.engravings || [],
    photoPositions: arrangement.photoPositions || {},
    freePlacement: true, photoAspectRatios: photoAspectRatios === true,
    presentationVersion: arrangement.presentationVersion,
  };
  personal.hasContent = photos.length > 0 || Boolean(personal.sticker?.enabled);
  return personal;
}

export async function prepareBackgroundCartItem(task, {signal, generation, isCurrent, onProgress, saveReceipt, savePayload}) {
  if (!validPreparation(task)) fail('This private cart preparation is not recoverable. Cancel it and build the item again.');
  const assertCurrent = () => { if (signal.aborted || !isCurrent()) fail('This shopping session changed. Your pending files were not added.'); };
  assertCurrent();
  // An issued operation can exist even after an HTTP timeout. Never upload or
  // POST another payload before checking the immutable server receipt.
  onProgress('Checking the original cart operation…');
  const existing = await commerceGet(`/cart/operations/${task.operationKey}`, undefined, signal);
  assertCurrent();
  if (existing.applied) return { applied: true, alreadyOrdered: existing.alreadyOrdered || null };
  if (task.payload) {
    onProgress('Confirming your saved cart addition…');
    return { result: await commercePost('/cart/items', task.payload, {signal}) };
  }
  const receipts = { ...task.receipts };
  const receipt = async (key, id) => {
    if (!HEX_ID.test(id)) fail('Private image verification was incomplete.');
    receipts[key] = id;
    await saveReceipt(key, id);
  };
  let payload;
  if (task.kind === 'gift_box_v2') {
    const { arrangement, printOptionsByPhoto, surfaceOptionsByEngraving, expectedPersonalPiastres, cardId } = task.snapshot;
    if (!arrangement?.boxId) fail('Select a valid Gift Box before adding it.');
    const personal = giftPersonal(task.snapshot);
    let intent = null;
    if (personal.hasContent) {
      onProgress('Checking available personalization options…');
      const options = (await getGiftBoxPersonalizationOptions(signal)).options;
      assertCurrent();
      const estimate = estimateGiftBoxPersonalizationChoices({ boxId: arrangement.boxId, personal, options,
        printOptionsByPhoto, surfaceOptionsByEngraving });
      if (estimate === null || estimate !== expectedPersonalPiastres) fail('Gift Box personalization availability or prices changed. Review your design before adding it.');
      const cache = new Map();
      for (const photo of personal.photos) if (HEX_ID.test(receipts[photo.id] || '')) cache.set(photo.file, {
        id: receipts[photo.id], boxId: arrangement.boxId, ownerKey: task.ownerContext,
      });
      const result = await verifyGiftBoxPersonalDraft({ boxId: arrangement.boxId, personal, ownerKey: task.ownerContext,
        options, printOptionsByPhoto, surfaceOptionsByEngraving,
        uploadFile: async (file, options, ids) => {
          assertCurrent();
          const id = await uploadPrivateFile(file, { ...options, generation, signal }, ids);
          const photo = personal.photos.find(candidate => candidate.file === file);
          if (!photo) fail('A private file changed while it was uploading.');
          await receipt(photo.id, id);
          return id;
        }, quote: (boxId, input) => getGiftBoxPersonalizationQuote(boxId, input, signal), cache, uploadedIds: [], signal,
        ownerIsCurrent: isCurrent, draftIsCurrent: isCurrent, onProgress });
      assertGiftBoxPersonalizationPriceUnchanged(result.quote, expectedPersonalPiastres);
      intent = result.intent;
    }
    payload = { kind: 'gift_box_v2', operationKey: task.operationKey, quantity: 1,
      configuration: giftBoxConfigurationWithPersonalization(arrangement, {cardId, intent}) };
  } else {
    const { draft, type, reviewFingerprint, reviewedPiastres } = task.snapshot;
    if (!draft?.visual?.design || !type?.typeId || !reviewFingerprint) fail('Your engraving review is incomplete. Return to the studio to review it again.');
    onProgress('Checking the current engraving price…');
    const quoted = await commercePost('/engraving/quote', { specification: visualSpecification(draft, type) }, {signal});
    assertCurrent();
    if (quoted.reviewFingerprint !== reviewFingerprint || quoted.unitPricePiastres !== reviewedPiastres) fail('The engraving price or configuration changed. Review your engraving again before adding it.');
    const uploaded = {};
    await mapUploads(visualResources(draft.visual), async ({assetId, role}) => {
      assertCurrent();
      const blob = draft.visual.assets[assetId]?.blob;
      if (!(blob instanceof Blob) || blob.size < 1 || blob.size > 8388608) fail('An engraving image is missing or invalid. Replace it in the studio.');
      let id = receipts[assetId];
      if (!HEX_ID.test(id || '')) {
        // A saved edit already owns a completed upload. Re-signing unchanged
        // originals duplicates private files and can replace their identity.
        // Only a server-derived 24-hex source from this same-owner cart edit
        // qualifies; all newly picked images still use the upload pipeline.
        id = reusableEngravingUploadId({ assetId, replaceLineId: draft.replaceLineId,
          replaceFingerprint: draft.replaceFingerprint, ownerScope: draft.visual.assets[assetId]?.ownerScope,
          ownerContext: task.ownerContext });
      }
      if (!id) {
        id = await uploadPrivateFile(blob, { purpose: 'engraving_service', ownerContext: task.ownerContext,
          engravingItemKey: draft.itemKey, fieldKey: role, generation, signal });
        await receipt(assetId, id);
      }
      uploaded[assetId] = id;
    }, {signal, onProgress});
    assertCurrent();
    payload = { kind: 'engraving_service_v2', operationKey: task.operationKey, quantity: 1,
      specification: visualSpecification(draft, type, uploaded), reviewFingerprint,
      ...(draft.replaceLineId ? { replaceLineId: draft.replaceLineId, replaceFingerprint: draft.replaceFingerprint } : {}) };
  }
  assertCurrent();
  // Persist the exact request before network write. If the response is lost,
  // retrying must reuse this payload/key (never generate fresh identities).
  await savePayload(payload);
  assertCurrent();
  onProgress('Saving the verified item in your cart…');
  return { result: await commercePost('/cart/items', payload, {signal}) };
}
