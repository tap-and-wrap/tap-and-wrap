import { useEffect, useId, useState } from 'react';
import { Check } from 'lucide-react';
import { FONT_REGISTRY, APPEARANCES } from '../../../shared/engraving/definitions.mjs';
import './lettering-controls.css';
import './lettering-fonts.css';

export const appearanceHex = { black: '#242020', white: '#ffffff', grey: '#888888' };
export default function LetteringControls({ text, fontId, color, fontIds, colorIds = APPEARANCES, onChange }) {
  const id = useId(), selected = FONT_REGISTRY.find(font => font.id === fontId);
  const [tab, setTab] = useState(null);
  const language = tab || selected?.language || 'en';
  const arabic = /\p{Script=Arabic}/u.test(text);
  useEffect(() => { if (arabic) setTab('ar'); }, [arabic]);
  const fonts = FONT_REGISTRY.filter(font => fontIds.includes(font.id));
  return <div className="tw-lettering">
    <fieldset className="tw-appearance"><legend>Text appearance</legend>{colorIds.map(value => <label key={value} title={value}><input type="radio" name={`${id}-appearance`} aria-label={value} checked={color === value} onChange={() => onChange({ color: value })}/><span aria-hidden="true" style={{ background: appearanceHex[value], color: value === 'white' ? '#62483f' : '#fff' }}>{color === value && <Check size={17}/>}</span></label>)}</fieldset>
    <div className="tw-lettering-tabs" role="tablist" aria-label="Lettering language">{[['en', 'English'], ['ar', 'Arabic']].map(([value, label]) => <button key={value} type="button" role="tab" id={`${id}-${value}`} aria-controls={`${id}-panel`} aria-selected={language === value} tabIndex={language === value ? 0 : -1} onClick={() => setTab(value)} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'en' : event.key === 'End' ? 'ar' : language === 'en' ? 'ar' : 'en'; setTab(next); document.getElementById(`${id}-${next}`)?.focus(); } }}>{label}</button>)}</div>
    <div className="tw-lettering-gallery" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${language}`}>
      {fonts.filter(font => font.language === language).map((font, index) => <button type="button" key={font.id} aria-label={`${language === 'ar' ? 'Arabic' : 'English'} style ${index + 1}`} aria-pressed={fontId === font.id} disabled={arabic && font.language !== 'ar'} onClick={() => onChange({ fontId: font.id })}><span lang={font.language} dir={font.language === 'ar' ? 'rtl' : 'ltr'} style={{ fontFamily: `"${font.family}"` }}>{language === 'ar' ? '\u0628\u0643\u0644 \u0627\u0644\u062d\u0628' : 'With love'}</span></button>)}
      {!fonts.some(font => font.language === language) && <p>No approved {language === 'ar' ? 'Arabic' : 'English'} styles for this item.</p>}
    </div>

  </div>;
}
