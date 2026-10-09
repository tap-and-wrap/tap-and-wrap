import { test, expect } from '@playwright/test';
import { cairoDateTimeCandidates, cairoDateTimeInput, resolveCairoDateTime, validatePromotionSchedule } from '../src/admin/cairo-time.js';
import { adminOrderActions } from '../src/admin/order-actions.js';

test('Cairo promotion inputs round-trip winter and summer independently of device timezone', () => {
  expect(cairoDateTimeInput('2026-01-15T10:15:00.000Z')).toBe('2026-01-15T12:15');
  expect(resolveCairoDateTime('2026-01-15T12:15')).toBe('2026-01-15T10:15:00.000Z');
  expect(cairoDateTimeInput('2026-07-15T10:15:00.000Z')).toBe('2026-07-15T13:15');
  expect(resolveCairoDateTime('2026-07-15T13:15')).toBe('2026-07-15T10:15:00.000Z');
});
test('Cairo rejects skipped spring-clock minutes and requires an explicit repeated-hour occurrence', () => {
  expect(() => resolveCairoDateTime('2026-04-24T00:30')).toThrow('does not exist');
  expect(cairoDateTimeCandidates('2026-10-29T23:30')).toEqual(['2026-10-29T20:30:00.000Z', '2026-10-29T21:30:00.000Z']);
  expect(() => resolveCairoDateTime('2026-10-29T23:30')).toThrow('occurs twice');
  expect(resolveCairoDateTime('2026-10-29T23:30', 'first')).toBe('2026-10-29T20:30:00.000Z');
  expect(resolveCairoDateTime('2026-10-29T23:30', 'second')).toBe('2026-10-29T21:30:00.000Z');
});
test('promotion timestamps reject malformed dates and reversed ranges without normalizing merchant input', () => {
  expect(resolveCairoDateTime('')).toBeNull();
  for (const value of ['2026-02-30T12:00', '2026-13-01T12:00', '2026-01-01T25:00', '2026-01-01', '12.']) expect(() => resolveCairoDateTime(value)).toThrow();
  expect(() => validatePromotionSchedule({ startsAt: '2026-07-15T12:00:00Z', endsAt: '2026-07-15T11:00:00Z' })).toThrow('later');
  expect(() => validatePromotionSchedule({ startsAt: 'invalid', endsAt: null })).toThrow('valid');
  expect(() => validatePromotionSchedule({ startsAt: null, endsAt: null })).not.toThrow();
});
const baseOrder = { fulfillmentState: 'received', paymentState: 'unpaid', paymentMethod: 'cod' };
for (const [state, expected] of [['received', ['confirmed', 'cancelled']], ['confirmed', ['preparing', 'cancelled']], ['preparing', ['out_for_delivery']], ['out_for_delivery', ['delivered']], ['delivered', []], ['cancelled', []]]) {
  test(`order editor offers only valid fulfillment steps from ${state}`, () => {
    expect(adminOrderActions({ ...baseOrder, fulfillmentState: state }).fulfillment).toEqual(expected);
  });
}
test('COD collection is available only when an unpaid order is already out for delivery or delivered', () => {
  for (const fulfillmentState of ['received', 'confirmed', 'preparing', 'cancelled']) expect(adminOrderActions({ ...baseOrder, fulfillmentState }).payment).toEqual([]);
  for (const fulfillmentState of ['out_for_delivery', 'delivered']) expect(adminOrderActions({ ...baseOrder, fulfillmentState }).payment).toEqual(['paid']);
  expect(adminOrderActions({ ...baseOrder, fulfillmentState: 'delivered', paymentState: 'paid' }).payment).toEqual([]);
});
test('InstaPay fulfillment requires actual or selected payment verification, while cancellation cannot mark paid', () => {
  const order = { ...baseOrder, paymentMethod: 'instapay', paymentState: 'awaiting_verification' };
  expect(adminOrderActions(order)).toEqual({ fulfillment: ['cancelled'], payment: ['paid', 'rejected'] });
  expect(adminOrderActions(order, { paymentState: 'paid' })).toEqual({ fulfillment: ['confirmed'], payment: ['paid', 'rejected'] });
  expect(adminOrderActions(order, { fulfillmentState: 'cancelled' }).payment).toEqual(['rejected']);
  expect(adminOrderActions({ ...order, paymentState: 'paid' }).fulfillment).toEqual(['confirmed']);
  expect(adminOrderActions({ ...order, paymentState: 'rejected' }).payment).toEqual([]);
});
