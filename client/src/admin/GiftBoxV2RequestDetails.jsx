import { useState } from 'react';
import { ASSET_VERSION, CATALOG_VERSION } from '../../../shared/gift-box/definitions.mjs';
import { DRAFT_GEOMETRY_VERSION } from '../../../shared/gift-box/geometry-drafts.mjs';
import { GIFT_BOX_REQUEST_CONTRACT_VERSION, GIFT_BOX_REQUEST_COORDINATE_SYSTEM, GIFT_BOX_REQUEST_KIND, GIFT_BOX_REQUEST_SCENE } from '../../../shared/gift-box/request-contract.mjs';
import { money } from '../commerce/api.js';
import Artwork from '../gift-box/Artwork.jsx';
import { BOX_ARTWORK_DIMENSIONS } from '../gift-box/artwork-dimensions.mjs';
import { localArtwork } from '../gift-box/media.js';
import { studyFootprint } from '../gift-box/placement-study.mjs';

const row = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.isWellFormed();
const amount = value => Number.isSafeInteger(value) && value >= 0;
const coordinate = value => Number.isFinite(value) && value >= 0 && value <= 1;
const units = { box: 'one-box', flower: 'individual-rose', plush: 'one-plush-toy', chocolate: 'complete-pictured-retail-unit', ribbon: 'one-ribbon', gift_card: 'one-gift-card' };
function presentable(snapshot) {
  if (snapshot?.presentationStatus === 'specialist_review_required' || snapshot?.kind !== GIFT_BOX_REQUEST_KIND || snapshot?.contractVersion !== GIFT_BOX_REQUEST_CONTRACT_VERSION || snapshot?.coordinateSystem !== GIFT_BOX_REQUEST_COORDINATE_SYSTEM
    || !row(snapshot.selection) || !text(snapshot.selection.boxId) || !Array.isArray(snapshot.placements)
    || !Array.isArray(snapshot.estimate?.items) || snapshot.estimate.items.length === 0 || snapshot.estimate.currency !== 'EGP' || !amount(snapshot.estimate.componentSubtotalPiastres)
    || !['catalogVersion', 'assetVersion', 'geometryVersion', 'draftGeometryVersion', 'coordinateSystem'].every(key => text(snapshot[key]))) return false;
  if (snapshot.selection.giftCard != null && (!row(snapshot.selection.giftCard) || !text(snapshot.selection.giftCard.componentId) || !text(snapshot.selection.giftCard.message))) return false;
  if (!snapshot.estimate.items.every(item => row(item) && text(item.componentId) && text(item.displayName) && text(item.category) && Object.hasOwn(units, item.category) && item.unit === units[item.category]
    && amount(item.quantity) && item.quantity > 0 && amount(item.unitPricePiastres) && amount(item.lineSubtotalPiastres) && amount(item.settingsRevision)
    && ['paid', 'complimentary'].includes(item.priceApproval) && typeof item.available === 'boolean'
    && (item.category === 'ribbon' ? item.inventoryMode === 'status_only' && item.inventoryQuantity === null
      : item.inventoryMode === 'tracked' && amount(item.inventoryQuantity) || item.inventoryMode === 'made_to_order' && (item.inventoryQuantity === null || amount(item.inventoryQuantity)))
    && (item.category !== 'ribbon' || typeof item.colorHex === 'string' && /^#[\da-f]{6}$/i.test(item.colorHex)))) return false;
  return snapshot.placements.every(item => row(item) && ['instanceId', 'componentId', 'regionId'].every(key => text(item[key]))
    && coordinate(item.x) && coordinate(item.y) && ['inside', 'beside'].includes(item.zone) && amount(item.layer) && item.layer <= 1000);
}

function SavedLayoutPreview({ snapshot }) {
  const [failed, setFailed] = useState(false);
  const boxId = snapshot.selection.boxId, source = localArtwork(boxId, 'placement');
  const available = !failed && source && snapshot.catalogVersion === CATALOG_VERSION && snapshot.assetVersion === ASSET_VERSION && snapshot.draftGeometryVersion === DRAFT_GEOMETRY_VERSION;
  if (!available) return <p>Illustrative preview unavailable for this saved asset and draft version. The saved placements are listed below.</p>;
  const scene = GIFT_BOX_REQUEST_SCENE, dimensions = BOX_ARTWORK_DIMENSIONS[boxId] || [1, 1];
  return <figure className="request-v2-preview"><div className="request-v2-scene" role="img" aria-label="Illustrative saved gift layout; physical fit and scale unreviewed" style={{ aspectRatio: `${dimensions[0] * scene.width} / ${dimensions[1] * scene.height}` }}>
    <img className="request-v2-box" src={source} alt="" onError={() => setFailed(true)} style={{ left: `${-scene.x / scene.width * 100}%`, top: `${-scene.y / scene.height * 100}%`, width: `${100 / scene.width}%`, height: `${100 / scene.height}%` }} />
    {snapshot.placements.map(placement => {
      const footprint = studyFootprint(boxId, placement.componentId);
      return footprint && <span className="request-v2-placement" key={placement.instanceId} style={{ left: `${placement.x * 100}%`, top: `${placement.y * 100}%`, width: `${footprint.width / scene.width * 100}%`, height: `${footprint.height / scene.height * 100}%`, zIndex: placement.layer }}><Artwork componentId={placement.componentId} role="placement" normalize /></span>;
    })}
  </div><figcaption>Illustrative layout from the matching local artwork and draft proportions. Position, scale, clearances and physical fit require owner review.</figcaption></figure>;
}

export default function GiftBoxV2RequestDetails({ snapshot }) {
  if (!presentable(snapshot)) {
    return <section className="admin-panel"><h2>Saved Gift Box V2 request</h2><p>This saved request version requires specialist review. Its pricing and layout details are unavailable. Quotation and order conversion remain unavailable.</p></section>;
  }
  const items = snapshot.estimate?.items || [], names = new Map(items.map(item => [item.componentId, item.displayName]));
  const ribbon = items.find(item => item.category === 'ribbon'), card = snapshot.selection.giftCard;
  return <section className="admin-panel request-v2-details" aria-labelledby="request-v2-title">
    <h2 id="request-v2-title">Saved Gift Box V2 request</h2>
    <p><strong>Physical-fit review required.</strong> This saved component estimate does not approve the arrangement. No stock was reserved. Delivery remains to be confirmed.</p>
    <p>V2 submissions, quotations and order conversion remain unavailable.</p>
    <h3>Saved items and server-calculated prices</h3>
    <p className="request-v2-table-help">Scroll the table to view all saved prices and inventory.</p><div className="admin-table-scroll" role="region" aria-label="Saved item prices and inventory" tabIndex={0}><table className="commerce-admin-table request-v2-items-table"><thead><tr><th>Component</th><th>Quantity / unit</th><th>Unit price</th><th>Subtotal</th><th>Saved availability</th></tr></thead><tbody>{items.map(item => <tr key={item.componentId}>
      <td>{item.displayName}<br /><small>{item.componentId} · setting revision {item.settingsRevision}</small></td>
      <td>{item.quantity} · {item.unit.replaceAll('-', ' ')}</td><td>{money(item.unitPricePiastres)}</td><td>{money(item.lineSubtotalPiastres)}</td>
      <td>{item.available ? 'Available at request time' : 'Unavailable at request time'}<br />{item.inventoryMode === 'tracked' ? `Tracked: ${item.inventoryQuantity} units at request time` : item.inventoryMode === 'made_to_order' ? 'Made to order' : 'Availability only; no numeric stock'}</td>
    </tr>)}</tbody></table></div>
    <p>Component subtotal: <strong>{money(snapshot.estimate.componentSubtotalPiastres)}</strong>. This is a saved estimate; current availability and physical fit need review.</p>
    <h3>Finishing touches</h3>
    {ribbon ? <p>Ribbon: <span className="request-v2-swatch" aria-hidden="true" style={{ backgroundColor: ribbon.colorHex }} /> {ribbon.displayName} ({ribbon.colorHex}) · {money(ribbon.unitPricePiastres)}</p> : <p>No ribbon selected.</p>}
    {card ? <><p>Gift card: {names.get(card.componentId)}. {card.message ? 'Saved message:' : 'Blank message selected.'}</p>{card.message && <p className="request-v2-message">{card.message}</p>}</> : <p>No gift card selected.</p>}
    <h3>Saved layout proposal</h3><SavedLayoutPreview key={`${snapshot.assetVersion}:${snapshot.selection.boxId}:${snapshot.draftGeometryVersion}`} snapshot={snapshot} />
    <p>Coordinates use the normalized illustrative scene. Draft version and region IDs are unverified customer trace labels, with no approved capacity or dimensions.</p>
    <div className="admin-table-scroll" role="region" aria-label="Saved placement details" tabIndex={0}><table className="commerce-admin-table request-v2-placements-table"><thead><tr><th>Individual instance</th><th>Position</th><th>Proposed region</th></tr></thead><tbody>{snapshot.placements.map(item => <tr key={item.instanceId}><td>{names.get(item.componentId)}<br /><small>{item.instanceId}</small></td><td>x {item.x.toFixed(4)}, y {item.y.toFixed(4)}<br />{item.zone} · layer {item.layer}</td><td>{item.regionId}</td></tr>)}</tbody></table></div>
    {snapshot.placements.length === 0 && <p>No additional items were placed.</p>}
    <details><summary>Saved configuration and geometry versions</summary><dl>{[['Request contract', snapshot.contractVersion], ['Configuration', snapshot.catalogVersion], ['Assets', snapshot.assetVersion], ['Authoritative geometry', snapshot.geometryVersion], ['Draft geometry', snapshot.draftGeometryVersion], ['Coordinates', snapshot.coordinateSystem]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p>Authoritative geometry remains unreviewed. Draft geometry provides no production approval.</p></details>
  </section>;
}
