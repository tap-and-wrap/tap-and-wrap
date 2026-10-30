import Artwork from './Artwork.jsx';
import RibbonBow from './RibbonBow.jsx';
import { componentCanSupply, componentLabel } from './state.mjs';
import { money } from '../commerce/api.js';
import { ASSET_ISSUES } from '../../../shared/gift-box/definitions.mjs';

export default function Options({ category, components, revealed, onReveal, onChoose, selectedId, quantities, boxSelected, canAddItem }) {
  return <><div className={`gb-options gb-options-${category}`} aria-label={`${category} options`}>
    {components.slice(0, revealed).map(item => {
      const label = componentLabel(item);
      const defective = ASSET_ISSUES.some(issue => issue.componentId === item.componentId && issue.blocksDevelopmentCopy);
      const unavailable = !componentCanSupply(item) || defective;
      const repeatable = !['box', 'ribbon'].includes(category);
      const limitReached = repeatable && boxSelected && !unavailable && !canAddItem(item);
      const disabled = unavailable || (repeatable && !boxSelected) || limitReached;
      return <button className={`gb-option ${selectedId === item.componentId ? 'is-selected' : ''}`} type="button" key={item.componentId}
        disabled={disabled} aria-label={`${category === 'box' || category === 'ribbon' ? 'Choose' : 'Add'} ${label}`}
        aria-pressed={category === 'box' || category === 'ribbon' ? selectedId === item.componentId : undefined} onClick={() => onChoose(item.componentId)}>
        {['box', 'flower', 'plush'].includes(category) && <span className="gb-option-photo"><Artwork key={item.componentId} componentId={item.componentId} role="selection"/></span>}
        {category === 'ribbon' && import.meta.env.DEV && <span className="gb-option-photo gb-ribbon-option-photo"><RibbonBow key={item.componentId} componentId={item.componentId}/></span>}
        {category === 'ribbon' && /^#[\da-f]{6}$/i.test(item.approvedColorHex || '') && <span className="gb-ribbon-color" aria-hidden="true" style={{ backgroundColor: item.approvedColorHex }}/>}
        <span className="gb-option-name">{label}</span><span className="gb-option-price">{defective ? 'Artwork under review' : unavailable ? item.inventoryStatus === 'insufficient_stock' || item.inventoryQuantity === 0 && item.inventoryMode === 'tracked' ? 'Unavailable · out of stock' : 'Unavailable · approval pending' : money(item.pricePiastres)}</span>
        {!unavailable && item.inventoryMode === 'tracked' && <span className="gb-option-stock">{limitReached && (quantities[item.componentId] || 0) >= item.inventoryQuantity ? 'All available stock added' : `${item.inventoryQuantity} available`}</span>}
        {limitReached && (item.inventoryMode !== 'tracked' || (quantities[item.componentId] || 0) < item.inventoryQuantity) && <span className="gb-option-stock">Selection limit reached</span>}
        {(selectedId === item.componentId || quantities[item.componentId]) && <span className="gb-option-check">{selectedId === item.componentId ? '✓ Selected' : `${quantities[item.componentId]} added`}</span>}
      </button>;
    })}
  </div>{revealed < components.length && <button className="button button-secondary gb-load-more" type="button" onClick={onReveal}>Load More <span>({Math.min(12, components.length - revealed)} more)</span></button>}
  {!components.length && <p className="gb-empty">{category === 'ribbon' ? 'Ribbon colors are awaiting approval.' : 'This collection is awaiting approval.'}</p>}</>;
}
