import { useEffect, useId, useRef, useState } from 'react';
import { FONT_REGISTRY, ICON_REGISTRY, ICON_CATEGORIES } from '../../../shared/engraving/definitions.mjs';
import { authGeneration } from '../services/api.js';
import CatalogDialog from '../components/CatalogDialog.jsx';

export function LocalPhoto({ file, alt, className = '' }) {
  const [source, setSource] = useState(null);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file); setSource({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return source?.file === file ? <img className={className} src={source.url} alt={alt}/> : null;
}

export function StudioUpload({ label, file, onChange, required = false, error }) {
  const id=useId(), [localError,setLocalError]=useState('');
  function select(event) {
    const selected=event.target.files?.[0]; event.target.value=''; if(!selected)return;
    if(!['image/jpeg','image/png','image/webp'].includes(selected.type)||!selected.size||selected.size>8388608){setLocalError('Choose a JPEG, PNG or WebP image up to 8 MB.');return;}
    setLocalError('');onChange(selected);
  }
  return <div className={`studio-upload ${file ? 'has-photo' : ''}`}>
    {file && <div className="studio-upload-photo"><LocalPhoto file={file} alt={label}/></div>}
    <div><p className="studio-upload-label">{label}{required?' *':''}</p><div className="studio-upload-actions"><label><input className="studio-file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label={label} aria-invalid={Boolean(localError||error)} aria-describedby={`${id}-help${localError||error?` ${id}-error`:''}`} onChange={select}/><span>{file?'Replace image':'Choose photo'}</span></label><label><input className="studio-file-input" type="file" capture="environment" accept="image/jpeg,image/png,image/webp" aria-label={`Use camera for ${label}`} onChange={select}/><span>Camera</span></label>{file&&<button type="button" onClick={()=>{setLocalError('');onChange(undefined);}}>Remove image</button>}</div>
      <small id={`${id}-help`}>{file ? 'Private reference · ready on this device' : 'JPG, PNG or WebP · up to 8 MB'}</small>{(localError||error)&&<p id={`${id}-error`} role="alert">{localError||error}</p>}</div>
  </div>;
}

export function FontGallery({ ids, selected, onSelect, text = '', multiple = false }) {
  const [language, setLanguage] = useState('all');
  const arabic = /\p{Script=Arabic}/u.test(text);
  const choices = FONT_REGISTRY.filter(font => ids.includes(font.id) && (language === 'all' || font.language === language));
  return <div className="studio-gallery"><div className="studio-filters" role="group" aria-label="Font language">
    {[['all','All styles'],['en','English'],['ar','Arabic']].map(([key,label]) => <button type="button" key={key} aria-pressed={language === key} onClick={() => setLanguage(key)}>{label}</button>)}
  </div><div className="engraving-fonts">{choices.map(font => <label className="studio-font-card" key={font.id}>
    <input type={multiple ? 'checkbox' : 'radio'} name={multiple ? undefined : 'font'} disabled={!multiple && arabic && font.language !== 'ar'} checked={multiple ? selected.includes(font.id) : selected === font.id} onChange={() => onSelect(font.id)}/>
    <span className="engraving-sample" dir={font.language === 'ar' ? 'rtl' : 'auto'} style={{ fontFamily: font.family }}>{text && (!arabic || font.language === 'ar') ? text : font.language === 'ar' ? 'ذكرى جميلة' : 'Forever yours'}</span>
    <span>{font.label}<small>{font.language === 'ar' ? 'Arabic' : 'English'}</small></span>
  </label>)}</div>{arabic && <small>Arabic text needs an Arabic-supporting style.</small>}</div>;
}

export function IconGallery({ ids, selected, onSelect, multiple = false }) {
  const [category, setCategory] = useState('Love'), [search, setSearch] = useState('');
  const available = ICON_REGISTRY.filter(icon => ids.includes(icon.id));
  const categories = ['All', ...new Set(available.map(icon => ICON_CATEGORIES[icon.id] || 'Minimal'))];
  const activeCategory=categories.includes(category)?category:categories[1]||'All';
  const shown = available.filter(icon => (search.trim() || activeCategory === 'All' || ICON_CATEGORIES[icon.id] === activeCategory) && icon.label.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="studio-gallery"><label className="studio-search">Find a symbol<input type="search" placeholder="Heart, flower, music…" value={search} onChange={event => setSearch(event.target.value)}/></label>
    <div className="studio-filters" role="group" aria-label="Symbol categories">{categories.map(value => <button type="button" key={value} aria-pressed={activeCategory === value} onClick={() => setCategory(value)}>{value}</button>)}</div>
    <div className="engraving-icon-grid">{shown.map(icon => <label key={icon.id} title={icon.label}><input type={multiple ? 'checkbox' : 'radio'} name={multiple ? undefined : 'icon'} checked={multiple ? selected.includes(icon.id) : selected === icon.id} onChange={() => onSelect(icon.id)}/><img src={icon.asset} width="52" height="52" alt=""/><span>{icon.label}</span></label>)}</div>
    {!shown.length && <p>No symbols match. Try another name or category.</p>}
  </div>;
}

export function DesignPreview({ content, appearance = 'black', artwork, artworkUrl, compact = false }) {
  const font = FONT_REGISTRY.find(value => value.id === content?.fontId), icon = ICON_REGISTRY.find(value => value.id === content?.iconId);
  return <div className={`studio-design ${compact ? 'compact' : ''} appearance-${appearance}`} aria-label="Digital design preview">
    <span className="studio-design-caption">Your design</span>
    <div className="studio-design-art">
      {content?.mode === 'text' ? <p dir="auto" style={{ fontFamily: font?.family }}>{content.text || 'Your words, beautifully kept'}</p>
        : content?.mode === 'icons' ? icon ? <img data-symbol="true" src={icon.asset} alt={icon.label}/> : <p>Choose your symbol</p>
          : artwork ? <LocalPhoto file={artwork} alt="Your private artwork"/> : artworkUrl ? <img src={artworkUrl} alt="Your private artwork"/> : <p>A little piece of you</p>}
    </div><small>Digital design only · finish depends on your item</small>
  </div>;
}

/** Memory-only artwork strokes; no identity analysis, storage or network activity. */
export function HandwritingPad({ strokes = [], onStrokes, onExport, existingFile, expanded = false }) {
  const canvas = useRef(null), current = useRef(null), activePointer = useRef(null), mounted = useRef(true), [enlarged, setEnlarged] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [renderVersion, setRenderVersion] = useState(0);
  const helpId = useId();
  const points = useRef(strokes); points.current = strokes;
  function draw() {
    const element = canvas.current; if (!element) return;
    const context = element.getContext('2d'); context.clearRect(0,0,element.width,element.height);
    context.strokeStyle = '#332823'; context.lineWidth = 5; context.lineCap = 'round'; context.lineJoin = 'round';
    for (const stroke of [...points.current, ...(current.current ? [current.current] : [])]) {
      if (!stroke.length) continue;
      context.beginPath(); context.moveTo(stroke[0].x * element.width, stroke[0].y * element.height);
      if (stroke.length === 1) context.lineTo(stroke[0].x * element.width + .5, stroke[0].y * element.height + .5);
      for (let index=1;index<stroke.length-1;index++) {
        const next=stroke[index+1], point=stroke[index];
        context.quadraticCurveTo(point.x*element.width,point.y*element.height,(point.x+next.x)*element.width/2,(point.y+next.y)*element.height/2);
      }
      if(stroke.length>1)context.lineTo(stroke.at(-1).x*element.width,stroke.at(-1).y*element.height);
      context.stroke();
    }
  }
  useEffect(() => { draw(); });
  useEffect(() => { mounted.current=true; return () => { mounted.current=false; current.current=null; }; }, []);
  function point(event) { const rect=canvas.current.getBoundingClientRect(); return { x: Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)), y: Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height)) }; }
  function finish(event) {
    if (!current.current || activePointer.current !== event.pointerId) return;
    const next = [...points.current, current.current]; current.current = null; activePointer.current=null; onStrokes(next);
    if (canvas.current.hasPointerCapture(event.pointerId)) canvas.current.releasePointerCapture(event.pointerId);
  }
  async function exportFile() {
    setBusy(true); setError(''); const generation=authGeneration(), exportedStrokes=strokes;
    try {
      const blob = await new Promise(resolve => canvas.current.toBlob(resolve, 'image/png'));
      if (!mounted.current || generation!==authGeneration() || points.current!==exportedStrokes) return;
      if (!blob || blob.size > 8388608) throw Error('Your artwork could not be exported. Try fewer strokes or upload an image.');
      onExport(new File([blob], 'handwriting-artwork.png', { type: 'image/png' }));
    } catch (caught) { if(mounted.current&&generation===authGeneration())setError(caught.message); } finally { if(mounted.current&&generation===authGeneration())setBusy(false); }
  }
  return <><section className="studio-handwriting" aria-label="Handwriting pad" aria-hidden={enlarged || undefined}>
    <div className="studio-pad-heading"><div><h3>Make it unmistakably yours</h3><p>Write with your finger, pen or mouse.</p></div>{!expanded&&<button type="button" disabled={busy} onClick={() => setEnlarged(true)}>Enlarge pad</button>}</div>
    <canvas ref={canvas} width={1800} height={900} aria-label="Write your handwriting artwork" aria-describedby={helpId} onPointerDown={event => {
      if (busy || current.current || event.pointerType==='mouse'&&event.button!==0) return;
      if (points.current.length >= 300) {setError('This pad is full. Export it, undo a stroke or upload artwork instead.');return;}
      event.preventDefault(); activePointer.current=event.pointerId; canvas.current.setPointerCapture(event.pointerId); current.current=[point(event)]; draw();
    }} onPointerMove={event => { if (!current.current || !canvas.current.hasPointerCapture(event.pointerId)) return; event.preventDefault(); const samples=event.nativeEvent.getCoalescedEvents?.(); for(const sample of samples?.length?samples:[event])if(current.current.length<4000)current.current.push(point(sample)); draw(); }} onPointerUp={finish} onPointerCancel={finish}/>
    <p id={helpId} className="studio-microcopy">Artwork only. Prefer a photo? Use the private upload below. No file uploads until Add to Cart.</p>
    <div className="studio-pad-actions"><button type="button" disabled={!strokes.length || busy} onClick={() => { onStrokes(strokes.slice(0,-1)); setRenderVersion(renderVersion+1); }}>Undo last stroke</button><button type="button" disabled={!strokes.length || busy} onClick={() => { onStrokes([]); onExport(undefined); }}>Clear canvas</button><button type="button" disabled={busy} onClick={() => { onStrokes([]); onExport(undefined); setEnlarged(false); }}>Restart</button><button className="button button-primary" type="button" disabled={!strokes.length || busy} onClick={exportFile}>{busy ? 'Preparing artwork…' : 'Use this handwriting'}</button></div>
    {existingFile && <p role="status">Artwork ready. After drawing changes, choose “Use this handwriting” again.</p>}{error && <p role="alert">{error}</p>}
  </section>{enlarged&&<CatalogDialog title="Your handwriting studio" className="studio-pad-dialog" onClose={()=>setEnlarged(false)}><HandwritingPad expanded strokes={strokes} onStrokes={onStrokes} onExport={onExport} existingFile={existingFile}/></CatalogDialog>}</>;
}
