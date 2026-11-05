import { useEffect, useRef, useState } from 'react';
import { ASSET_VERSION } from '../../../shared/gift-box/definitions.mjs';
import { stickerStyle } from '../../../shared/gift-box/sticker-styles.mjs';
import { getEngravingColor } from '../../../shared/gift-box/lettering-styles.mjs';
import { sessionSnapshot } from '../auth/session.js';
import { commerceError, getPrivateAdminFile, money } from './api.js';
import FreeArrangementCanvas from '../gift-box/FreeArrangementCanvas.jsx';
import '../gift-box/gift-box.css';
import '../gift-box/sticker-fonts.css';

export default function CustomerGiftDesign({ giftBox, orderId }) {
  const [urls,setUrls] = useState({}), [loading,setLoading] = useState(false), [error,setError] = useState('');
  const resources = useRef(new Set()), mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const owned = resources.current;
    return () => { mounted.current = false; for (const url of owned) URL.revokeObjectURL(url); owned.clear(); };
  }, []);
  const config = giftBox?.configuration;
  const supported = config?.contractVersion === 'gift-box-commerce-v2' && config.selection?.boxId && config.assetVersion === ASSET_VERSION
    && Array.isArray(config.placements) && config.placements.every(item => [item.x,item.y,item.width,item.height].every(Number.isFinite) && item.width > 0 && item.height > 0 && item.x >= 0 && item.y >= 0 && item.x + item.width <= 1.000001 && item.y + item.height <= 1.000001)
    && (!config.selection.ribbonId || config.ribbonPlacement);
  const photos = giftBox?.personalization?.photoPrints || [];
  const photoCoordinatesSupported = !photos.length || giftBox?.personalization?.version === 'gift-box-personalization-intent-v2';
  const sticker = giftBox?.personalization?.sticker;
  async function showPhotos() {
    const generation = sessionSnapshot().generation;
    setLoading(true); setError('');
    try {
      for (const photo of photos) {
        if (urls[photo.uploadId]) continue;
        const result = await getPrivateAdminFile(`/orders/${orderId}/files/${photo.uploadId}`);
        if (!mounted.current || sessionSnapshot().generation !== generation) return;
        const url = URL.createObjectURL(result.blob); resources.current.add(url);
        setUrls(current => ({ ...current, [photo.uploadId]: url }));
      }
    } catch (failure) { if (mounted.current && sessionSnapshot().generation === generation) setError(commerceError(failure)); }
    finally { if (mounted.current && sessionSnapshot().generation === generation) setLoading(false); }
  }
  return <section className="gb-customer-design admin-panel" aria-label="Customer's Gift Design"><h2>Customer&apos;s Gift Design</h2>
    {supported && photoCoordinatesSupported ? <><FreeArrangementCanvas readOnly state={{ freePlacement:true, boxId:config.selection.boxId,
      ribbonId:config.selection.ribbonId, ribbonPosition:config.ribbonPlacement, presentationVersion:config.presentationVersion,
      instances:config.placements.map(item => ({ ...item,id:item.instanceId,placementZone:item.zone })) }}
      components={giftBox.components} personal={{ photos:photos.map(photo => ({ id:photo.uploadId,url:urls[photo.uploadId],aspectRatio:photo.aspectRatio })),
        photoPositions:Object.fromEntries(photos.map(photo => [photo.uploadId,{ x:photo.x,y:photo.y,placementZone:photo.zone }])) }}/>
      <p className="gb-scale-note">Saved customer arrangement - proportions are an assembly reference.</p>
      {photos.length > 0 && <button type="button" className="button button-secondary" disabled={loading || photos.every(photo => urls[photo.uploadId])} onClick={showPhotos}>{loading ? 'Loading private photos...' : 'View private photos in design'}</button>}
      {error && <p role="alert">{error}</p>}
      <ul>{config.placements.map(item => <li key={item.instanceId}>{giftBox.components.find(component => component.componentId === item.componentId)?.displayName || item.componentId} - {item.zone}</li>)}{config.ribbonPlacement && <li>Ribbon - {config.ribbonPlacement.zone}</li>}{photos.map((photo,index) => <li key={photo.uploadId}>Photo {index+1} - {photo.zone} - {money(photo.pricePiastres)}</li>)}</ul>
    </> : <p>This historical order does not contain a complete supported visual design. Use the saved component and placement instructions below.</p>}
    {sticker && <div className="gb-saved-sticker"><h3>Personalized sticker</h3><p>Apply to exterior front</p><p dir="auto" style={{ fontFamily:`"${stickerStyle(sticker.styleId)?.fontFamily}"`, color:getEngravingColor(sticker.colorId).hex, background:getEngravingColor(sticker.colorId).contrast === 'dark' ? '#62483f' : '#fff', fontSize:'2rem',padding:'12px' }}>{sticker.text}</p><p>{stickerStyle(sticker.styleId)?.label || sticker.styleId} - {getEngravingColor(sticker.colorId).label} - {money(sticker.pricePiastres)}</p></div>}
  </section>;
}
