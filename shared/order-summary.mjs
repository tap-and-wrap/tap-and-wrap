import { isEngravingKind } from './engraving/definitions.mjs';

// Display categories only; payment allocations and accepted totals stay intact.
export function orderSummaryRows(lines) {
  const rows = new Map();
  const add = (id, label, amount) => {
    if (!Number.isSafeInteger(amount) || amount < 0) throw Error('Invalid summary amount.');
    rows.set(id, { id, label, amountPiastres: (rows.get(id)?.amountPiastres || 0) + amount });
  };
  for (const line of lines) {
    const total = line.lineTotalPiastres;
    if (isEngravingKind(line.kind)) { add('engraving', 'Engraving', total); continue; }
    const gift = line.kind === 'gift_box_v2';
    const personal = line.giftPersonalization || line.giftBox?.personalization;
    const engraving = gift ? (personal?.engravings || []).reduce((sum, entry) => sum + entry.pricePiastres, 0) * line.quantity
      : (line.productEngravingSnapshot?.surchargePiastres ?? line.productEngraving?.surchargePiastres ?? 0) * line.quantity;
    add(gift ? 'gifts' : 'products', gift ? 'Gift Boxes' : 'Products', total - engraving);
    if (engraving > 0) add('engraving', 'Engraving', engraving);
  }
  return ['products', 'gifts', 'engraving'].flatMap(id => rows.has(id) ? [rows.get(id)] : []);
}
