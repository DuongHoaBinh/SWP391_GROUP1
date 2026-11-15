const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateRequestDates, calendarDate, vietnamCalendarDay } = require('../dist/modules/orders/request-dates');
const { validatePlanSchedule, scheduleInstant } = require('../dist/modules/routes/schedule-policy');
const now = new Date('2026-11-14T17:00:00Z');
const leg = { sequenceNo: 1, plannedDeparture: '2099-01-01T01:00:00Z', plannedArrival: '2099-01-01T03:00:00Z' };
test('customer dates are calendar days; Vietnam midnight, leap date and arrival order are validated', () => {
  assert.equal(vietnamCalendarDay(now), '2026-11-15');
  assert.throws(() => validateRequestDates('2026-11-14', null, now), /quá khứ/);
  assert.equal(validateRequestDates('2026-11-15', null, now).expectedArrivalDate, null);
  assert.equal(validateRequestDates('2028-02-29', '2028-02-29', now).expectedArrivalDate.toISOString(), '2028-02-29T00:00:00.000Z');
  for (const value of ['2026-02-30', '', '2026-11-15T24:00:00Z']) assert.throws(() => calendarDate(value, 'test'));
  assert.throws(() => validateRequestDates('2028-03-01', '2028-02-29', now), /từ ngày đi/);
});
test('schedule requires a real instant with timezone, accepts equivalent cross-zone instants', () => {
  assert.equal(scheduleInstant('2099-01-01T08:00:00+07:00', 'test'), scheduleInstant(leg.plannedDeparture, 'test'));
  for (const value of ['2099-02-30T01:00:00Z', '2099-01-01T24:00:00Z', '2099-01-01T01:00:00', 'bad']) assert.throws(() => scheduleInstant(value, 'test'));
});
test('complete schedule blocks missing times, inverted/overlapping legs and past departures', () => {
  assert.doesNotThrow(() => validatePlanSchedule([leg, { ...leg, sequenceNo: 2, plannedDeparture: '2099-01-01T10:00:00+07:00', plannedArrival: '2099-01-01T05:00:00Z' }], [], true));
  for (const legs of [[{ sequenceNo: 1 }], [{ ...leg, plannedArrival: leg.plannedDeparture }],
    [leg, { ...leg, sequenceNo: 2 }], [leg, { ...leg }]]) assert.throws(() => validatePlanSchedule(legs, [], true));
  assert.throws(() => validatePlanSchedule([leg], [], true, true, new Date('2100-01-01').getTime()), /quá khứ/);
});
test('stops stay ordered and inside their leg, including partial stop updates', () => {
  const stop = { sequenceNo: 1, legSequenceNo: 1, plannedArrival: '2099-01-01T01:30:00Z', plannedDeparture: '2099-01-01T02:00:00Z' };
  assert.doesNotThrow(() => validatePlanSchedule([leg], [stop]));
  for (const stops of [[{ ...stop, plannedArrival: '2099-01-01T04:00:00Z' }], [{ ...stop, legSequenceNo: 0 }],
    [stop, { sequenceNo: 2, plannedDeparture: '2099-01-01T01:59:00Z' }], [stop, { ...stop }]]) assert.throws(() => validatePlanSchedule([leg], stops));
});
