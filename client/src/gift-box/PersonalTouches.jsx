import { useState } from 'react';
import { LETTERING_STYLES, ENGRAVING_COLORS, getEngravingColor, MAX_GIFT_PHOTOS, MAX_ENGRAVING_LINES, MAX_ENGRAVING_CODEPOINTS } from '../../../shared/gift-box/lettering-styles.mjs';

export function PersonalPreview({ personal, showPhotoStack = true }) {
  if (!personal.hasContent) return null;
  return <section className="gb-personal-preview" aria-label="Personal touches preview">
    {showPhotoStack && personal.photos.length > 0 && <div className="gb-preview-photos">
      <p>Photo prints · illustrative stack outside the box</p>
      <div className="gb-photo-stack" aria-label={`${personal.photos.length} selected photos`}>
        {personal.photos.map((photo,index) => <div className="gb-photo-print" key={photo.id} style={{ zIndex: index + 1 }}>
          <img src={photo.url} alt={`Selected photo ${index+1}`} />
        </div>)}
      </div>
    </div>}
    {personal.engravings.filter(line => line.text.trim()).map((line, index) => <div className="gb-engraving-paper" key={line.id}
      data-color={getEngravingColor(line.colorId).id} data-preview-contrast={getEngravingColor(line.colorId).contrast}>
      <span>Engraving {index+1} · {getEngravingColor(line.colorId).label} candidate · font rendering pending approval</span>
      <p dir="auto" style={{color:getEngravingColor(line.colorId).hex}}>{line.text}</p>
    </div>)}
    <p className="gb-help">Local preview only. Private photos are uploaded only on Add to Cart, when the server verifies prices and ownership.</p>
  </section>;
}

export default function PersonalTouches({ personal }) {
  const {photos, engravings} = personal;
  // A compact, single-open editor. IDs are stable even when middle entries are removed.
  const [expandedId, setExpandedId] = useState('line-1');
  const activeId = expandedId === null ? null : engravings.some(line => line.id === expandedId) ? expandedId : engravings.at(-1)?.id;
  return <section className="gb-personal-touches" aria-label="Make it personal">
    <div className="gb-personal-group">
      <h3>Your special photos</h3>
      <p>Add photo prints and move them inside or beside the box. The browser has a memory/performance safety budget, not a physical packing allowance.</p>
      <label className="gb-photo-field">Choose photos · {photos.length} selected (local preview safety maximum: {MAX_GIFT_PHOTOS})
        <input aria-label="Add special photos" type="file" accept="image/jpeg,image/png,image/webp" multiple
          disabled={photos.length>=MAX_GIFT_PHOTOS}
          onChange={event => { personal.addPhotos(event.target.files); event.target.value=''; }}/>
      </label>
      {photos.length>0 && <ol className="gb-photo-order" aria-label="Selected photo order">{photos.map((photo,index)=><li key={photo.id}>
        <img src={photo.url} alt=""/><span>Photo {index+1} · {photo.name}</span>
        <button type="button" aria-label={`Move photo ${index+1} earlier`} disabled={index===0} onClick={()=>personal.movePhoto(photo.id,-1)}>↑</button>
        <button type="button" aria-label={`Move photo ${index+1} later`} disabled={index===photos.length-1} onClick={()=>personal.movePhoto(photo.id,1)}>↓</button>
        <button type="button" aria-label={`Remove photo ${index+1}`} onClick={()=>personal.removePhoto(photo.id)}>Remove</button>
      </li>)}</ol>}
      <p className="gb-help">Your photos stay in this browser until you choose Add to Cart. No private upload happens when you select, position or preview a photo.</p>
    </div>
    <div className="gb-personal-group">
      <h3>Write something special</h3>
      <p>Names, messages and dates are entered exactly as you want them written. Dates are not reformatted.</p>
      {engravings.map((line,index)=><div className="gb-engraving-entry" key={line.id}>
        <button type="button" className="gb-engraving-toggle"
          aria-label={`Edit engraving ${index+1}`} aria-expanded={activeId===line.id}
          aria-controls={`gb-engraving-fields-${line.id}`}
          onClick={()=>setExpandedId(activeId===line.id ? null : line.id)}>
          <span className="gb-engraving-title">Engraving {index+1} · {line.text.trim() ? 'Draft added' : 'Optional'}</span>
          <span className="gb-engraving-summary" dir="auto">{line.text.trim() || 'Add a name, message or date'}</span>
          <span className="gb-engraving-meta">{getEngravingColor(line.colorId).label} · {LETTERING_STYLES.find(style => style.id===line.styleId)?.customerLabel || 'No lettering style selected'} · {activeId===line.id ? 'Close editor' : 'Edit'}</span>
        </button>
        <div className="gb-engraving-fields" id={`gb-engraving-fields-${line.id}`} hidden={activeId!==line.id}>
        <label htmlFor={`gb-engraving-${line.id}`}>Engraving {index+1} (optional)
          <input id={`gb-engraving-${line.id}`} type="text" value={line.text} maxLength={MAX_ENGRAVING_CODEPOINTS*2}
            onChange={event=>personal.updateEngraving(line.id,{text:event.target.value})} placeholder="Your name, message or special date" />
        </label>
        <span>{[...line.text].length} / {MAX_ENGRAVING_CODEPOINTS} characters</span>
        {line.text.trim() && <div className="gb-sample-paper" data-color={getEngravingColor(line.colorId).id}
          data-preview-contrast={getEngravingColor(line.colorId).contrast}>
          <p dir="auto" style={{color:getEngravingColor(line.colorId).hex}}>{line.text}</p>
          <small>{getEngravingColor(line.colorId).label} · illustrative color only; exact font and material pending approval</small>
        </div>}
        <p className="gb-help">Choose an engraving color. Appearance on the real material requires owner review.</p>
        <div className="gb-engraving-colors" role="group" aria-label={`Engraving ${index+1} colors`}>
          {ENGRAVING_COLORS.map(color => <button key={color.id} type="button" aria-label={color.label}
            aria-pressed={getEngravingColor(line.colorId).id === color.id}
            onClick={() => personal.updateEngraving(line.id, { colorId: color.id })}>
            <span className="gb-engraving-swatch" style={{ backgroundColor: color.hex }} aria-hidden="true" />
            <span>{color.label}</span>
          </button>)}
        </div>
        <p className="gb-help">Select a lettering style (preview fonts must be licensed before release).</p>
        <div className="gb-lettering-options" role="group" aria-label={`Engraving ${index+1} lettering styles`}>
          {LETTERING_STYLES.map(style=><button key={style.id} type="button"
            aria-pressed={line.styleId===style.id}
            onClick={()=>personal.updateEngraving(line.id,{styleId:style.id})}>{style.customerLabel}</button>)}
        </div>
        </div>
        {index>0&&<button type="button" className="gb-remove-engraving" onClick={()=>personal.removeEngraving(line.id)}>Remove engraving {index+1}</button>}
      </div>)}
      {engravings.length<MAX_ENGRAVING_LINES&&<button type="button" className="button button-secondary" onClick={()=>setExpandedId(personal.addEngraving())}>+ Add another engraving</button>}
      <p className="gb-help">{engravings.length} local engraving drafts · browser performance maximum: {MAX_ENGRAVING_LINES}. This does not approve a physical engraving quantity.</p>
      <p className="gb-help">Preview styles are illustrative; only licensed, priced surfaces approved by the owner can be verified for ordering.</p>
    </div>
    {personal.notice && <p role="alert" className="gb-feedback">{personal.notice}</p>}
  </section>;
}
