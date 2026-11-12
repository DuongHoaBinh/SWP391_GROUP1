const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file) {
  const filename = path.resolve(__dirname, '../src/features/orders', file);
  const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = module.paths;
  compiled.require = name => {
    if (!name.startsWith('.')) return require(name);
    const base = path.resolve(path.dirname(filename), name);
    const resolved = ['.ts', '.tsx'].map(extension => base + extension).find(file => fs.existsSync(file));
    return load(path.relative(path.resolve(__dirname, '../src/features/orders'), resolved));
  };
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return compiled.exports;
}
const { previewBookingQuote, bookingQuotePayload } = load('booking-policy.ts');
const { BookingChoice } = load('components/BookingChoice.tsx');
const { BookingSummary, BookingQuoteSummary } = load('components/BookingSummary.tsx');
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

test('shared quote multiplies total quantity; charter remains flat with separate insurance', () => {
  assert.equal(previewBookingQuote('2000000', 'shared_stall', 2).freight, 4000000);
  assert.equal(previewBookingQuote('10000000', 'dedicated_charter', 6).freight, 10000000);
  assert.deepEqual(bookingQuotePayload('2000000', 'shared_stall', 2, 'VND'), { stallUnitPrice: 2000000, bookingType: 'shared_stall', quotedHorseCount: 2 });
  assert.deepEqual(bookingQuotePayload('10000000', 'dedicated_charter', 6, 'VND'), { transportCost: 10000000, bookingType: 'dedicated_charter', quotedHorseCount: 6 });
  const html = render(BookingQuoteSummary, { input: '2000000', bookingType: 'shared_stall', horseCount: 2, currency: 'VND', insuranceFee: 3000000 });
  for (const value of ['2.000.000 VNĐ', '4.000.000 VNĐ', '3.000.000 VNĐ', '7.000.000 VNĐ']) assert.ok(html.includes(value));
});
test('booking cards keep both options available and label recommendations without forcing selection', () => {
  for (const horseCount of [1, 2, 3, 6]) {
    const html = render(BookingChoice, { value: 'shared_stall', horseCount, onChange() {} });
    assert.equal((html.match(/type="radio"/g) || []).length, 2);
    assert.equal((html.match(/checked=""/g) || []).length, 1);
    assert.doesNotMatch(html, /disabled/); assert.match(html, /Ghép ô chuồng/); assert.match(html, /Bao nguyên xe/);
    assert.match(html, horseCount <= 2 ? /Phù hợp với số lượng đang chọn/ : /Gợi ý cho đoàn của bạn/);
  }
});
test('invalid money/count and overflows cannot produce approval payloads', () => {
  for (const input of ['', '0', '-1', '1.5', 'Infinity', 'not a number', '9999999999999']) assert.throws(() => bookingQuotePayload(input, 'shared_stall', 2, 'VND'));
  assert.ok(previewBookingQuote('1', 'shared_stall', 0).error);
  assert.equal(previewBookingQuote('100', 'shared_stall', 2, 'USD').freight, 5080000);
});
test('saved legacy totals never invent a unit price; charter summary describes flat pricing', () => {
  const legacy = render(BookingSummary, { bookingType: 'shared_stall', horseCount: 2, stallUnitPrice: null });
  assert.match(legacy, /2 ô chuồng/); assert.doesNotMatch(legacy, /0 VNĐ/);
  const charter = render(BookingSummary, { bookingType: 'dedicated_charter', horseCount: 4 });
  assert.match(charter, /Giá trọn gói riêng cho đoàn 4 ngựa/);
});
