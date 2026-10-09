/** Exact decimal input. Never round merchant-entered money or use floating-point multiplication. */
export function parseDecimalPiastres(input, { allowNegative = false, maximum = Number.MAX_SAFE_INTEGER, minimum = allowNegative ? -maximum : 0 } = {}) {
  const text = String(input ?? '').trim();
  if (!text) return null;
  if (!(allowNegative ? /^-?\d+(?:\.\d{0,2})?$/ : /^\d+(?:\.\d{0,2})?$/).test(text)) throw new Error('Enter an amount with at most two decimal places.');
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const integer = (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * (negative ? -1n : 1n);
  if (integer < BigInt(minimum) || integer > BigInt(maximum)) throw new Error('This amount is outside the allowed range.');
  return Number(integer);
}

export function decimalInput(value) {
  if (!Number.isSafeInteger(value)) return '';
  const amount = BigInt(value);
  const magnitude = amount < 0n ? -amount : amount;
  const fraction = String(magnitude % 100n).padStart(2, '0').replace(/0+$/, '');
  return `${amount < 0n ? '-' : ''}${magnitude / 100n}${fraction ? `.${fraction}` : ''}`;
}
