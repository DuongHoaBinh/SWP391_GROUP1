const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
function load(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = module.paths;
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
  return compiled.exports;
}
const dates = load('lib/transport-dates.ts');
const metrics = load('features/routes/route-metrics.ts');
test('requested days use the Vietnam calendar across UTC midnight', () => {
  assert.equal(dates.vietnamDateString(new Date('2026-11-14T16:59:59Z')), '2026-11-14');
  assert.equal(dates.vietnamDateString(new Date('2026-11-14T17:00:00Z')), '2026-11-15');
  assert.equal(dates.requestedDateError('2026-11-15', '', '2026-11-15'), null);
  assert.ok(dates.requestedDateError('2026-11-14', '', '2026-11-15'));
});
test('calendar validation accepts leap days and optional/same-day arrival, rejects impossible or inverted dates', () => {
  assert.equal(dates.validCalendarDay('2028-02-29'), true);
  for (const value of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-1-01', '']) assert.equal(dates.validCalendarDay(value), false);
  assert.equal(dates.requestedDateError('2028-02-29', '2028-02-29', '2026-11-14'), null);
  assert.ok(dates.requestedDateError('2028-03-01', '2028-02-29', '2026-11-14'));
  assert.equal(dates.calendarDayLabel('2026-11-15T00:00:00Z'), '15/11/2026');
  assert.equal(dates.calendarDayLabel('2026-11-14T17:00:00Z'), '15/11/2026');
  assert.equal(dates.calendarDayLabel(null), 'Chưa xác định');
});
test('coordinator input roundtrips a fixed UTC+07, independently of the computer timezone', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['UTC', 'America/New_York', 'Asia/Tokyo']) {
      process.env.TZ = zone;
      assert.equal(dates.vietnamDateTimeInput('2026-11-14T18:30:00Z'), '2026-11-15T01:30');
      assert.equal(dates.vietnamInputToIso('2026-11-15T01:30'), '2026-11-14T18:30:00.000Z');
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  for (const value of ['', '2026-02-30T01:30', '2026-11-14T24:00', '2026-11-14T10:60', 'bad']) assert.equal(dates.vietnamInputToIso(value), null);
});
test('road time comes only from a complete routing response; air never invents a flight duration', () => {
  const navigation = { key: 'route', distanceKm: 1135, durationHours: 20.5, fullyRouted: true };
  assert.deepEqual(metrics.routePreviewMetrics('road', 900, navigation), { mode: 'road', distanceKm: 1135, durationHours: 20.5, source: 'road-routing' });
  assert.equal(metrics.routePreviewMetrics('road', 900).durationHours, null);
  assert.equal(metrics.routePreviewMetrics('road', 900, { ...navigation, fullyRouted: false }).durationHours, null);
  assert.equal(metrics.routePreviewMetrics('air', 900, navigation).durationHours, null);
  assert.equal(metrics.routePreviewMetrics('air', 900, navigation).source, 'air-reference');
  assert.equal(metrics.travelDurationLabel(6.5), 'Khoảng 6 giờ 30 phút');
  assert.match(metrics.travelDurationLabel(null), /Chưa xác định/);
});
test('waypoint information avoids unverified legal claims and escapes location HTML in map popups', () => {
  assert.match(metrics.mapWaypointGuidance('checkpoint'), /tham khảo/);
  assert.match(metrics.mapWaypointGuidance('airport'), /xác nhận/);
  assert.equal(metrics.mapText('<img src=x onerror="alert(1)"> & owner\'s'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; owner&#39;s');
});
