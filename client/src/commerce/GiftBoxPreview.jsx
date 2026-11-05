import { ASSET_VERSION, getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import Artwork from '../gift-box/Artwork.jsx';
import FreeArrangementCanvas from '../gift-box/FreeArrangementCanvas.jsx';
import '../gift-box/gift-box.css';

export default function GiftBoxPreview({ giftBox }) {
  const boxId = giftBox?.box?.componentId;
  if (getFixedComponent(boxId)?.category !== 'box') return <span>Your gift box</span>;
  const design = giftBox.artwork?.assetVersion === ASSET_VERSION ? giftBox.design : null;
  const visible = item => [item?.x,item?.y,item?.width,item?.height].every(Number.isFinite)
    && item.width > 0 && item.height > 0 && item.x >= 0 && item.y >= 0 && item.x + item.width <= 1.000001 && item.y + item.height <= 1.000001;
  if (!design || !Array.isArray(design.placements) || !design.placements.every(visible)) return <Artwork componentId={boxId} role="placement" alt={giftBox.box.displayName}/>;
  const photos = (design.photos || []).map((photo,index)=>({id:`photo-${index}`, ...photo}));
  return <FreeArrangementCanvas readOnly components={giftBox.items || []} state={{boxId,
    presentationVersion:design.presentationVersion,ribbonId:giftBox.ribbon?.componentId || null,ribbonPosition:design.ribbonPlacement,
    instances:design.placements.map((item,index)=>({...item,id:`item-${index}`,placementZone:item.zone}))}}
    personal={{photos,photoPositions:Object.fromEntries(photos.map(photo=>[photo.id,{x:photo.x,y:photo.y,placementZone:photo.zone}]))}}/>;
}
