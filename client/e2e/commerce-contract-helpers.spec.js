import { test, expect } from '@playwright/test';
import { parseDecimalPiastres, decimalInput } from '../src/commerce/money-input.js';

test('commerce editor decimal input preserves exact integer money and signed adjustments', () => {
  for (const [input, expected] of [['0', 0], ['0.01', 1], ['12.34', 1234], ['12.', 1200], ['001.09', 109], [' 1.2 ', 120], ['90071992547409.91', Number.MAX_SAFE_INTEGER]]) expect(parseDecimalPiastres(input)).toBe(expected);
  expect(parseDecimalPiastres('')).toBeNull();
  expect(parseDecimalPiastres('-12.34', { allowNegative: true })).toBe(-1234);
  expect(parseDecimalPiastres('-0.01', { allowNegative: true })).toBe(-1);
  for (const value of [0, 1, 109, 1200, -1, -1234, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]) expect(parseDecimalPiastres(decimalInput(value), { allowNegative: true })).toBe(value);
});

test('money input rejects rounding, exponents, unsafe values and disallowed negative/percentage boundaries', () => {
  for (const input of ['1.001', '-1', '1e3', 'NaN', 'Infinity', '1,000', '90071992547409.92', '-']) expect(() => parseDecimalPiastres(input)).toThrow();
  expect(() => parseDecimalPiastres('100.01', { maximum: 10000, minimum: 1 })).toThrow();
  expect(() => parseDecimalPiastres('0', { maximum: 10000, minimum: 1 })).toThrow();
  expect(parseDecimalPiastres('0.01', { maximum: 10000, minimum: 1 })).toBe(1);
  expect(parseDecimalPiastres('100', { maximum: 10000, minimum: 1 })).toBe(10000);
});
