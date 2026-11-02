import { eligibleGiftBoxOptions } from './personalization-submission.mjs';
import { money } from '../commerce/api.js';

// Show only priced, enabled options for this exact box. Choosing an option does
// not upload or transmit any customer file or engraving text.
export default function PersonalizationOptions({ boxId, personal, options, printSelections, onPrintSelection,
  engravingSelections, onEngravingSelection, loading, error, enabled }) {
  if (!personal.hasContent) return null;
  if (!enabled) return <p className="gb-help" role="status">Photo prints and engravings are still previews. The owner must enable personalized ordering before private verification is available.</p>;
  if (loading) return <p className="gb-help" role="status">Loading approved print and engraving choices…</p>;
  if (error) return <p className="gb-feedback" role="alert">Personalization prices are currently unavailable. No photos have been uploaded.</p>;
  return <section className="gb-personal-group" aria-label="Personalization options">
    <h3>Print and engraving choices</h3>
    <p className="gb-help">Only priced and approved options are shown. The current private storage quota allows at most 20 photos per customer session; this is not a physical box limit. Your photos stay on this device until you choose Add to Cart. The server then verifies the final prices before saving your gift.</p>
    {personal.photos.map((photo,index) => {
      const choices=eligibleGiftBoxOptions(options,boxId,'photo_print');
      return <label className="gb-personal-option" key={photo.id}>Photo {index+1} · Print type
        <select value={printSelections[photo.id] || ''} onChange={event=>onPrintSelection(photo.id,event.target.value)}>
          <option value="">Choose an approved print type</option>
          {choices.map(choice=><option key={choice.optionId} value={choice.optionId}>{choice.displayName} · {money(choice.pricePiastres)}</option>)}
        </select>
        {!choices.length && <small>Print options for this box have not been approved.</small>}
      </label>;
    })}
    {personal.engravings.filter(line=>line.text.trim()).map((line,index)=>{
      const choices=eligibleGiftBoxOptions(options,boxId,'engraving_surface',line);
      return <label className="gb-personal-option" key={line.id}>Engraving {index+1} · Surface
        <select value={engravingSelections[line.id] || ''} onChange={event=>onEngravingSelection(line.id,event.target.value)}>
          <option value="">Choose an approved surface</option>
          {choices.map(choice=><option key={choice.optionId} value={choice.optionId}>{choice.displayName} · {money(choice.pricePiastres)}</option>)}
        </select>
        {!choices.length && <small>Select a licensed lettering style and eligible color, or ask the owner to configure this surface.</small>}
      </label>;
    })}
  </section>;
}
