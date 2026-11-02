import { deepFreeze } from './definitions.mjs';

// Photo-traced proposals only. NEVER import these into pricing, submission or
// authoritative geometry approval. Coordinates describe pixels, not centimetres.
export const DRAFT_GEOMETRY_VERSION = 'gift-box-photo-study-2026-10-28.1';
const polygon = (id, points, layerBase = 20) => ({ id, type: 'polygon', points, layerBase });
const ellipse = (id, x, y, width, height, layerBase = 20) => ({ id, type: 'ellipse', x, y, width, height, layerBase });
const front = (id, edge, layer = 150) => ({ id, type: 'polygon', points: [...edge, [1, 1], [0, 1]], rimEdge:edge, layer, purpose: 'Draft foreground wall/rim occlusion intersected with source alpha; edge needs owner review.' });
const heart1 = [[.50,.39],[.57,.325],[.64,.295],[.71,.30],[.78,.34],[.825,.40],[.835,.445],[.80,.49],[.72,.56],[.62,.635],[.50,.725],[.38,.635],[.28,.56],[.20,.49],[.165,.445],[.175,.40],[.22,.34],[.29,.30],[.36,.295],[.43,.325]];
const heart2 = [[.50,.405],[.58,.345],[.65,.325],[.72,.33],[.79,.365],[.84,.42],[.86,.47],[.82,.52],[.74,.59],[.63,.675],[.50,.765],[.37,.675],[.26,.59],[.18,.52],[.14,.47],[.16,.42],[.21,.365],[.28,.33],[.35,.325],[.42,.345]];
const heart4 = [[.50,.485],[.56,.45],[.62,.435],[.68,.45],[.73,.49],[.755,.545],[.75,.59],[.70,.65],[.62,.72],[.49,.805],[.38,.73],[.29,.65],[.235,.59],[.23,.545],[.25,.49],[.30,.45],[.36,.435],[.43,.45]];
const heart5 = [[.50,.515],[.55,.485],[.60,.478],[.65,.50],[.68,.535],[.69,.58],[.675,.625],[.63,.68],[.57,.725],[.50,.768],[.43,.725],[.37,.68],[.325,.625],[.31,.58],[.32,.535],[.35,.50],[.40,.478],[.45,.485]];
const heart6 = [[.50,.55],[.55,.52],[.60,.517],[.64,.54],[.665,.58],[.66,.62],[.62,.66],[.565,.705],[.50,.742],[.435,.705],[.38,.66],[.34,.62],[.335,.58],[.36,.54],[.40,.517],[.45,.52]];

