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
  compiled.require = name => name.startsWith('.') ? load(path.relative(path.resolve(__dirname, '../src/features/orders'), path.resolve(path.dirname(filename), name + '.tsx')).replace(/insurance-policy\.tsx$/, 'insurance-policy.ts')) : require(name);
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return compiled.exports;
}
const { previewInsurance, defaultInsurance } = load('insurance-policy.ts');
const { InsuranceSelection } = load('components/InsuranceSelection.tsx');
const { CostSummary, InsuranceSummary } = load('components/InsuranceSummary.tsx');
const policy = { version: 'equine-v1', usdToVnd: 25000, packages: [
  { code: 'basic', feeBasisPoints: 0 }, { code: 'standard', feeBasisPoints: 150 }, { code: 'premium', feeBasisPoints: 300 },
] };
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

test('insurance previews match policy fees and reject invalid paid valuations', () => {
  assert.equal(previewInsurance(defaultInsurance, null).fee, 0);
  assert.equal(previewInsurance({ declaredValue: '100000000', declaredCurrency: 'VND', insurancePackage: 'standard' }, policy).fee, 1500000);
  assert.equal(previewInsurance({ declaredValue: '10000', declaredCurrency: 'USD', insurancePackage: 'premium' }, policy).fee, 7500000);
  assert.equal(previewInsurance({ declaredValue: '1', declaredCurrency: 'USD', insurancePackage: 'premium' }, { ...policy, usdToVnd: 25016.666666 }).fee, 751);
  for (const declaredValue of ['', '-1', '1.001', 'not-a-number']) assert.ok(previewInsurance({ declaredValue, declaredCurrency: 'VND', insurancePackage: 'premium' }, policy).error);
  assert.ok(previewInsurance({ declaredValue: '100', declaredCurrency: 'USD', insurancePackage: 'basic' }, null).error);
});

test('each selected horse has independent radios, valuation labels and visible fee explanations', () => {
  const html = render(InsuranceSelection, { horses: [{ id: 'a', name: 'Ngựa A', quantity: 2 }, { id: 'b', name: 'Ngựa B' }],
    values: { a: { declaredValue: '100000000', declaredCurrency: 'VND', insurancePackage: 'standard' } }, policy, onChange() {}, onRetry() {} });
  assert.equal((html.match(/type="radio"/g) || []).length, 6);
  assert.equal((html.match(/checked=""/g) || []).length, 2);
  assert.match(html, /name="insurance-a"/); assert.match(html, /name="insurance-b"/);
  assert.match(html, /3\.000\.000 VNĐ/); assert.match(html, /80%/); assert.match(html, /cấp cứu thú y/);
  assert.match(html, /Giá trị ước tính/);
});

test('the cost summary distinguishes pending freight from a quoted combined total', () => {
  const pending = render(CostSummary, { transportCost: null, insuranceFee: 1500000 });
  assert.match(pending, /Chờ Manager báo giá/); assert.match(pending, /1\.500\.000 VNĐ/);
  const quoted = render(CostSummary, { transportCost: 10000000, insuranceFee: 1500000, totalCost: 11500000 });
  assert.match(quoted, /10\.000\.000 VNĐ/); assert.match(quoted, /1\.500\.000 VNĐ/); assert.match(quoted, /11\.500\.000 VNĐ/);
});

test('saved policy summary renders compensation, veterinary coverage and stored USD rate', () => {
  const html = render(InsuranceSummary, { horses: [{ horseId: 1, name: '<script>unsafe</script>', quantity: 2, declaredValue: 10000,
    declaredCurrency: 'USD', exchangeRate: 25000, declaredValueVnd: 250000000, insurancePackage: 'premium', insuranceFee: 7500000,
    maxCompensation: 250000000, emergencyVetCovered: true }], transportCost: 10000000, insuranceFee: 15000000, totalCost: 25000000 });
  assert.match(html, /tỷ giá đã lưu/); assert.match(html, /250\.000\.000 VNĐ/); assert.match(html, /cấp cứu thú y/);
  assert.match(html, /25\.000\.000 VNĐ/); assert.doesNotMatch(html, /<script>/);
});

test('insurance amendments preserve stored USD premiums until the declaration changes', () => {
  const saved = { horseId: 1, name: 'Ngựa USD', declaredValue: 10000, declaredCurrency: 'USD', insurancePackage: 'standard', exchangeRate: 20000, insuranceFee: 3000000 };
  const input = { declaredValue: '10000', declaredCurrency: 'USD', insurancePackage: 'standard' };
  assert.equal(previewInsurance(input, policy, saved).fee, 3000000);
  assert.equal(previewInsurance(input, null, saved).error, null);
  assert.equal(previewInsurance({ ...input, insurancePackage: 'premium' }, policy, saved).fee, 7500000);
  assert.ok(previewInsurance({ ...input, insurancePackage: 'premium' }, null, saved).error);
  const html = render(InsuranceSelection, { horses: [{ id: '1', name: saved.name }], values: { '1': input },
    savedPolicies: { '1': saved }, policy, onChange() {}, onRetry() {} });
  assert.match(html, /Tỷ giá đã lưu/); assert.match(html, /20\.000 VNĐ/); assert.match(html, /3\.000\.000 VNĐ/);
  assert.doesNotMatch(html, /25\.000 VNĐ/);
});
