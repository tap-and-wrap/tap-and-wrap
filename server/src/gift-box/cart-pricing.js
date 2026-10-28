import { z, ZodError } from 'zod';
import { GiftBoxComponentSetting } from '../models/GiftBoxComponentSetting.js';
import { env } from '../config/env.js';
import { assertDatabaseWriteAllowed } from '../config/database-safety.js';
import { deepFreeze, getFixedComponent } from '../../../shared/gift-box/definitions.mjs';
import { cartLineKind, giftCartConfigurationInput } from '../commerce/cart-contract.js';
import { ensureBuilderBackend } from './catalog.js';
import { identifyGiftBoxConfiguration } from './commerce-contract.js';
import { prepareGiftBoxV2CommerceQuote } from './commerce-quote.js';
import { getGiftBoxFulfillmentPolicy, giftBoxFulfillmentPolicyInput } from './fulfillment-policy.js';
import { addPiastres } from './pricing.js';
import { assertInventory } from './inventory.js';
import { builderError } from './validation.js';
import { fingerprint } from '../commerce/pricing.js';
import { loadPublishedGiftBoxPolicies } from './policy-store.js';

let disposablePolicies = null;
function assertDisposablePoliciesOnly() {
  if (process.env.NODE_ENV !== 'test' || env.nodeEnv !== 'test' || env.databaseTarget !== 'local'
    || env.mongoUri || process.env.MONGODB_URI || process.env.CATALOG_IMPORT_STAGING_URI) {
    throw builderError(503, 'GIFT_BOX_TEST_POLICIES_ONLY', 'Synthetic policies require an isolated disposable test database.');
  }
  const target = assertDatabaseWriteAllowed(GiftBoxComponentSetting.db, env);
  if (!target.disposableTest || GiftBoxComponentSetting.db.host !== '127.0.0.1' || GiftBoxComponentSetting.db.name !== 'tap_wrap_catalog_test') {
    throw builderError(503, 'GIFT_BOX_TEST_POLICIES_ONLY', 'Synthetic policies require the exact disposable loopback fixture.');
  }
}
// No HTTP/configuration-flag caller. Bind fixtures to this disposable MongoClient,
// recheck the target on use and never modify the real (empty) policy registry.
export function setGiftBoxCartPoliciesForDisposableTest(policies) {
  assertDisposablePoliciesOnly();
  if (!Array.isArray(policies) || policies.length > 12) throw new Error('Use a bounded synthetic policy set.');
  const parsed = policies.map(policy => giftBoxFulfillmentPolicyInput.parse(policy));
  if (new Set(parsed.map(policy => policy.boxId)).size !== parsed.length) throw new Error('Use one synthetic policy per box.');
  disposablePolicies = { client: GiftBoxComponentSetting.db.getClient(), policies: deepFreeze(parsed) };
}
export function clearGiftBoxCartPoliciesForDisposableTest() {
  assertDisposablePoliciesOnly(); disposablePolicies = null;
}
function trustedPolicy(boxId, context) {
  if (disposablePolicies?.client === GiftBoxComponentSetting.db.getClient()) {
    assertDisposablePoliciesOnly();
    const fixture = disposablePolicies.policies.find(policy => policy.boxId === boxId);
    if (fixture) return fixture;
  }
  return context?.policies?.get(boxId) ?? getGiftBoxFulfillmentPolicy(boxId);
}
export function giftCartError(error) {
  return error instanceof ZodError ? builderError(409, 'GIFT_BOX_CONFIGURATION_INVALID', 'This saved gift configuration is no longer supported. Remove it and review the builder.') : error;
}
export async function createGiftBoxCartPricingContext(lines, { session } = {}) {
  const gifts = lines.filter(line => line.kind === 'gift_box_v2');
  if (!gifts.length) return null;
  try { await ensureBuilderBackend(); }
  catch (error) { if (error.status && error.status < 500) return { error }; throw error; }
  const componentIds = new Set(), boxIds = new Set();
  for (const line of gifts) {
    const parsed = giftCartConfigurationInput.safeParse(line.configuration);
    if (!parsed.success) continue;
    const { selection } = parsed.data;
    boxIds.add(selection.boxId);
    [selection.boxId, selection.ribbonId, selection.giftCard?.componentId, ...selection.items.map(item => item.componentId)]
      .filter(Boolean).forEach(id => componentIds.add(id));
  }
  const savedSettings = componentIds.size ? await GiftBoxComponentSetting.find({ componentId: { $in: [...componentIds] } }).session(session || null).lean().maxTimeMS(3000) : [];
  const policies = await loadPublishedGiftBoxPolicies([...boxIds], { session });
  return { savedSettings, settings: new Map(savedSettings.map(setting => [setting.componentId, setting])), policies };
}

