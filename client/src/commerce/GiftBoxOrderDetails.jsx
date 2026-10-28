import { money } from './api';

const groups = [['flower', 'Flowers'], ['plush', 'Plush toys'], ['chocolate', 'Chocolates']];
const modeName = { tracked: 'Tracked', made_to_order: 'Made to Order', status_only: 'Status only' };

export default function GiftBoxOrderDetails({ giftBox, admin = false }) {
  if (!giftBox) return <p className="commerce-muted">Saved gift details are unavailable. Contact the store with your order reference.</p>;
  const components = Array.isArray(giftBox.components) ? giftBox.components : [];
  const message = typeof giftBox.giftCard?.message === 'string' ? giftBox.giftCard.message : '';
  const ribbonColor = /^#[a-f0-9]{6}$/i.test(giftBox.ribbon?.colorHex || '') ? giftBox.ribbon.colorHex : null;
  const policy = giftBox.fulfillment?.policyReference;
  const placements = Array.isArray(giftBox.configuration?.placements) ? giftBox.configuration.placements : [];
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
