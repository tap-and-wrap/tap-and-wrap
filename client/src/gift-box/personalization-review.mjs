import { validateDraftEngraving } from '../../../shared/gift-box/lettering-styles.mjs';
import { photoPrintPosition } from './photo-print-study.mjs';

// Local-only summary. Does not serialize File, object URL, storage references,
// filenames, engraving text, browser prices or private order information.
// Rendering this summary does not upload or authorize any personalization.
export function summarizeGiftBoxPersonalDraft(personal, boxId) {
  const photos = Array.isArray(personal?.photos) ? personal.photos : [];
  const positions = personal?.photoPositions || {};
  let inside = 0, beside = 0, unpositioned = 0;
  photos.forEach((photo, index) => {
    const position = boxId && typeof photo?.id === 'string'
      ? photoPrintPosition(boxId, index, positions[photo.id]) : null;
    if (position?.placementZone === 'inside') inside++;
    else if (position?.placementZone === 'beside') beside++;
    else unpositioned++;
  });
  const engravings = Array.isArray(personal?.engravings) ? personal.engravings : [];
  const written = engravings.filter(entry => validateDraftEngraving(entry?.text) && entry.text.trim());
  const missingStyle = written.filter(entry => !entry.styleId).length;
  return Object.freeze({ photoCount: photos.length, inside, beside, unpositioned,
    engravingCount: written.length, missingStyle, uploaded: false, priced: false, readyToOrder: false });
}
