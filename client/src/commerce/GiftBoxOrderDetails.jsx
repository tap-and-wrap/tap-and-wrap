import { money } from './api';
import { LETTERING_STYLES, ENGRAVING_COLORS } from '../../../shared/gift-box/lettering-styles.mjs';

const groups = [['flower', 'Flowers'], ['plush', 'Plush toys'], ['chocolate', 'Chocolates']];
const modeName = { tracked: 'Tracked', made_to_order: 'Made to Order', status_only: 'Status only' };

export default function GiftBoxOrderDetails({ giftBox, admin = false }) {
  if (!giftBox) return <p className="commerce-muted">Saved gift details are unavailable. Contact the store with your order reference.</p>;
  const components = Array.isArray(giftBox.components) ? giftBox.components : [];
  const message = typeof giftBox.giftCard?.message === 'string' ? giftBox.giftCard.message : '';
  const ribbonColor = /^#[a-f0-9]{6}$/i.test(giftBox.ribbon?.colorHex || '') ? giftBox.ribbon.colorHex : null;
  const policy = giftBox.fulfillment?.policyReference;
  const placements = Array.isArray(giftBox.configuration?.placements) ? giftBox.configuration.placements : [];
  const personalized = giftBox.personalization;
  const engravings = Array.isArray(personalized?.engravings) ? personalized.engravings : [];
  const photos = admin && Array.isArray(personalized?.photoPrints) ? personalized.photoPrints : [];
  return <div className="commerce-gift-summary commerce-gift-order-details">
    <dl>
      <div><dt>Box</dt><dd>{giftBox.box?.displayName || 'Saved box details unavailable'}</dd></div>
      {groups.map(([category, label]) => {
        const items = components.filter(item => item.category === category);
        return <div key={category}><dt>{label}</dt><dd>{items.length ? <ul>{items.map(item => <li key={item.componentId}>{item.displayName} × {item.quantityPerBox}</li>)}</ul> : 'None selected'}</dd></div>;
      })}
      <div><dt>Ribbon</dt><dd className="commerce-gift-ribbon">{ribbonColor && <span aria-hidden="true" className="commerce-gift-swatch" style={{ backgroundColor: ribbonColor }} />}{giftBox.ribbon?.displayName || 'Saved ribbon details unavailable'}</dd></div>
      <div><dt>Gift card</dt><dd>{giftBox.giftCard?.selected ? 'Selected' : 'Not selected'}</dd></div>
    </dl>
    {giftBox.giftCard?.selected && (message ? <details className="commerce-gift-message"><summary>View gift-card message</summary><p>{message}</p></details> : <p className="commerce-muted">Gift card without a message.</p>)}
    {personalized && <details className="commerce-gift-order-disclosure"><summary>Photo prints and engraving at purchase</summary>
      <p>Photo prints: {Number.isSafeInteger(personalized.photoCount) ? personalized.photoCount : photos.length} · Engravings: {engravings.length}</p>
      {Number.isSafeInteger(personalized.unitAdjustmentPiastres) && <p>Saved personalization adjustment per box: {money(personalized.unitAdjustmentPiastres)}</p>}
      {engravings.length > 0 && <ol>{engravings.map((item,index)=><li key={index}>
        <p>Engraving {index+1}: {item.text}</p><p>Style: {LETTERING_STYLES.find(style=>style.id===item.styleId)?.customerLabel || 'Saved style'} · Color: {ENGRAVING_COLORS.find(color=>color.id===item.colorId)?.label || 'Saved color'} · Surface: {item.surfaceOptionId}</p>
        {admin && Number.isSafeInteger(item.pricePiastres) && <p>Saved price: {money(item.pricePiastres)}</p>}
      </li>)}</ol>}
      {admin && photos.length > 0 && <><h4>Private print instructions</h4><p className="commerce-muted">Private image files are available only through the authenticated Private Files viewer on this order. Visual coordinates are drafts, not physical-fit approval.</p><ol>{photos.map((item,index)=><li key={index}>Photo {index+1}: {item.printOptionId} · {item.zone} · x {item.x}, y {item.y}{Number.isSafeInteger(item.pricePiastres) ? ` · ${money(item.pricePiastres)}` : ''}</li>)}</ol></>}
    </details>}
    <details className="commerce-gift-order-disclosure"><summary>Component prices at purchase</summary>
      <p className="commerce-muted">Selections above are per completed gift box. Prices below are saved purchase amounts.</p>
      <ul className="commerce-gift-order-prices">{components.map(item => <li key={item.componentId}>
        <span>{item.displayName}</span><span>{item.quantityPerBox} × {money(item.unitPricePiastres)} = {money(item.perBoxSubtotalPiastres)} per box</span>
        <strong>{item.quantityForLine} units · {money(item.lineSubtotalPiastres)} for this order line</strong>
        {admin && <span>Inventory: {item.inventory?.owner || 'Source unavailable'} · {modeName[item.inventory?.mode] || 'Mode unavailable'} · {item.inventory?.requiredQuantity} required{item.inventory?.mode === 'tracked' ? ` · ${item.inventory.trackedDemand} consumed` : ' · no numeric stock consumed'}</span>}
        {admin && <span>Price approval: {item.priceApproval} · settings revision {item.settingsRevision}{item.priceApprovedAt ? ` · ${item.priceApprovedAt}` : ''}</span>}
      </li>)}</ul>
    </details>
    {admin && <details className="commerce-gift-order-disclosure"><summary>Saved arrangement and fulfillment policy</summary>
      <dl><div><dt>Policy</dt><dd>{policy ? `${policy.policyId} · ${policy.policyVersion}` : 'Historical policy reference unavailable'}</dd></div>
        {policy?.approvedAt && <div><dt>Policy reviewed</dt><dd>{policy.approvedAt}</dd></div>}
        {['catalogVersion', 'assetVersion', 'geometryVersion', 'draftGeometryVersion'].map(key => <div key={key}><dt>{({ catalogVersion: 'Catalog', assetVersion: 'Assets', geometryVersion: 'Geometry reference', draftGeometryVersion: 'Draft reference' })[key]}</dt><dd>{giftBox.configuration?.[key] || 'Unavailable'}</dd></div>)}
      </dl>
      <p className="commerce-muted">Coordinates and regions record the chosen visual arrangement. They do not certify physical fit. Verified artwork is unavailable.</p>
      {placements.length ? <ol className="commerce-gift-order-placements">{placements.map(item => <li key={item.instanceId}>{components.find(component => component.componentId === item.componentId)?.displayName || item.componentId}: {item.zone} · region {item.regionId} · x {item.x}, y {item.y} · layer {item.layer}</li>)}</ol> : <p>No individual item placements.</p>}
    </details>}
  </div>;
}
