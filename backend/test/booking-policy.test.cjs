const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateBookingQuote, normalizeBookingType } = require('../dist/modules/orders/booking-policy');

test('booking defaults and both choices remain available regardless of recommended horse count', () => {
  assert.equal(normalizeBookingType(), 'shared_stall');
  assert.equal(calculateBookingQuote('shared_stall', 3, { stallUnitPrice: 1000000, bookingType: 'shared_stall', quotedHorseCount: 3 }).transportCost, 3000000);
  assert.equal(calculateBookingQuote('dedicated_charter', 1, { transportCost: 10000000 }).transportCost, 10000000);
});
test('stall prices multiply exactly once and charter totals never multiply by horse count', () => {
  assert.deepEqual(calculateBookingQuote('shared_stall', 2, { stallUnitPrice: 1500000, bookingType: 'shared_stall', quotedHorseCount: 2 }), { transportCost: 3000000, stallUnitPrice: 1500000 });
  assert.deepEqual(calculateBookingQuote('dedicated_charter', 6, { transportCost: 10000000 }), { transportCost: 10000000, stallUnitPrice: null });
  assert.deepEqual(calculateBookingQuote('shared_stall', 2, { totalCost: 3000000 }), { transportCost: 3000000, stallUnitPrice: null });
});
test('stale or conflicting quotes and overflows are rejected before persistence', () => {
  const valid = { stallUnitPrice: 1000000, bookingType: 'shared_stall', quotedHorseCount: 2 };
  for (const patch of [{ quotedHorseCount: 1 }, { bookingType: 'dedicated_charter' }, { quotedHorseCount: undefined }, { transportCost: 2000000 }, { stallUnitPrice: null }, { stallUnitPrice: -1 }, { stallUnitPrice: 1.5 }, { stallUnitPrice: 9999999999999 }]) {
    assert.throws(() => calculateBookingQuote('shared_stall', 2, { ...valid, ...patch }));
  }
  assert.throws(() => calculateBookingQuote('dedicated_charter', 2, valid));
  assert.throws(() => normalizeBookingType('unknown'));
  assert.throws(() => calculateBookingQuote('shared_stall', 2, { transportCost: 100, totalCost: 200 }));
});
