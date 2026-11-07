// Current shopping selection only. Historical snapshots retain their original text.
export function validGiftCardMessage(value) {
  return typeof value === 'string' && value.isWellFormed() && Array.from(value).length <= 500
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}

export function hasGiftCardMessage(value) {
  if (!validGiftCardMessage(value)) return false;
  // Combining marks and bidi/joining controls remain in the saved message, but
  // cannot by themselves select a paid card. Preserve real Arabic and English.
  const visible = value.replace(/[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Mark}\u2800\u3164\uffa0]/gu, '');
  return /[\p{Letter}\p{Number}\p{Punctuation}\p{Symbol}]/u.test(visible);
}
