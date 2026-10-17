import { useEffect, useRef, useState } from 'react';
import { api, safePost } from '../services/api.js';
import ImageSourceChooser, { IMAGE_FORMAT_HELP } from '../components/ImageSourceChooser.jsx';
import './media.css';

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function AdminImageGallery({ keys = [], onChange, max = 23, onBusyChange, label = 'Images' }) {
  const [baseUrl, setBaseUrl] = useState(null);
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const controller = useRef(null), previews = useRef(new Set()), active = useRef(true);
  const change = useRef(onChange);
  change.current = onChange;
  const reportBusy = useRef(onBusyChange);
  reportBusy.current = onBusyChange;
  useEffect(() => {
    active.current = true;
    const urls = previews.current;
    const config = new AbortController();
    api.get('/admin/media/config', { signal: config.signal }).then(response => { if (active.current) setBaseUrl(response.data.data.baseUrl); }).catch(() => {});
    return () => { active.current = false; config.abort(); controller.current?.abort(); for (const url of urls) URL.revokeObjectURL(url); urls.clear(); reportBusy.current?.(false); };
  }, []);
  useEffect(() => { onBusyChange?.(busy || pending.length > 0); }, [busy, pending.length, onBusyChange]);
  const release = item => { URL.revokeObjectURL(item.url); previews.current.delete(item.url); };
  function select(files, replace = null) {
    setError('');
    const list = Array.from(files || []);
    if (!list.length) return;
    if (list.some(file => !TYPES.includes(file.type) || !file.size || file.size > MAX_BYTES)) { setError(`Select JPEG, PNG or WebP images up to 10 MB each. ${IMAGE_FORMAT_HELP}`); return; }
    if (replace !== null && list.length !== 1) { setError('Choose one replacement image.'); return; }
    if (replace === null && keys.length + pending.filter(item => item.replace === null).length + list.length > max) { setError(`Use at most ${max} images.`); return; }
    const additions = list.map(file => { const url = URL.createObjectURL(file); previews.current.add(url); return { file, url, replace }; });
    setPending(current => { const keep = current.filter(item => replace === null || item.replace !== replace); current.filter(item => !keep.includes(item)).forEach(release); return [...keep, ...additions]; });
  }
  async function upload() {
    if (busy || !pending.length) return;
    setBusy(true); setError('');
    const signal = (controller.current = new AbortController()).signal;
    let next = [...keys];
    try {
      for (const item of pending) {
        setProgress(0);
        const response = await safePost('/admin/media', item.file, { signal, timeout: 60000, headers: { 'Content-Type': item.file.type }, onUploadProgress: event => { if (active.current) setProgress(Math.round(100 * (event.progress || 0))); } });
        if (!active.current) return;
        const key = response.data.data.image.key;
        if (next.includes(key) && (item.replace === null || next[item.replace] !== key)) {
          setError('This image is already in the gallery. The duplicate was not added.');
        } else if (item.replace === null) next = [...next, key];
        else next = next.map((old, index) => index === item.replace ? key : old);
        change.current(next);
        setPending(current => current.filter(entry => entry !== item)); release(item);
      }
    } catch (failure) {
      if (active.current && !signal.aborted) setError(failure.response?.data?.error?.message || 'Upload did not finish. Your saved images are unchanged. Retry uploading the remaining selection.');
    } finally {
      if (active.current) { setBusy(false); }
    }
  }
  function move(index, destination) { const next = [...keys]; const [key] = next.splice(index, 1); next.splice(destination, 0, key); onChange(next); }
  const locked = busy || pending.length > 0;
  return <section className="admin-media" aria-label={label}>
    <h3>{label}</h3>
    <p>Upload public catalog photos only. Upload selected images, then Save the record to apply changes. Removing a reference keeps the stored image and order history.</p>
    <ol className="admin-media-grid">{keys.map((key, index) => <li key={key}>
      {baseUrl ? <img src={`${baseUrl}${key.split('/').map(encodeURIComponent).join('/')}`} width="160" height="160" loading="lazy" decoding="async" alt={`Image ${index + 1}${index === 0 ? ', primary' : ''}`} /> : <p>Existing image {index + 1}</p>}
      <strong>{index === 0 ? 'Primary image' : `Image ${index + 1}`}</strong>
      <div className="admin-media-actions">
        <button type="button" disabled={locked || index === 0} onClick={() => move(index, 0)} aria-label={`Set image ${index + 1} as main`}>Set primary</button>
        <button type="button" disabled={locked || index === 0} onClick={() => move(index, index - 1)} aria-label={`Move image ${index + 1} up`}>Move up</button>
        <button type="button" disabled={locked || index === keys.length - 1} onClick={() => move(index, index + 1)} aria-label={`Move image ${index + 1} down`}>Move down</button>
        <ImageSourceChooser label={`Replace image ${index + 1}`} disabled={busy} onSelect={files => select(files, index)} />
        <button type="button" disabled={locked} onClick={() => onChange(keys.filter((_, position) => position !== index))} aria-label={`Remove image ${index + 1} reference`}>Remove reference</button>
      </div>
    </li>)}</ol>
    <ImageSourceChooser label={`Add ${max === 1 ? 'image' : 'images'}`} multiple={max > 1} disabled={busy || keys.length >= max} onSelect={files => select(files)} />
    {pending.length > 0 && <><ul className="admin-media-grid">{pending.map((item, index) => <li key={item.url}><img src={item.url} width="160" height="160" loading="lazy" decoding="async" alt={`Selected ${item.file.name}`} onError={event => { event.currentTarget.hidden = true; setError('This selection could not be previewed. Choose a compatible JPEG, PNG or WebP. Saved images are unchanged; the server still verifies every upload.'); }} /><span>{item.replace === null ? 'New image' : `Replace image ${item.replace + 1}`}: {item.file.name}</span><button type="button" disabled={busy} onClick={() => { release(item); setPending(current => current.filter((_, position) => position !== index)); }}>Discard selection {index + 1}</button></li>)}</ul><button type="button" disabled={busy} onClick={upload}>{busy ? 'Uploading and verifying…' : 'Upload selected images'}</button></>}
    {busy && <><p role="status">Sending {progress}%. Waiting for server verification before adding the image.<progress max="100" value={progress} /></p><button type="button" onClick={() => { controller.current?.abort(); setError('Upload stopped. Verified images stay in the draft; retry or discard the remaining selections before saving.'); }}>Stop upload</button></>}
    {pending.length > 0 && !busy && <p>Selected files are not saved yet. Upload or discard them before saving.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
