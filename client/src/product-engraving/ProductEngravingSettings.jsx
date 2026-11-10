import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { FONT_REGISTRY } from '../../../shared/engraving/definitions.mjs';
import CatalogDialog from '../components/CatalogDialog.jsx';
import VisualEngravingEditor from '../engraving/visual/VisualEngravingEditor.jsx';
import './product-engraving.css';

export default function ProductEngravingSettings({ keys, value, onChange }) {
  const [base, setBase] = useState(''), [error, setError] = useState(''), [preview, setPreview] = useState(false), pending = useRef(null);
  useEffect(() => { const controller = new AbortController(); api.get('/admin/media/config', { signal: controller.signal }).then(result => setBase(result.data.data.baseUrl || '')).catch(() => {}); return () => { controller.abort(); pending.current?.abort(); }; }, []);
  const url = key => base ? `${base.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}` : '';
  async function select(key) {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller; setError('');
    try {
      const image = new Image(); image.src = url(key); await image.decode(); if (controller.signal.aborted) return;
      onChange({ ...(value || { fontIds: [], materials: [], placements: [] }), imageKey: key, width: image.naturalWidth, height: image.naturalHeight });
    } catch { if (!controller.signal.aborted) setError('This gallery image could not be opened. Choose a working approved image.'); }
  }
  const change = patch => onChange({ ...value, ...patch });
  return <section className="product-engraving-settings"><h2>Product engraving</h2><p>Choose an existing approved gallery image for a physically suitable product. Saving a complete setup makes engraving available automatically when this product is orderable.</p>
    <div className="product-engraving-images" aria-label="Engraving surface images">{keys.map((key, index) => <button type="button" key={key} aria-label={`Use image ${index + 1}`} disabled={!base} aria-pressed={value?.imageKey === key} onClick={() => select(key)}><img src={url(key)} alt="" width="110" height="110" loading="lazy"/>Use image {index + 1}</button>)}</div>
    {value && <><label>Supported materials, one per line<textarea value={value.materials.join('\n')} onChange={event => change({ materials: event.target.value.split('\n') })}/></label><label>Placement suggestions, one per line<textarea value={value.placements.join('\n')} onChange={event => change({ placements: event.target.value.split('\n') })}/></label><fieldset><legend>Approved lettering</legend>{FONT_REGISTRY.map(font => <label key={font.id}><input type="checkbox" checked={value.fontIds.includes(font.id)} onChange={event => change({ fontIds: event.target.checked ? [...value.fontIds, font.id] : value.fontIds.filter(id => id !== font.id) })}/>{font.label}</label>)}</fieldset><button type="button" onClick={() => setPreview(true)} disabled={!value.imageKey || !value.fontIds.length}>Preview customer editor</button><button type="button" onClick={() => onChange(null)}>Remove engraving setup</button><p>Engraving price is managed separately in the engraving dashboard.</p></>}
    {error && <p role="alert">{error}</p>}{preview && value && <CatalogDialog title="Product engraving preview" className="product-engraving-dialog" onClose={() => setPreview(false)}><p>Preview only. No cart or pricing changes.</p><VisualEngravingEditor ownerScope="owner-product-preview" initialDraft={{ ownerScope: 'owner-product-preview', design: { version: 'visual-engraving-v1', surface: { assetId: 'approved-preview', aspectRatio: value.width / value.height }, layers: [] } }} assets={{ 'approved-preview': { approved: true, src: url(value.imageKey) } }} approvedFontIds={value.fontIds} surfaceControls={false} confirmReset/></CatalogDialog>}
  </section>;
}
