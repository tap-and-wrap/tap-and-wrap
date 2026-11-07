import { customerGiftComponentName } from '../../../shared/gift-box/customer-label.mjs';
import { money } from './api.js';
import { stickerStyle } from '../../../shared/gift-box/sticker-styles.mjs';
import { ENGRAVING_COLORS, LETTERING_STYLES } from '../../../shared/gift-box/lettering-styles.mjs';
const groups = [['flower', 'Flowers'], ['plush', 'Soft Toys'], ['chocolate', 'Chocolates']];

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
        return <div key={category}><dt>{label}</dt><dd>{selected.length ? <ul>{selected.map(item => <li key={item.componentId}>{customerGiftComponentName(item) || 'Component details unavailable'} × {item.quantity}</li>)}</ul> : 'None selected'}</dd></div>;
      })}
      <div><dt>Ribbon</dt><dd className="commerce-gift-ribbon">{ribbonColor && <span aria-hidden="true" className="commerce-gift-swatch" style={{ backgroundColor: ribbonColor }} />}{ribbon ? (ribbon.displayName || 'Saved ribbon details unavailable') : 'No ribbon selected'}</dd></div>
      <div><dt>Gift card</dt><dd>{cardSelected ? 'Selected' : 'Not selected'}</dd></div>
    </dl>
    {cardSelected && <p className="commerce-gift-message" dir="auto">{message || 'Gift card without a message.'}</p>}
    {giftBox.personalization?.photoCount > 0 && <p>Photo prints: {giftBox.personalization.photoCount}</p>}
    {giftBox.personalization && <p>Personal touches per box: {money(giftBox.personalization.unitAdjustmentPiastres)}</p>}
    {giftBox.personalization?.sticker && <p>Personalized sticker: <bdi>{giftBox.personalization.sticker.text}</bdi> · {stickerStyle(giftBox.personalization.sticker.styleId)?.label || 'Saved font'} · {ENGRAVING_COLORS.find(color=>color.id===giftBox.personalization.sticker.colorId)?.label || 'Saved color'} · Apply to exterior front</p>}
    {giftBox.personalization?.engravings?.map((entry,index)=><p key={index}>Engraving: <bdi>{entry.text}</bdi> · {LETTERING_STYLES.find(style=>style.id===entry.styleId)?.label || 'Saved font'} · {ENGRAVING_COLORS.find(color=>color.id===entry.colorId)?.label || 'Saved color'}</p>)}
  </div>;
}
