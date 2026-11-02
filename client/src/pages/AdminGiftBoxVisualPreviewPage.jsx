import { useMemo, useState } from 'react';
import AdminLayout from '../admin/AdminLayout.jsx';
import ArrangementCanvas from '../gift-box/ArrangementCanvas.jsx';
import { initialArrangement } from '../gift-box/state.mjs';
import { configuredGiftBoxMedia, publicGiftBoxMediaUrl } from '../gift-box/public-media-url.mjs';
import { FIXED_COMPONENTS } from '../../../shared/gift-box/definitions.mjs';
import { GIFT_BOX_MEDIA } from '../../../shared/gift-box/public-media.v1.mjs';
import '../gift-box/gift-box.css';
import './admin-giftbox-visual-preview.css';

const mediaBase = import.meta.env.VITE_GIFT_BOX_MEDIA_BASE_URL;
const release = import.meta.env.VITE_GIFT_BOX_MEDIA_RELEASE;
const boxes = FIXED_COMPONENTS.filter(item => item.category === 'box');
const bows = FIXED_COMPONENTS.filter(item => item.category === 'ribbon');
const categoryNames = {
  all: 'All assets', box: 'Boxes', flower: 'Flowers', plush: 'Plush toys',
  chocolate: 'Chocolates', ribbon: 'Ribbons',
};
const componentTypes = new Map(FIXED_COMPONENTS.map(item => [item.id, item.category]));
const imageEntries = GIFT_BOX_MEDIA.entries.map(entry => ({ ...entry, category: componentTypes.get(entry.componentId) || 'other' }));

function MediaCard({ entry, status, onStatus }) {
  const src = publicGiftBoxMediaUrl({ baseUrl: mediaBase, releaseId: release,
    componentId: entry.componentId, role: entry.role, width: entry.width });
  return <article className="gb-media-inspector-card">
    <div className="gb-media-inspector-image">
      {src ? <img src={src} alt={`${entry.componentId} ${entry.role} artwork`}
        loading="lazy" decoding="async"
        onLoad={() => onStatus(entry.key, 'loaded')}
        onError={() => onStatus(entry.key, 'failed')}/> : <span>Media configuration missing</span>}
    </div>
    <strong>{entry.componentId}</strong>
    <span>{entry.role} · {entry.width}px</span>
    <span className={status === 'failed' ? 'gb-media-inspector-failed' : ''}>
      {status === 'loaded' ? 'Loaded' : status === 'failed' ? 'Image failed to load' : 'Not loaded yet'}
    </span>
  </article>;
}

/** Admin-only, read-only inspection. No pricing, cart, upload, or commerce API calls. */
export default function AdminGiftBoxVisualPreviewPage() {
  const [category, setCategory] = useState('box');
  const [selectedBox, setSelectedBox] = useState('box-1');
  const [selectedBow, setSelectedBow] = useState('ribbon-baby-blue');
  const [statuses, setStatuses] = useState({});
  const configured = configuredGiftBoxMedia({ baseUrl: mediaBase, releaseId: release });
  const filtered = useMemo(() => imageEntries.filter(item => category === 'all' || item.category === category), [category]);
  const arrangement = useMemo(() => ({ ...initialArrangement(), boxId: selectedBox, ribbonId: selectedBow }), [selectedBox, selectedBow]);
  const loaded = filtered.filter(entry => statuses[entry.key] === 'loaded').length;
  const failed = filtered.filter(entry => statuses[entry.key] === 'failed').length;
  const onStatus = (key, state) => setStatuses(current => current[key] === state ? current : { ...current, [key]: state });

  return <AdminLayout title="Gift Box Visual Preview" description="Inspect versioned production images and a draft arrangement on the live site. No customer orders, prices, or stock are changed.">
    <section className="admin-panel gb-media-inspector-notice">
      <h2>Artwork delivery review — not a commerce release</h2>
      <p>Media release: <code>{GIFT_BOX_MEDIA.releaseId}</code> · {GIFT_BOX_MEDIA.entries.length} pinned assets. Physical fit, packing, placement boundaries, prices and stock are not approved by this preview.</p>
      {!configured && <p role="alert" className="gb-media-inspector-failed">The media build variables are missing or do not match the pinned release. Check the Cloudflare production build variables and rebuild before reviewing images.</p>}
    </section>
    {configured && <section className="admin-panel gb-media-inspector-stage" aria-label="Approximate box and ribbon layout">
      <h2>Box and ribbon arrangement study</h2>
      <p>Use this to compare image alignment only. No physical measurements or packing guarantees are implied.</p>
      <div className="gb-media-inspector-controls">
        <label>Box
          <select value={selectedBox} onChange={event => setSelectedBox(event.target.value)}>
            {boxes.map(box => <option key={box.id} value={box.id}>Box {box.sourceNumber}</option>)}
          </select>
        </label>
        <label>Ribbon bow
          <select value={selectedBow} onChange={event => setSelectedBow(event.target.value)}>
            <option value="">No ribbon</option>
            {bows.map(bow => <option key={bow.id} value={bow.id}>{bow.id.replace('ribbon-', '').replaceAll('-', ' ')}</option>)}
          </select>
        </label>
      </div>
      <div className="gb-media-inspector-canvas">
        <ArrangementCanvas key={selectedBox} state={arrangement} components={[]} dispatch={() => {}} study/>
      </div>
    </section>}
    <section className="admin-panel" aria-label="Pinned Gift Box images">
      <div className="gb-media-inspector-summary">
        <div><h2>Pinned image inventory</h2><p>Load images as you scroll. A successfully loaded image is only a browser delivery check, not an artwork or packing approval.</p></div>
        <label>Category
          <select value={category} onChange={event => setCategory(event.target.value)}>
            {Object.entries(categoryNames).map(([id, title]) => <option key={id} value={id}>{title}</option>)}
          </select>
        </label>
      </div>
      <p role="status">Showing {filtered.length} images · {loaded} loaded · {failed} failed. Remaining images load as you scroll.</p>
      {configured && <div className="gb-media-inspector-grid">
        {filtered.map(entry => <MediaCard key={entry.key} entry={entry} status={statuses[entry.key]} onStatus={onStatus}/>)}
      </div>}
    </section>
  </AdminLayout>;
}
