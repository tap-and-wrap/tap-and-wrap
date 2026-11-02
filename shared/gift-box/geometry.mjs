import { deepFreeze, FIXED_COMPONENTS, GEOMETRY_VERSION } from './definitions.mjs';

// Visual shape observations only. Empty regions intentionally prohibit placement.
const observedShapes = ['heart', 'heart', 'heart', 'heart', 'square-shell-heart-interior',
  'square-shell-heart-interior', 'round', 'round', 'round', 'round', 'multiple-round-compartments', 'round-basket'];
export const BOX_PLACEMENT_DEFINITIONS = deepFreeze(FIXED_COMPONENTS.filter(item => item.category === 'box').map((box, index) => ({
  boxId: box.id, version: GEOMETRY_VERSION, reviewStatus: 'unreviewed', observedShape: observedShapes[index],
  coordinateSystem: 'normalized-artwork', regions: [], besideRegions: [], foregroundMasks: [],
  physicalDimensions: null, capacity: null, itemScales: null,
})));

const unit = value => Number.isFinite(value) && value >= 0 && value <= 1;
const point = value => Array.isArray(value) && value.length === 2 && value.every(unit);
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const onSegment = (p, a, b) => Math.abs(cross(a, b, p)) <= 1e-10
  && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0])
  && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
const intersects = (a, b, c, d) => (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0)
  || onSegment(a, c, d) || onSegment(b, c, d) || onSegment(c, a, b) || onSegment(d, a, b);

export function validRegion(region) {
  if (!region || typeof region !== 'object') return false;
  if (region.type === 'rectangle' || region.type === 'ellipse') {
    const { x, y, width, height } = region;
    return [x, y, width, height].every(unit) && width > 0 && height > 0 && x + width <= 1 && y + height <= 1;
  }
  if (region.type !== 'polygon' || !Array.isArray(region.points) || region.points.length < 3 || region.points.length > 128 || !region.points.every(point)) return false;
  const vertices = region.points, length = vertices.length;
  if (new Set(vertices.map(p => p.join(','))).size !== length) return false;
  const area = vertices.reduce((sum, a, i) => { const b = vertices[(i + 1) % length]; return sum + a[0] * b[1] - b[0] * a[1]; }, 0);
  if (Math.abs(area) < 1e-10) return false;
  for (let i = 0; i < length; i++) for (let j = i + 1; j < length; j++) {
    if (j === i + 1 || (i === 0 && j === length - 1)) continue;
    if (intersects(vertices[i], vertices[(i + 1) % length], vertices[j], vertices[(j + 1) % length])) return false;
  }
  return true;
}

export function pointInRegion(position, region) {
  if (!point(position) || !validRegion(region)) return false;
  const [x, y] = position;
  if (region.type === 'rectangle') return x >= region.x && x <= region.x + region.width && y >= region.y && y <= region.y + region.height;
  if (region.type === 'ellipse') return ((x - region.x - region.width / 2) / (region.width / 2)) ** 2
    + ((y - region.y - region.height / 2) / (region.height / 2)) ** 2 <= 1 + 1e-10;
  let inside = false;
  for (let i = 0, j = region.points.length - 1; i < region.points.length; j = i++) {
    const a = region.points[i], b = region.points[j];
    if (onSegment(position, a, b)) return true;
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function footprintInRegion(footprint, region) {
  if (!validRegion(region) || !validRegion({ ...footprint, type: 'rectangle' })) return false;
  const { x, y, width, height } = footprint;
  const corners = [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];
  if (!corners.every(p => pointInRegion(p, region))) return false;
  if (region.type !== 'polygon') return true; // Rectangles and ellipses are convex.
  // A concave boundary can cut through the footprint even with all corners inside.
  // Conservatively reject contact/crossing; touching polygon rims is unnecessary.
  return !corners.some((a, i) => region.points.some((b, j) =>
    intersects(a, corners[(i + 1) % 4], b, region.points[(j + 1) % region.points.length])));
}

export function reviewPlacement(boxId, footprint, { zone = 'inside' } = {}) {
  const definition = BOX_PLACEMENT_DEFINITIONS.find(box => box.boxId === boxId);
  if (!definition) return { allowed: false, code: 'UNKNOWN_BOX' };
  if (definition.reviewStatus !== 'approved') return { allowed: false, code: 'GEOMETRY_REVIEW_REQUIRED' };
  const regions = zone === 'inside' ? definition.regions : zone === 'beside' ? definition.besideRegions : [];
  return { allowed: regions.some(region => footprintInRegion(footprint, region)), code: 'REGION_CHECK' };
}
