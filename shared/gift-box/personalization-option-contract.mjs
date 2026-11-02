import { getFixedComponent } from './definitions.mjs';
import { LETTERING_STYLES, ENGRAVING_COLORS } from './lettering-styles.mjs';

export const GIFT_BOX_OPTION_KINDS = Object.freeze(['photo_print','engraving_surface']);
const styleIds = new Set(LETTERING_STYLES.map(v => v.id));
const colorIds = new Set(ENGRAVING_COLORS.map(v => v.id));
const text = v => typeof v === 'string' && v.isWellFormed() && v.trim() === v && v.length > 0 && v.length <= 120 && !/[\u0000-\u001f\u007f]/u.test(v);
const slug = v => typeof v === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(v);
const array = (value, max, allowed) => Array.isArray(value) && value.length <= max
  && new Set(value).size === value.length && value.every(v => allowed(v));
const fail = () => { const e = new Error('Invalid Gift Box personalization option.'); e.status = 400; e.code = 'GIFT_BOX_OPTION_INVALID'; throw e; };

// Strict public/admin input: no revision, approval metadata, price author, private key or CSS supplied by customer.
export function parseGiftBoxPersonalizationOptionPatch(raw, { optionId, existingKind = null } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !slug(optionId)) fail();
  const keys = ['expectedRevision','kind','displayName','enabled','available','pricePiastres',
    'confirmComplimentary','boxIds','approvedStyleIds','approvedColorIds','fontLicensesConfirmed'];
  if (Object.keys(raw).some(key => !keys.includes(key)) || !Object.hasOwn(raw,'expectedRevision')
    || !Number.isSafeInteger(raw.expectedRevision) || raw.expectedRevision < 0) fail();
  if (raw.kind !== undefined && !GIFT_BOX_OPTION_KINDS.includes(raw.kind)) fail();
  if (existingKind && raw.kind && raw.kind !== existingKind) fail();
  if (!existingKind && !raw.kind) fail();
  const kind = existingKind || raw.kind;
  if (raw.displayName !== undefined && !text(raw.displayName)) fail();
  if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') fail();
  if (raw.available !== undefined && typeof raw.available !== 'boolean') fail();
  if (raw.pricePiastres !== undefined && raw.pricePiastres !== null
    && (!Number.isSafeInteger(raw.pricePiastres) || raw.pricePiastres < 0)) fail();
  if (raw.confirmComplimentary !== undefined && raw.confirmComplimentary !== true) fail();
  if (raw.pricePiastres === 0 ? raw.confirmComplimentary !== true : raw.confirmComplimentary !== undefined) fail();
  if (raw.boxIds !== undefined && (!array(raw.boxIds,12, v => getFixedComponent(v)?.category === 'box') || raw.boxIds.length === 0)) fail();
  if (raw.approvedStyleIds !== undefined && !array(raw.approvedStyleIds,12,v => styleIds.has(v))) fail();
  if (raw.approvedColorIds !== undefined && !array(raw.approvedColorIds,5,v => colorIds.has(v))) fail();
  if (raw.fontLicensesConfirmed !== undefined && typeof raw.fontLicensesConfirmed !== 'boolean') fail();
  if (kind === 'photo_print' && ['approvedStyleIds','approvedColorIds','fontLicensesConfirmed']
    .some(key => Object.hasOwn(raw,key))) fail();
  const mutable = keys.filter(key => !['expectedRevision','kind','confirmComplimentary'].includes(key));
  if (!mutable.some(key => Object.hasOwn(raw,key))) fail();
  return Object.freeze({ ...raw, kind });
}

export function giftBoxOptionIsOrderPriced(option) {
  if (!option || !GIFT_BOX_OPTION_KINDS.includes(option.kind) || !slug(option.optionId)
    || option.enabled !== true || option.available !== true || !text(option.displayName)
    || !Number.isSafeInteger(option.pricePiastres) || option.pricePiastres < 0
    || (option.pricePiastres === 0 ? option.priceApproval !== 'complimentary' : option.priceApproval !== 'paid')
    || !option.priceApprovedBy || !(option.priceApprovedAt instanceof Date) || Number.isNaN(option.priceApprovedAt.getTime())
    || !array(option.boxIds,12,v => getFixedComponent(v)?.category === 'box') || !option.boxIds.length) return false;
  if (option.kind === 'engraving_surface' && (option.fontLicensesConfirmed !== true
    || !array(option.approvedStyleIds,12,v => styleIds.has(v)) || !option.approvedStyleIds.length
    || !array(option.approvedColorIds,5,v => colorIds.has(v)) || !option.approvedColorIds.length)) return false;
  return true;
}
