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
    <p className="gb-help">Local preview only. These files and words have not been submitted or included in the estimated price.</p>
  </section>;
}

export default function PersonalTouches({ personal }) {
  const {photos, engravings} = personal;
  return <section className="gb-personal-touches" aria-label="Make it personal">
    <div className="gb-personal-group">
      <h3>Your special photos</h3>
      <p>Add up to six photos. Move each print inside or beside the box in the development preview. Placement and physical print size still need review.</p>
      <label className="gb-photo-field">Choose photos · {photos.length} of {MAX_GIFT_PHOTOS}
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
      <p className="gb-help">Your photos stay on this device for this preview; nothing has been uploaded or priced. Reloading this page clears them.</p>
    </div>
    <div className="gb-personal-group">
      <h3>Write something special</h3>
      <p>Names, messages and dates are entered exactly as you want them written. Dates are not reformatted.</p>
      {engravings.map((line,index)=><div className="gb-engraving-entry" key={line.id}>
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
        {index>0&&<button type="button" className="gb-remove-engraving" onClick={()=>personal.removeEngraving(line.id)}>Remove second engraving</button>}
      </div>)}
      {engravings.length<MAX_ENGRAVING_LINES&&<button type="button" className="button button-secondary" onClick={personal.addEngraving}>+ Add another engraving</button>}
      <p className="gb-help">These are internal lettering selections only. Exact font rendering, physical engraving and the per-entry charge are not yet connected to checkout.</p>
    </div>
    {personal.notice && <p role="alert" className="gb-feedback">{personal.notice}</p>}
  </section>;
}
