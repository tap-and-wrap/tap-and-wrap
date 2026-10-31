import { parseGiftBoxPersonalizationIntent } from '../../../shared/gift-box/personalization-intent.mjs';
import { getFixedComponent } from '../../../shared/gift-box/definitions.mjs';

const oid = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
function reject(code) { const error = new Error('Gift Box personalization is not ready for ordering. Review the selected options and uploaded images.'); error.code = code; error.status = 409; throw error; }
const goodPrice = record => record && record.enabled === true && record.available === true
  && Number.isSafeInteger(record.pricePiastres) && record.pricePiastres >= 0
  && (record.pricePiastres === 0 ? record.priceApproval === 'complimentary' : record.priceApproval === 'paid')
  && oid(String(record.priceApprovedBy || '')) && record.priceApprovedAt instanceof Date && !Number.isNaN(record.priceApprovedAt.getTime())
  && Number.isSafeInteger(record.__v) && record.__v >= 0;
const addMoney = (a,b) => { if (!Number.isSafeInteger(a+b) || a+b < 0) reject('GIFT_BOX_PERSONALIZATION_TOTAL_INVALID'); return a+b; };
/**
 * Pure, fail-closed calculator for server-verified private images and SAVED priced options.
 * The caller must re-read these facts in the same transaction used to make the cart/order.
 * This is NOT a permission to accept physical packing, unlicensed fonts, or unpriced options.
 */
export function priceGiftBoxPersonalization({ intent: raw, boxId, owner, uploads, options, cartId = null }) {
  if (getFixedComponent(boxId)?.category !== 'box' || typeof owner !== 'string' || !/^(?:user:[a-f0-9]{24}|guest:[a-f0-9]{64})$/i.test(owner)) reject('GIFT_BOX_PERSONALIZATION_SCOPE_INVALID');
  let intent;
  try { intent = parseGiftBoxPersonalizationIntent(raw); } catch { reject('GIFT_BOX_PERSONALIZATION_INVALID'); }
  if (!Array.isArray(uploads) || !Array.isArray(options)) reject('GIFT_BOX_PERSONALIZATION_SOURCE_INVALID');
  const byUpload = new Map();
  for (const upload of uploads) {
    const id=String(upload?._id||upload?.id||'');
    if (!oid(id) || byUpload.has(id)) reject('GIFT_BOX_UPLOAD_INVALID');
    byUpload.set(id,upload);
  }
  const byOption=new Map();
  for (const option of options) {
    if (!option || typeof option.optionId !== 'string' || byOption.has(option.optionId)) reject('GIFT_BOX_PRINT_OPTION_INVALID');
    byOption.set(option.optionId,option);
  }
  if (byUpload.size !== intent.photoPrints.length) reject('GIFT_BOX_UPLOAD_UNEXPECTED');
  let amount=0;
  const photoPrints=intent.photoPrints.map(photo => {
    const upload=byUpload.get(photo.uploadId);
    if (!upload || String(upload.owner)!==owner || upload.purpose!=='gift_box_photo' || upload.giftBoxId!==boxId
      || upload.fieldKey!=='gift_box_photo' || upload.state!=='complete' || !(upload.expiresAt instanceof Date)
      || upload.expiresAt<=new Date() || (upload.cartId && (!cartId || String(upload.cartId)!==String(cartId)))) reject('GIFT_BOX_UPLOAD_INVALID');
    const option=byOption.get(photo.printOptionId);
    if (option?.kind!=='photo_print' || !goodPrice(option)) reject('GIFT_BOX_PRINT_PRICE_PENDING');
    amount=addMoney(amount,option.pricePiastres);
    return { uploadId:photo.uploadId, printOptionId:option.optionId, zone:photo.zone,x:photo.x,y:photo.y,
      pricePiastres:option.pricePiastres, optionRevision:option.__v,
      priceApprovedAt:option.priceApprovedAt.toISOString() };
  });
  const engravings=intent.engravings.map(line => {
    const option=byOption.get(line.surfaceOptionId);
    if (option?.kind!=='engraving_surface' || !goodPrice(option) || option.fontLicensesConfirmed !== true
      || !Array.isArray(option.approvedStyleIds) || !option.approvedStyleIds.includes(line.styleId)
      || !Array.isArray(option.approvedColorIds) || !option.approvedColorIds.includes(line.colorId))
      reject('GIFT_BOX_ENGRAVING_PRICE_PENDING');
    amount=addMoney(amount,option.pricePiastres);
    return { ...line, pricePiastres:option.pricePiastres, optionRevision:option.__v,
      priceApprovedAt:option.priceApprovedAt.toISOString() };
  });
  return Object.freeze({ version:intent.version, photoPrints:Object.freeze(photoPrints),engravings:Object.freeze(engravings),
    uploadIds:Object.freeze(photoPrints.map(photo=>photo.uploadId)), unitAdjustmentPiastres:amount,
    // The caller still must verify policy/fit and actual prices before placing an order.
    physicallyApproved:false, checkoutAuthorized:false });
}
