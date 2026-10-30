import { getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import { countBuilderCategories, resolveBoxCategoryLimits } from '../../../shared/gift-box/selection-limits.mjs';
import { initialStudyPosition, positionStudyItem, studyFootprint } from './placement-study.mjs';
export { STUDY_SIZES } from './placement-study.mjs';

export const initialArrangement = () => ({ boxId: null, instances: [], ribbonId: null, cardEnabled: false, message: '' });
export const componentLabel = item => item.displayName || `${item.category === 'flower' ? 'Rose' : item.category[0].toUpperCase() + item.category.slice(1)} ${item.componentId.replace(/^[^-]+-/, '')} · name pending`;
export const counts = instances => instances.reduce((result, item) => ({ ...result, [item.componentId]: (result[item.componentId] || 0) + 1 }), {});
export const codePointCount = text => Array.from(text).length;
export function validMessage(text) {
  return text.isWellFormed() && codePointCount(text) <= 500 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text);
}
// Illustrative layout-study sizes only. They never become approved physical scale.
export function clampPosition(position, size) {
  return { x: Math.min(1 - size, Math.max(0, position.x)), y: Math.min(1 - size, Math.max(0, position.y)) };
}
export function componentCanSupply(component, quantity = 1) {
  if (!component?.availableForEstimate || component.available !== true) return false;
  if (component.category === 'ribbon') return component.inventoryMode === 'status_only';
  if (component.inventoryMode === 'made_to_order') return true;
  return component.inventoryMode === 'tracked' && Number.isSafeInteger(component.inventoryQuantity) && component.inventoryQuantity >= quantity;
}
export function canAdd(state, id, component, publishedBoxLimits) {
  const category = getFixedComponent(id)?.category;
  const quantity = counts(state.instances)[id] || 0;
  const categoryCounts = countBuilderCategories(state.instances, item => getFixedComponent(item.componentId)?.category);
  const limits = resolveBoxCategoryLimits(state.boxId, publishedBoxLimits);
  return Boolean(state.boxId && ['flower', 'plush', 'chocolate'].includes(category) && categoryCounts[category] < limits[category]
    && quantity < 100 && state.instances.length < 200 && (component === undefined || componentCanSupply(component, quantity + 1)));
}
export function changeArrangement(state, action) {
  switch (action.type) {
    case 'box': return action.id !== state.boxId && getFixedComponent(action.id)?.category === 'box' ? { ...state, boxId: action.id,
      instances: state.instances.map(item => ({ ...item, ...studyFootprint(action.id,item.componentId), x: null, y: null, placementZone:null, regionId:null, layerBase:null, zone: 'unplaced' })) } : state;
    case 'add': {
      if (!canAdd(state, action.id, action.component, action.boxLimits) || state.instances.some(item => item.id === action.instanceId)) return state;
      const footprint=studyFootprint(state.boxId,action.id,action.reviewSize);
      const item={id:action.instanceId,componentId:action.id,...footprint};
      const existingCount=state.instances.filter(entry=>getFixedComponent(entry.componentId).category===getFixedComponent(action.id).category).length;
      return { ...state, instances: [...state.instances, {...item,
        ...(action.study ? initialStudyPosition(state.boxId,item,existingCount) : {x:null,y:null}),zone:action.study?'layout-study':'unplaced' }] };
    }
    case 'move': return { ...state, instances: state.instances.map(item => item.id === action.id && action.study
      ? { ...item, ...positionStudyItem(state.boxId,item,action.position), zone: 'layout-study' } : item) };
    case 'study-zone': return !action.study ? state : {...state,instances:state.instances.map(item=>item.id===action.id&&getFixedComponent(item.componentId)?.category==='plush'
      ? {...item,...initialStudyPosition(state.boxId,item,0,action.zone==='beside'?'beside':'inside'),zone:'layout-study'} :item)};
    case 'remove': return { ...state, instances: state.instances.filter(item => item.id !== action.id) };
    case 'clear': return { ...state, instances: [] };
    case 'ribbon': return { ...state, ribbonId: action.id };
    case 'card': return { ...state, cardEnabled: action.enabled };
    case 'message': return { ...state, message: action.message };
    default: return state;
  }
}
export function arrangementReducer(history, action) {
  if (action.type === 'undo') {
    if (!history.past.length) return history;
    return { present: history.past.at(-1), past: history.past.slice(0, -1) };
  }
  const next = changeArrangement(history.present, action);
  if (next === history.present || JSON.stringify(next) === JSON.stringify(history.present)) return history;
  return { present: next, past: [...history.past.slice(-29), history.present] };
}
export function estimateSelection(state, cardId) {
  if (!state.boxId || (state.cardEnabled && (!cardId || !validMessage(state.message)))) return null;
  return { boxId: state.boxId, items: Object.entries(counts(state.instances)).sort(([a], [b]) => a.localeCompare(b)).map(([componentId, quantity]) => ({ componentId, quantity })),
    ribbonId: state.ribbonId, giftCard: state.cardEnabled ? { componentId: cardId, message: state.message } : null };
}
