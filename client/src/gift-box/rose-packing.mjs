import { getDraftGeometry } from '../../../shared/gift-box/geometry-drafts.mjs';
import { footprintInRegion } from '../../../shared/gift-box/geometry.mjs';
import { getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import { regionBounds } from './placement-study.mjs';

// Image-derived placement STUDY, not measured capacity or production approval.
// Preserve customer's moved items and search only for a free position for the new rose.
const MIN_ROSE_SEPARATION = 0.87;
const ROW_SPACING = 0.76;
const COLUMN_SPACING = 0.88;
const MAX_SEARCH_POINTS = 15000;
const finite = n => Number.isFinite(n);
const centre = (p, w, h) => [p.x + w / 2, p.y + h / 2];

function collisionWith(item, pos, rose) {
  if (item.placementZone === 'beside' || item.x === null || !finite(item.x) || !finite(item.y)) return false;
  const [x, y] = centre(pos, rose.width, rose.height);
  const [ox, oy] = centre(item, item.width, item.height);
  if (getFixedComponent(item.componentId)?.category === 'flower') {
    const dx = (x - ox) / ((item.width + rose.width) / 2 * MIN_ROSE_SEPARATION);
    const dy = (y - oy) / ((item.height + rose.height) / 2 * MIN_ROSE_SEPARATION);
    return dx * dx + dy * dy < 1;
  }
  // Non-flower items should not be overlapped during automatic placement. They
  // can subsequently be repositioned or layered by the customer in the study.
  const clearance = 0.006;
  return pos.x < item.x + item.width + clearance && pos.x + rose.width + clearance > item.x
    && pos.y < item.y + item.height + clearance && pos.y + rose.height + clearance > item.y;
}

export function findNextRosePosition(boxId, rose, instances = []) {
  const draft = getDraftGeometry(boxId);
  if (!draft?.regions?.length || draft.assetBlocked || !rose || ![rose.width, rose.height].every(n => finite(n) && n > 0)) return null;
  const placed = instances.filter(item => item.x !== null && finite(item.x) && finite(item.y));
  const last = [...placed].reverse().find(item => getFixedComponent(item.componentId)?.category === 'flower' && item.placementZone !== 'beside');
  const bestOrigin = last ? centre(last, last.width, last.height) : null;
  let best = null, bestScore = Infinity, scanned = 0;
  for (const region of draft.regions) {
    const b = regionBounds(region);
    const dx = Math.max(rose.width * COLUMN_SPACING, 0.008);
    const dy = Math.max(rose.height * ROW_SPACING, 0.008);
    const cols = Math.min(200, Math.ceil(b.width / dx) + 3);
    const rows = Math.min(200, Math.ceil(b.height / dy) + 3);
    const centreRegion = [b.x + b.width / 2, b.y + b.height / 2];
    for (let row = 0; row < rows; row++) {
      const y = b.y + row * dy;
      for (let col = 0; col < cols; col++) {
        if (++scanned > MAX_SEARCH_POINTS) break;
        // Stagger alternate rows like a dense natural bouquet, not a square grid.
        const x = b.x + col * dx + (row % 2 ? dx / 2 : 0);
        const pos = { x, y, width: rose.width, height: rose.height };
        if (!footprintInRegion(pos, region) || placed.some(item => collisionWith(item, pos, rose))) continue;
        const c = centre(pos, rose.width, rose.height);
        const distance = bestOrigin ? Math.hypot(c[0] - bestOrigin[0], c[1] - bestOrigin[1])
          : Math.hypot(c[0] - centreRegion[0], c[1] - centreRegion[1]);
        // Initial placement starts near the centre; later flowers grow beside
        // the most recently added rose. Preserve owner-defined compartments.
        const score = distance + (bestOrigin ? Math.hypot(c[0]-centreRegion[0], c[1]-centreRegion[1]) * 0.012 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = { x, y, placementZone: 'inside', regionId: region.id, layerBase: region.layerBase || 20 };
        }
      }
      if (scanned > MAX_SEARCH_POINTS) break;
    }
    if (scanned > MAX_SEARCH_POINTS) break;
  }
  return best;
}
