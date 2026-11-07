// Reviewed against the 960 x 1280 local masters. Pixels, before any resizing.
// This selection-only release never changes placement assets or geometry.
export const BOX_PHOTO_RELEASE = 'box-photos-2026-11-07.2';
export const BOX_PHOTO_FRAMES = [
  [1,0,440,960,840,'Retain both open wings and hanging ribbon.'],
  [2,0,555,960,725,'Keep every connected compartment; preserve source side edges.'],
  [3,145,500,700,680,'Center the complete closed heart and decorative ribbon.'],
  [4,190,240,710,1000,'Keep the upright lid and complete heart base.'],
  [5,0,350,960,930,'Keep the clear upright lid, outer base and source ribbon ends.'],
  [6,100,300,820,980,'Preserve clear lid, open base and the strap at the source edge.'],
  [7,160,330,660,900,'Retain the entire round lid and cylinder.'],
  [8,165,100,665,1180,'Tall framing preserves the upright lid and trailing ribbon.'],
  [9,150,330,660,870,'Keep the complete upright circular lid and white cylinder.'],
  [10,180,330,640,870,'Keep the full pink rim, lid and base.'],
  [11,0,390,960,890,'Preserve both tiers, clear lid and source ribbon edges; original already ends through ribbon/lid.'],
  [12,110,330,750,870,'Keep both woven handles and the complete basket base.'],
].map(([number,left,top,width,height,note])=>({componentId:`box-${number}`,source:`boxes/box-${number}.webp`,crop:{left,top,width,height},note}));
