import { parseDecimalPiastres, decimalInput } from '../commerce/money-input.js';
import { parseGiftBoxPersonalizationOptionPatch } from '../../../shared/gift-box/personalization-option-contract.mjs';

const list = value => Array.isArray(value) ? value : [];
const same = (a,b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

export function giftBoxOptionDraft(option) {
  return {
    displayName: option.displayName || '',
    price: decimalInput(option.configuredPricePiastres),
    enabled: option.enabled === true,
    available: option.available === true,
    boxIds: [...list(option.boxIds)],
    approvedStyleIds: [...list(option.approvedStyleIds)],
    approvedColorIds: [...list(option.approvedColorIds)],
    fontLicensesConfirmed: option.fontLicensesConfirmed === true,
    confirmComplimentary: false,
  };
}
export function newGiftBoxOption(optionId, kind) {
  if (!/^[a-z][a-z0-9-]{0,79}$/.test(optionId) || !['photo_print','engraving_surface'].includes(kind))
    throw new Error('Use a lowercase option ID with letters, numbers and hyphens.');
  return { optionId, kind, displayName: '', configuredPricePiastres: null, enabled: false, available: false,
    boxIds: [], approvedStyleIds: [], approvedColorIds: [], fontLicensesConfirmed: false, revision: 0, isDraftNew: true };
}

// Never submit approval timestamps, file IDs, server revisions or customer fields.
// The existing positive price is NOT re-approved merely because another field changes.
export function giftBoxOptionEditorPayload(record, draft) {
  if (!record || !Number.isSafeInteger(record.revision) || record.revision < 0)
    throw new Error('Reload the saved option before editing.');
  const body = { expectedRevision: record.revision };
  const name = draft.displayName;
  if (record.isDraftNew || name !== record.displayName) body.displayName = name;
  if (draft.enabled !== record.enabled) body.enabled = draft.enabled;
  if (draft.available !== record.available) body.available = draft.available;
  if (!same(draft.boxIds, list(record.boxIds))) body.boxIds = [...draft.boxIds];
  if (record.kind === 'engraving_surface') {
    if (!same(draft.approvedStyleIds, list(record.approvedStyleIds))) body.approvedStyleIds = [...draft.approvedStyleIds];
    if (!same(draft.approvedColorIds, list(record.approvedColorIds))) body.approvedColorIds = [...draft.approvedColorIds];
    if (draft.fontLicensesConfirmed !== record.fontLicensesConfirmed) body.fontLicensesConfirmed = draft.fontLicensesConfirmed;
  }
  const pricePiastres = parseDecimalPiastres(draft.price);
  if (pricePiastres !== record.configuredPricePiastres) {
    body.pricePiastres = pricePiastres;
    if (pricePiastres === 0) {
      if (draft.confirmComplimentary !== true) throw new Error('Explicitly confirm complimentary pricing before saving zero.');
      body.confirmComplimentary = true;
    }
  }
  if (record.isDraftNew) body.kind = record.kind;
  if (Object.keys(body).length === 1) throw new Error('Nothing has changed.');
  return parseGiftBoxPersonalizationOptionPatch(body, {
    optionId: record.optionId, existingKind: record.isDraftNew ? null : record.kind,
  });
}
