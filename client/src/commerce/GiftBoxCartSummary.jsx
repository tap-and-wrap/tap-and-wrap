const groups = [['flower', 'Flowers'], ['plush', 'Plush toys'], ['chocolate', 'Chocolates']];

export default function GiftBoxCartSummary({ giftBox }) {
  if (!giftBox || typeof giftBox !== 'object') return <p className="commerce-muted">Saved gift details are unavailable. Remove this item and build it again.</p>;
  const items = Array.isArray(giftBox.items) ? giftBox.items : [];
  const ribbon = giftBox.ribbon;
  const ribbonColor = /^#[a-f0-9]{6}$/i.test(ribbon?.colorHex || '') ? ribbon.colorHex : null;
  const cardSelected = giftBox.giftCard?.selected === true;
  const message = typeof giftBox.giftCard?.message === 'string' ? giftBox.giftCard.message : '';
  return <div className="commerce-gift-summary">
    <dl>
      <div><dt>Box</dt><dd>{giftBox.box?.displayName || 'Saved box details unavailable'}</dd></div>
      {groups.map(([category, label]) => {
        const selected = items.filter(item => item?.category === category && Number.isSafeInteger(item.quantity) && item.quantity > 0);
        return <div key={category}><dt>{label}</dt><dd>{selected.length ? <ul>{selected.map(item => <li key={item.componentId}>{item.displayName || 'Component details unavailable'} × {item.quantity}</li>)}</ul> : 'None selected'}</dd></div>;
      })}
      <div><dt>Ribbon</dt><dd className="commerce-gift-ribbon">{ribbonColor && <span aria-hidden="true" className="commerce-gift-swatch" style={{ backgroundColor: ribbonColor }} />}{ribbon?.displayName || 'Saved ribbon details unavailable'}</dd></div>
      <div><dt>Gift card</dt><dd>{cardSelected ? 'Selected' : 'Not selected'}</dd></div>
    </dl>
    {cardSelected && (message ? <details className="commerce-gift-message"><summary>View gift-card message</summary><p>{message}</p></details> : <p className="commerce-muted">Gift card without a message.</p>)}
    <p className="commerce-muted">Quantities above are for one completed gift box. Gift boxes are excluded from discounts.</p>
  </div>;
}