const proposals = [
  { boxId: 'box-1', sourceSize: [1453,1083], regions: [polygon('heart-floor', heart1)],
    foregroundMasks: [front('heart-front-wall', [[.15,.44],[.20,.51],[.30,.60],[.40,.68],[.50,.75],[.60,.68],[.70,.60],[.80,.51],[.85,.44]])],
    notes: ['Cream heart floor traced separately from the tall rear wall.', 'Artwork blocked: right-edge remnants. Overlay evidence is offline inspection only.'], assetBlocked: true },
  { boxId: 'box-2', sourceSize: [1374,1145], regions: [polygon('heart-floor', heart2)],
    foregroundMasks: [front('heart-front-wall', [[.105,.47],[.18,.56],[.29,.65],[.40,.73],[.50,.79],[.60,.73],[.71,.65],[.82,.56],[.895,.47]])],
    notes: ['Red heart floor inset from the visible rim; rear wall is excluded.'] },
  { boxId: 'box-3', sourceSize: [1374,1145], regions: [polygon('heart-floor', heart2.map(([x,y]) => [x,y-.012]))],
    foregroundMasks: [front('heart-front-wall', [[.10,.455],[.18,.55],[.29,.64],[.40,.72],[.50,.78],[.60,.72],[.71,.64],[.82,.55],[.90,.455]])],
    notes: ['Dark heart floor follows its own slightly higher artwork position.'] },
  { boxId: 'box-4', sourceSize: [1600,1600], regions: [polygon('heart-floor', heart4)],
    foregroundMasks: [front('heart-front-wall', [[.205,.55],[.25,.64],[.34,.73],[.49,.825],[.64,.73],[.73,.64],[.785,.55]])],
    notes: ['Only the lower heart well is usable; the raised heart lid above y≈.37 is excluded.'] },
  { boxId: 'box-5', sourceSize: [1600,1600], regions: [polygon('heart-well-floor', heart5)],
    foregroundMasks: [front('heart-well-front', [[.29,.58],[.32,.66],[.40,.73],[.50,.79],[.60,.73],[.68,.66],[.71,.58]])],
    notes: ['Trace the black heart-shaped insert, not the surrounding square shell or raised transparent lid.'] },
  { boxId: 'box-6', sourceSize: [1600,1600], regions: [polygon('heart-well-floor', heart6)],
    foregroundMasks: [front('heart-well-front', [[.30,.58],[.34,.66],[.42,.72],[.50,.76],[.58,.72],[.66,.66],[.70,.58]])],
    notes: ['Cream square shell surrounds a smaller heart well; lid/hinge and square corners are excluded.'] },
  { boxId: 'box-7', sourceSize: [1600,1600], regions: [ellipse('round-floor',.29,.455,.41,.278)],
    foregroundMasks: [front('round-front-wall', [[.265,.59],[.29,.65],[.35,.705],[.425,.74],[.50,.75],[.575,.74],[.65,.705],[.71,.65],[.735,.59]])],
    notes: ['Cream floor is an ellipse in perspective; the raised red circular lid is excluded.'] },
  { boxId: 'box-8', sourceSize: [1600,1600], regions: [ellipse('round-floor',.29,.485,.40,.255)],
    foregroundMasks: [front('round-front-wall', [[.267,.59],[.29,.65],[.35,.71],[.425,.746],[.50,.755],[.575,.746],[.65,.71],[.71,.65],[.733,.59]])],
    notes: ['Black floor inset from the front cylinder rim; raised clear lid is excluded.'] },
  { boxId: 'box-9', sourceSize: [1600,1600], regions: [ellipse('round-floor',.30,.48,.40,.26)],
    foregroundMasks: [front('round-front-wall', [[.278,.59],[.30,.65],[.36,.71],[.43,.745],[.50,.755],[.57,.745],[.64,.71],[.70,.65],[.722,.59]])],
    notes: ['White cylinder has a black floor; white front wall and raised white lid are excluded.'] },
  { boxId: 'box-10', sourceSize: [1600,1600], regions: [ellipse('round-floor',.27,.425,.43,.31)],
    foregroundMasks: [front('round-front-wall', [[.25,.58],[.28,.65],[.34,.71],[.42,.745],[.49,.755],[.57,.745],[.65,.71],[.72,.65],[.745,.58]])],
    notes: ['Pink cylinder floor differs from boxes 7–9; lid above y≈.36 is excluded.'] },
  { boxId: 'box-11', sourceSize: [1600,1600], regions: [ellipse('lower-circular-floor',.205,.53,.38,.145,20), ellipse('raised-circular-floor',.49,.285,.395,.12,220)],
    foregroundMasks: [front('lower-front-wall', [[.19,.61],[.23,.65],[.32,.68],[.41,.695],[.50,.68],[.58,.65],[.62,.62]],150),
      { id: 'raised-container-body', type: 'polygon', points: [[.42,.24],[.45,.15],[.55,.105],[.70,.10],[.85,.14],[.93,.22],[.95,.30],[.92,.50],[.87,.55],[.78,.58],[.68,.59],[.58,.57],[.48,.53],[.43,.47]], layer:190, purpose:'Raised container must occlude items in the lower compartment.' },
      { id: 'raised-front-wall', type:'polygon', points:[[.43,.27],[.46,.34],[.55,.40],[.67,.426],[.80,.41],[.90,.36],[.945,.29],[.92,.50],[.87,.55],[.78,.58],[.68,.59],[.58,.57],[.48,.53],[.43,.47]], layer:350, purpose:'Front rim/wall of the raised compartment overlays its own contents.' }],
    notes: ['Two distinct circular floor projections at different elevations. Never bridge the compartments.', 'Upper front wall obscures part of the lower well; measure hidden floor extent and rotation/hinge limits.'] },
  { boxId: 'box-12', sourceSize: [1600,1600], regions: [ellipse('basket-floor',.335,.395,.35,.30)],
    foregroundMasks: [front('woven-front-wall', [[.13,.43],[.18,.53],[.27,.62],[.38,.68],[.50,.71],[.62,.68],[.73,.62],[.82,.53],[.88,.43]])],
    notes: ['Visible woven base only; sloping woven walls, handles and outer silhouette are excluded.', 'Basket depth, flexible rim deformation and soft-item support need physical review.'] },
];

export const DRAFT_BOX_GEOMETRY = deepFreeze(proposals.map(item => ({
  ...item, version:DRAFT_GEOMETRY_VERSION, reviewStatus:'unreviewed', productionApproved:false,
  coordinateSystem:'normalized-artwork', physicalDimensions:null, capacity:null, approvedItemScales:null,
  // Separate extended scene proposal, not a permitted physical footprint.
  besideRegions:[{id:'beside-plush-proposal',type:'rectangle',x:1.03,y:.40,width:.35,height:.48,layerBase:20}],
  besideCoordinateSystem:'normalized-artwork-extended', requiresSceneExtension:true,
  layeringReviewRequired:true,
})));
export const getDraftGeometry = id => DRAFT_BOX_GEOMETRY.find(item => item.boxId === id) || null;