export function giftBoxCartSummary(configuration, savedSettings = []) {
  const parsed = giftCartConfigurationInput.safeParse(configuration);
  if (!parsed.success) return null;
  const settings = new Map(savedSettings.map(setting => [setting.componentId, setting]));
  const name = id => {
    const value = settings.get(id)?.displayName;
    return typeof value === 'string' && value.length <= 120 && value.isWellFormed() && !/[\u0000-\u001f\u007f]/u.test(value) && value.trim() ? value : 'Component unavailable';
  };
  const { selection } = parsed.data;
  return { box: { componentId: selection.boxId, displayName: name(selection.boxId) },
    items: selection.items.map(item => ({ componentId: item.componentId, category: getFixedComponent(item.componentId).category, displayName: name(item.componentId), quantity: item.quantity })),
    ribbon: { componentId: selection.ribbonId, displayName: name(selection.ribbonId), colorHex: getFixedComponent(selection.ribbonId).approvedColorHex },
    giftCard: selection.giftCard ? { selected: true, message: selection.giftCard.message } : { selected: false },
    artwork: { status: 'unavailable' } };
}

export function quoteGiftBoxCartLine(line, context, { stored = true } = {}) {
  try {
    cartLineKind(line);
    if (context?.error) throw context.error;
    const { configuration, configurationId } = identifyGiftBoxConfiguration(giftCartConfigurationInput.parse(line.configuration));
    if (stored && (!z.uuid().safeParse(line.id).success || line.configurationId !== configurationId || line.identity !== configurationId)) {
      throw builderError(409, 'GIFT_BOX_CONFIGURATION_STALE', 'This saved gift configuration needs review. Remove it and create it again.');
    }
    const policy = trustedPolicy(configuration.selection.boxId, context);
    const quote = prepareGiftBoxV2CommerceQuote({ configuration, quantity: line.quantity }, context?.savedSettings || [], { fulfillmentPolicy: policy });
    // An owner attestation publishes compatibility, not a commerce launch. A
    // valid persisted policy still cannot open public gift cart additions.
    // Positive integration remains the existing exact-target test composition.
    if (!stored) {
      if (disposablePolicies?.client !== GiftBoxComponentSetting.db.getClient()) throw builderError(409, 'GIFT_BOX_CART_LAUNCH_DISABLED', 'Gift-box Add to Cart remains unavailable until a separately approved release.');
      assertDisposablePoliciesOnly();
    }
    const giftComponents = quote.components.map(component => ({ ...component,
      priceApprovedBy: String(context.settings.get(component.componentId).priceApprovedBy),
      priceApprovedAt: new Date(context.settings.get(component.componentId).priceApprovedAt),
    }));
    return { id: line.id, kind: 'gift_box_v2', identity: configurationId, configurationId, configuration,
      name: 'Build Your Gift Box', quantity: quote.quantity, unitPricePiastres: quote.unitPricePiastres, lineTotalPiastres: quote.lineTotalPiastres,
      giftBox: giftBoxCartSummary(configuration, context.savedSettings), giftComponents,
      giftFulfillment: quote.fulfillment, giftPolicyHash: fingerprint(giftBoxFulfillmentPolicyInput.parse(policy)),
      uploadIds: [], inventoryClaims: [], valid: true, checkoutAllowed: false, promotionsEligible: false };
  } catch (error) { throw giftCartError(error); }
}

// Pure construction used only after the guarded internal checkout quote. Public
// cart responses retain no executable inventory claims or private approval data.
export function giftBoxOrderInventoryClaims(quote) {
  return quote.giftComponents.map(component => ({ kind: 'gift_box_component', id: component.componentId,
    mode: component.inventory.mode, quantity: component.quantityForLine, expectedRevision: component.settingsRevision,
    unitPricePiastres: component.unitPricePiastres, priceApproval: component.priceApproval,
    priceApprovedBy: component.priceApprovedBy, priceApprovedAt: component.priceApprovedAt,
  }));
}

export function giftBoxCartStockErrors(quotes, context) {
  const demand = new Map(), errors = new Map();
  for (const quote of quotes.filter(line => line.kind === 'gift_box_v2' && line.valid)) {
    for (const component of quote.giftComponents) {
      const entry = demand.get(component.componentId) || { quantity: 0, lineIds: [] };
      entry.quantity = addPiastres(entry.quantity, component.quantityForLine);
      entry.lineIds.push(quote.id);
      demand.set(component.componentId, entry);
    }
  }
  for (const [id, entry] of demand) {
    try { assertInventory(getFixedComponent(id), context.settings.get(id), entry.quantity); }
    catch (error) { for (const lineId of entry.lineIds) errors.set(lineId, error); }
  }
  return errors;
}

export function publicGiftBoxCartLine(quote) {
  return { id: quote.id, kind: 'gift_box_v2', name: 'Build Your Gift Box', quantity: quote.quantity,
    valid: quote.valid, ...(quote.error ? { error: quote.error, errorCode: quote.errorCode } : {}),
    unitPricePiastres: quote.valid ? quote.unitPricePiastres : null, lineTotalPiastres: quote.valid ? quote.lineTotalPiastres : null,
    giftBox: quote.giftBox, checkoutAllowed: false, promotionsEligible: false };
}
