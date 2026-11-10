import { useState } from 'react';
import { FONT_REGISTRY, APPEARANCES } from '../../../shared/engraving/definitions.mjs';
import CatalogDialog from '../components/CatalogDialog.jsx';
import LetteringControls from '../engraving/LetteringControls.jsx';
import { ProductTextProof } from './ProductEngravingBuilder.jsx';
import './product-engraving.css';
export default function ProductEngravingSettings({ value, onChange }) {
  const [preview, setPreview] = useState(false), [text, setText] = useState('With love'), [fontId, setFont] = useState(null), [color, setColor] = useState('black');
  const colors = value?.colorIds || APPEARANCES;
  const change = patch => onChange({ ...value, mode: 'text', colorIds: colors, ...patch });
  return <section className="product-engraving-settings"><h2>Product engraving</h2><p>Approve engraving for this physically suitable product. Approved lettering, appearances and materials make it available automatically when the product is orderable.</p>
    {!value ? <button type="button" onClick={() => onChange({ mode: 'text', fontIds: [], colorIds: [...APPEARANCES], materials: [] })}>Configure approved engraving</button> : <>
      <label>Supported materials, one per line<textarea value={value.materials.join('\n')} onChange={event => change({ materials: event.target.value.split('\n') })}/></label>
      <fieldset><legend>Approved lettering</legend>{FONT_REGISTRY.map(font => <label key={font.id}><input type="checkbox" checked={value.fontIds.includes(font.id)} onChange={event => change({ fontIds: event.target.checked ? [...value.fontIds, font.id] : value.fontIds.filter(id => id !== font.id) })}/><span style={{ fontFamily: font.family }}>{font.language === 'ar' ? '\u0628\u0643\u0644 \u0627\u0644\u062d\u0628' : 'With love'}</span> ({font.language === 'ar' ? 'Arabic' : 'English'} style {FONT_REGISTRY.filter(f => f.language === font.language).indexOf(font) + 1})</label>)}</fieldset>
      <fieldset><legend>Approved appearances</legend>{APPEARANCES.map(id => <label key={id}><input type="checkbox" checked={colors.includes(id)} onChange={event => change({ colorIds: event.target.checked ? [...colors, id] : colors.filter(color => color !== id) })}/>{id}</label>)}</fieldset>
      <button type="button" disabled={!value.fontIds.length || !colors.length} onClick={() => { setFont(value.fontIds[0]); setColor(colors[0]); setPreview(true); }}>Preview customer form</button><button type="button" onClick={() => onChange(null)}>Remove engraving setup</button><p>The existing engraving dashboard controls the surcharge. Historical image references are retained.</p>
    </>}
    {preview && value && <CatalogDialog title="Product engraving preview" onClose={() => setPreview(false)}><label>Engraving text<input value={text} dir="auto" onChange={event => setText(event.target.value)}/></label><ProductTextProof text={text} fontId={fontId} colorId={color}/><LetteringControls text={text} fontId={fontId} color={color} fontIds={value.fontIds} colorIds={colors} onChange={patch => { if (patch.fontId) setFont(patch.fontId); if (patch.color) setColor(patch.color); }}/></CatalogDialog>}
  </section>;
}
