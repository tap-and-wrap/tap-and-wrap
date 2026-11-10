import './engraving.css';
import { FONT_REGISTRY, ICON_REGISTRY } from '../../../shared/engraving/definitions.mjs';
import { DesignPreview } from './StudioControls.jsx';
export default function EngravingSummary({ engraving, preview = true }) {
  if (!engraving) return <p>One customer-owned item. Edit this engraving to review its current options and images.</p>;
  if (engraving.layers) return <div className="engraving-summary"><p>{engraving.typeName}{engraving.description ? ` · ${engraving.description}` : ''}</p><dl className="studio-specification"><div><dt>Position guidance</dt><dd>{engraving.placementLabel}</dd></div>{engraving.layers.map(layer => <div key={layer.id}><dt>{layer.type === 'text' ? 'Text' : 'Image artwork'}</dt><dd>{layer.type === 'text' ? <><bdi>{layer.text}</bdi> · {FONT_REGISTRY.find(font => font.id === layer.fontId)?.label} · {layer.color}</> : 'Original uploaded artwork'}</dd></div>)}</dl></div>;
  const font = FONT_REGISTRY.find(value => value.id === engraving.content?.fontId), icon = ICON_REGISTRY.find(value => value.id === engraving.content?.iconId);
  return <div className="engraving-summary">{preview&&<DesignPreview content={engraving.content} appearance={engraving.requestedAppearance} compact/>}{engraving.description&&<p>{engraving.description}</p>}<dl className="studio-specification"><div><dt>Location</dt><dd>{engraving.placementLabel || 'Help me choose the best placement'}</dd></div><div><dt>Design</dt><dd>{engraving.content?.mode==='text'?font?.label||'Saved text':engraving.content?.mode==='icons'?icon?.label||'Saved symbol':`${engraving.content?.subtype||'Personal'} artwork`}</dd></div><div><dt>Appearance</dt><dd>{engraving.requestedAppearance} · preference</dd></div></dl>{engraving.specialRequests && <details className="engraving-notes"><summary>Special requests</summary><p>{engraving.specialRequests}</p></details>}
  </div>;
}
