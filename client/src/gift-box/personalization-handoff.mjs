// Converts verified private upload receipts + explicit server-listed option IDs
// into the already versioned Gift Box intent. No Files, blobs, previews, names,
// prices, claims of fit, or client-selected R2 keys leave this boundary.
import { parseGiftBoxPersonalizationIntent, GIFT_BOX_PERSONALIZATION_INTENT_VERSION } from '../../../shared/gift-box/personalization-intent.mjs';
import { photoPrintFootprint,defaultPhotoPosition } from '../../../shared/gift-box/photo-presentation.mjs';
import { boundFreePlacement } from '../../../shared/gift-box/commerce-contract.mjs';
import { freePresentation,freePlacementZone } from './free-presentation.mjs';
import { photoPrintPosition } from './photo-print-study.mjs';
import { GIFT_BOX_COMMERCE_SCENE } from '../../../shared/gift-box/commerce-contract.mjs';

export function prepareGiftBoxPersonalizationHandoff({ boxId, personal, uploaded, printOptionsByPhoto, surfaceOptionsByEngraving }) {
  if (!personal || !Array.isArray(personal.photos) || !Array.isArray(personal.engravings)
    || !Array.isArray(uploaded) || personal.photos.length !== uploaded.length) {
    throw new Error('Upload every selected photo before continuing.');
  }
  const receipts=new Map();
  for (const item of uploaded) {
    if (!item || typeof item.photoId!=='string' || receipts.has(item.photoId)) throw new Error('The photo upload receipts are incomplete.');
    receipts.set(item.photoId,item.uploadId);
  }
  const photoPrints=personal.photos.map((photo,index) => {
    const uploadId=receipts.get(photo.id), printOptionId=printOptionsByPhoto?.[photo.id];
    const position=personal.freePlacement ? { ...defaultPhotoPosition(index,personal.presentationVersion), ...personal.photoPositions?.[photo.id] } : photoPrintPosition(boxId,index,personal.photoPositions?.[photo.id]);
    if (!uploadId || !printOptionId || !position) throw new Error('Choose a print option and position for every verified photo.');
    // The visual study includes an extended beside-box scene. Convert to the
    // shared normalized-scene coordinates rather than dropping beside photos.
    const x=personal.freePlacement ? position.x : (position.x-GIFT_BOX_COMMERCE_SCENE.x)/GIFT_BOX_COMMERCE_SCENE.width;
    const y=personal.freePlacement ? position.y : (position.y-GIFT_BOX_COMMERCE_SCENE.y)/GIFT_BOX_COMMERCE_SCENE.height;
    if (personal.freePlacement && personal.photoAspectRatios) {
      if (photo.dimensionsPending || !Number.isFinite(photo.aspectRatio)) throw new Error('Wait for your photos to finish opening.');
      const size=photoPrintFootprint(photo.aspectRatio,personal.presentationVersion ? freePresentation(boxId,personal.presentationVersion).aspect : 1,personal.presentationVersion);
      const bounded=boundFreePlacement({x,y},size);
      return {uploadId,printOptionId,...bounded,aspectRatio:photo.aspectRatio,zone:freePlacementZone(boxId,size,bounded,personal.presentationVersion)};
    }
    return { uploadId,printOptionId,zone:position.placementZone,x,y };
  });
  const engravings=(personal.freePlacement ? [] : personal.engravings).filter(line=>line.text?.trim()).map(line => {
    const surfaceOptionId=surfaceOptionsByEngraving?.[line.id];
    if (!surfaceOptionId || !line.styleId) throw new Error('Choose a surface and lettering style for every engraving.');
    return { text:line.text,styleId:line.styleId,colorId:line.colorId,surfaceOptionId };
  });
  return parseGiftBoxPersonalizationIntent({version: personal.freePlacement ? 'gift-box-personalization-intent-v2' : GIFT_BOX_PERSONALIZATION_INTENT_VERSION,photoPrints,engravings, ...(personal.freePlacement ? { sticker: personal.sticker?.enabled ? { text: personal.sticker.text, styleId: personal.sticker.styleId, colorId: personal.sticker.colorId, optionId: personal.sticker.optionId, application: 'exterior-front' } : null } : {})});
}
