import Select from '../components/form/Select.jsx';
import { useState, useId } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { STICKER_STYLES, stickerStyle } from '../../../shared/gift-box/sticker-styles.mjs';
import { ENGRAVING_COLORS, getEngravingColor } from '../../../shared/gift-box/lettering-styles.mjs';
import { eligibleGiftBoxOptions } from './personalization-submission.mjs';
import { money } from '../commerce/api.js';

export default function PersonalizationEditor({ personal, boxId, options, printSelections, onPrintSelection, onRemovePhoto }) {
  const [language, setLanguage] = useState('en');
  const tabsId = useId();
  const prints = eligibleGiftBoxOptions(options, boxId, 'photo_print');
  const stickers = options.filter(option => option.kind === 'box_sticker' && option.enabled && option.available && option.boxIds?.includes(boxId));
  const sticker = personal.sticker, selectedOption = stickers.find(option => option.optionId === sticker.optionId) || stickers[0];
  const availableStyles = selectedOption ? STICKER_STYLES.filter(style => selectedOption.approvedStyleIds?.includes(style.id)) : STICKER_STYLES;
  return <div className="gb-personal-editor">
    <section className="gb-personal-section" aria-labelledby="gb-photos-heading"><header><div><p className="eyebrow">Optional</p><h3 id="gb-photos-heading">Add your photos</h3></div><small>{prints[0] ? `${money(prints[0].pricePiastres)} each` : 'Currently unavailable'}</small></header>
      <div className="gb-personal-body"><label className="gb-upload-tile"><ImagePlus size={28} aria-hidden="true"/><span>Choose your photos</span><input type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="Choose your photos" onChange={event => { personal.addPhotos(event.target.files); event.target.value = ''; }}/></label>
      <div className="gb-photo-thumbnails">{personal.photos.map((photo,index) => <div key={photo.id}><img src={photo.url} alt={`Photo ${index + 1}`}/><button type="button" aria-label={`Remove photo ${index + 1}`} onClick={() => onRemovePhoto(photo.id, `Photo ${index + 1}`)}><X size={16}/></button>
        {prints.length > 1 && <label>Print type<Select value={printSelections[photo.id] || ''} onChange={event => onPrintSelection(photo.id,event.target.value)}><option value="">Choose print</option>{prints.map(option => <option key={option.optionId} value={option.optionId}>{option.displayName} - {money(option.pricePiastres)}</option>)}</Select></label>}
      </div>)}</div></div>
    </section>
    <section className="gb-personal-section" aria-labelledby="gb-sticker-heading"><header><div><p className="eyebrow">Optional</p><h3 id="gb-sticker-heading">Add a personalized sticker</h3></div><small>{selectedOption ? money(selectedOption.pricePiastres) : 'Currently unavailable'}</small></header>
      <div className="gb-personal-body"><fieldset className="gb-sticker-editor" disabled={!selectedOption}><legend className="sr-only">Sticker appearance</legend>
        <div className={`gb-sticker-proof ${getEngravingColor(sticker.colorId).contrast === 'dark' ? 'is-dark' : ''}`} dir="auto" style={{ color: getEngravingColor(sticker.colorId).hex, fontFamily: `"${stickerStyle(sticker.styleId)?.fontFamily}"` }}>{sticker.text || 'With love'}</div>
        <label htmlFor="gb-sticker-text">Write a name, special date, or heartfelt message</label><input id="gb-sticker-text" type="text" placeholder="e.g. Nour, 14 February, or Always in my heart" dir="auto" maxLength={160} value={sticker.text} onChange={event => personal.updateSticker({ text:event.target.value,enabled:Boolean(event.target.value.trim()),optionId:selectedOption?.optionId || null })}/>
        <fieldset className="gb-sticker-colors"><legend>Color</legend>{ENGRAVING_COLORS.filter(color => !selectedOption || selectedOption.approvedColorIds?.includes(color.id)).map(color => <label key={color.id} title={color.label}><input type="radio" name="sticker-color" aria-label={color.label} value={color.id} checked={sticker.colorId === color.id} onChange={() => personal.updateSticker({ colorId: color.id })}/><span style={{ background: color.hex, color:color.contrast === 'light' ? '#fff' : '#62483F' }} aria-hidden="true">{sticker.colorId === color.id ? '✓' : ''}</span></label>)}</fieldset>
        <div className="gb-font-tabs" role="tablist" aria-label="Lettering language">{[['en','English'],['ar','Arabic']].map(([id,label]) => <button type="button" role="tab" id={`${tabsId}-${id}`} aria-selected={language === id} aria-controls={`${tabsId}-panel`} tabIndex={language === id ? 0 : -1} key={id} onClick={() => setLanguage(id)} onKeyDown={event => { if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'en' : event.key === 'End' ? 'ar' : language === 'en' ? 'ar' : 'en'; setLanguage(next); document.getElementById(`${tabsId}-${next}`)?.focus(); } }}>{label}</button>)}</div>
        <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${language}`}><fieldset className="gb-sticker-style-list"><legend className="sr-only">Lettering style</legend><div>{STICKER_STYLES.filter(style => style.language === language).map(style => <button type="button" key={style.id} disabled={!availableStyles.includes(style)} aria-label={style.label} aria-pressed={sticker.styleId === style.id} onClick={() => personal.updateSticker({ styleId: style.id })}><span lang={style.language} dir="auto" style={{ fontFamily: `"${style.fontFamily}"`, color: '#62483F' }}>{sticker.text || (style.language === 'ar' ? '\u0628\u0643\u0644 \u0627\u0644\u062d\u0628' : 'With love')}</span></button>)}</div></fieldset></div>
        {sticker.enabled && <button type="button" className="gb-edit-gift" onClick={()=>personal.updateSticker({enabled:false,text:''})}>Remove sticker</button>}
      </fieldset></div>
    </section>
    {personal.notice && <p role="alert" className="gb-feedback">{personal.notice}</p>}
  </div>;
}
