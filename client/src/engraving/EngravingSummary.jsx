import './engraving.css';
import { ICON_REGISTRY } from '../../../shared/engraving/definitions.mjs';
import { DesignPreview } from './StudioControls.jsx';
export default function EngravingSummary({ engraving, preview = true }) {
  if (!engraving) return <p>One customer-owned item. Edit this engraving to review its current options and images.</p>;
  if (engraving.layers) return <div className="engraving-summary">{engraving.description && engraving.description.trim().toLowerCase() !== engraving.typeName?.trim().toLowerCase() && <p>{engraving.description}</p>}<dl className="studio-specification"><div><dt>Type</dt><dd>{engraving.typeName}</dd></div>{engraving.layers.map(layer => <div key={layer.id}><dt>{layer.type === 'text' ? 'Text' : 'Image artwork'}</dt><dd>{layer.type === 'text' ? <><bdi>{layer.text}</bdi> · {layer.color}</> : 'Original uploaded artwork'}</dd></div>)}</dl></div>;
  const icon = ICON_REGISTRY.find(value => value.id === engraving.content?.iconId);
  return <div className="engraving-summary">{preview&&<DesignPreview content={engraving.content} appearance={engraving.requestedAppearance} compact/>}{engraving.description && engraving.description.trim().toLowerCase() !== engraving.typeName?.trim().toLowerCase() && <p>{engraving.description}</p>}<dl className="studio-specification"><div><dt>Type</dt><dd>{engraving.typeName}</dd></div><div><dt>Design</dt><dd>{engraving.content?.mode==='text'?<bdi>{engraving.content.text}</bdi>:engraving.content?.mode==='icons'?icon?.label||'Saved symbol':`${engraving.content?.subtype||'Personal'} artwork`}</dd></div><div><dt>Appearance</dt><dd>{engraving.requestedAppearance} · preference</dd></div></dl>{engraving.specialRequests && <details className="engraving-notes"><summary>Special requests</summary><p>{engraving.specialRequests}</p></details>}
  </div>;
}
