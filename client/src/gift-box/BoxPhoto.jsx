import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react';
import useModalDialog from '../components/useModalDialog.js';
import { localArtwork } from './media.js';

function PhotoViewer({ componentId, label, onClose }) {
  const titleId = useId(), [zoomed, setZoomed] = useState(false);
  const { dialogRef, dialogProps } = useModalDialog({ onClose });
  return createPortal(<dialog ref={dialogRef} {...dialogProps} className="gb-photo-dialog" aria-labelledby={titleId}>
    <header><h2 id={titleId}>{label}</h2><div><button type="button" aria-label={zoomed ? 'Fit photo to screen' : 'Zoom into photo'} aria-pressed={zoomed} onClick={() => setZoomed(value => !value)}>{zoomed ? <ZoomOut aria-hidden="true"/> : <ZoomIn aria-hidden="true"/>}</button><button type="button" aria-label="Close box photo" onClick={onClose}><X aria-hidden="true"/></button></div></header>
    <div className={`gb-photo-viewer ${zoomed ? 'is-zoomed' : ''}`} tabIndex={0} aria-label="Box photo; use zoom to inspect details"><img src={localArtwork(componentId, 'selection', 640)} alt={label} draggable="false"/></div>
  </dialog>, document.body);
}

export default function BoxPhoto({ componentId, label }) {
  const [open, setOpen] = useState(false);
  const small = localArtwork(componentId, 'selection', 320), large = localArtwork(componentId, 'selection', 640);
  return <>
    <button type="button" className="gb-box-choice-photo" aria-label={`Enlarge ${label} photo`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
    <img src={small} srcSet={small && large ? `${small} 320w, ${large} 640w` : undefined} sizes="(max-width: 400px) 140px, (max-width: 900px) 200px, 180px" alt={label} loading="lazy" decoding="async"/>
    <span className="gb-photo-enlarge" aria-hidden="true"><Maximize2 size={18}/></span></button>
    {open && <PhotoViewer componentId={componentId} label={label} onClose={() => setOpen(false)}/>}
  </>;
}
