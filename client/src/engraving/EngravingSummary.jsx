import './engraving.css';
import { FONT_REGISTRY, ICON_REGISTRY } from '../../../shared/engraving/definitions.mjs';
export default function EngravingSummary({ engraving }) {
  if (!engraving) return <p>One customer-owned item. Edit this engraving to review its current options and images.</p>;
  const font = FONT_REGISTRY.find(value => value.id === engraving.content?.fontId), icon = ICON_REGISTRY.find(value => value.id === engraving.content?.iconId);
  return <div className="engraving-summary"><p><strong>{engraving.typeName}</strong> · One customer-owned item, one location</p>{engraving.description && <p>{engraving.description}</p>}<p>Location: {engraving.placementLabel || 'Help me choose the best placement'}</p>
    {engraving.content?.mode === 'text' ? <><p className="engraving-sample" dir="auto" style={{fontFamily:font?.family}}>{engraving.content.text}</p><p>Font: {font?.label}</p></> : engraving.content?.mode === 'icons' ? <p>{icon && <img src={icon.asset} width="52" height="52" alt={icon.label}/>} Symbol: {icon?.label}</p> : <p>Personal artwork: {engraving.content?.subtype}</p>}
    <p>Requested appearance: {engraving.requestedAppearance}. The final mark depends on the item and material.</p>{engraving.specialRequests && <p className="engraving-notes">{engraving.specialRequests}</p>}
  </div>;
}
