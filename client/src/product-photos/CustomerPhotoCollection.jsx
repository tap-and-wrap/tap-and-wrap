import { useEffect, useId, useRef, useState } from 'react';
import ImageSourceChooser from '../components/ImageSourceChooser.jsx';
export default function CustomerPhotoCollection({ files, onChange, maxFiles, disabled = false, readOnly = false, error }) {
  const [previews, setPreviews] = useState([]), [failure, setFailure] = useState(''), id = useId();
  const urls = useRef(new Map());
  useEffect(() => {
    const cache = urls.current;
    for (const [file, url] of cache) if (!files.includes(file)) { URL.revokeObjectURL(url); cache.delete(file); }
    const next = files.map(file => { if (!cache.has(file)) cache.set(file, URL.createObjectURL(file)); return { file, url: cache.get(file) }; });
    setPreviews(next);
  }, [files]);
  useEffect(() => { const cache = urls.current; return () => { cache.forEach(url => URL.revokeObjectURL(url)); cache.clear(); }; }, []);
  function add(selected) {
    if (files.length + selected.length > maxFiles) { setFailure(`Choose up to ${maxFiles} personal photos with your other product images.`); return; }
    setFailure(''); onChange([...files, ...selected]);
  }
  function move(index, offset) { const next = [...files]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; onChange(next); }
  return <div className="customer-photo-collection" aria-label="Your personal photos">
    {!readOnly && <><ImageSourceChooser label={files.length ? 'Add more photos' : 'Choose photos'} context="Your personal photos" inputLabel="Personal photos" multiple maxFiles={Math.max(1, maxFiles - files.length)} maxBytes={8388608} disabled={disabled || files.length >= maxFiles} onSelect={add} onError={setFailure} describedBy={`${id}-help`}/><p id={`${id}-help`} className="commerce-muted">{files.length} of {maxFiles} photos. JPEG, PNG or WebP, up to 8 MB each. Uploads begin when you add to cart.</p></>}
    {previews.length > 0 && <ol className="customer-photo-grid">{previews.map((photo, index) => <li key={photo.url}><img src={photo.url} alt={`Selected personal photo ${index + 1}`} width="160" height="160"/><span>Photo {index + 1}</span>{!readOnly && <><button type="button" aria-label={`Remove photo ${index + 1}`} disabled={disabled} onClick={() => { setFailure(''); onChange(files.filter((_, position) => position !== index)); }}>Remove</button><div className="customer-photo-move"><button type="button" aria-label={`Move photo ${index + 1} earlier`} disabled={disabled || index === 0} onClick={() => move(index, -1)}>&larr;</button><button type="button" aria-label={`Move photo ${index + 1} later`} disabled={disabled || index === files.length - 1} onClick={() => move(index, 1)}>&rarr;</button></div></>}</li>)}</ol>}
    {(failure || error) && <p role="alert">{failure || error}</p>}
  </div>;
}
