const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadText(source, filename, overrides = {}) {
  const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = module.paths;
  compiled.require = name => name in overrides ? overrides[name] : require(name);
  compiled._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
  return compiled.exports;
}
const helperPath = path.resolve(__dirname, '../src/features/orders/quotation-html.ts');
const { escapeQuotationText } = loadText(fs.readFileSync(helperPath, 'utf8'), helperPath);

for (const actor of ['manager', 'customer']) test(`${actor} quotation escapes customer data throughout the real print template`, () => {
  const file = path.resolve(__dirname, `../src/app/${actor}/requests/page.tsx`);
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const helper = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'exportQuotationPDF');
  const { exportQuotationPDF } = loadText(helper.getText(source) + '\nexports.exportQuotationPDF = exportQuotationPDF;', file);
  let html;
  const original = { window: global.window, escapeQuotationText: global.escapeQuotationText, STATUS_COLORS: global.STATUS_COLORS,
    STATUS_LABELS: global.STATUS_LABELS, formatDate: global.formatDate, bookingName: global.bookingName };
  try {
    global.window = { open: () => ({ document: { write: value => { html = value; }, close() {} } }) };
    global.escapeQuotationText = escapeQuotationText;
    global.STATUS_COLORS = { approved: { bg: '#fff', color: '#000', border: '#ccc' } };
    global.STATUS_LABELS = { approved: 'Approved' }; global.formatDate = () => '01/01/2099'; global.bookingName = () => 'Shared';
    const unsafe = '<img src=x onerror="audit()">';
    exportQuotationPDF({ id: 1, status: 'approved', requestCode: unsafe, contactName: unsafe, contactEmail: unsafe,
      originLocation: unsafe, destinationLocation: unsafe, specialRequirements: unsafe, rejectionReason: unsafe,
      horses: [{ name: unsafe, breed: unsafe, gender: unsafe, age: 4 }], requestedHorseCount: 1,
      transportCost: 10000000, insuranceFee: 1500000, totalCost: 11500000 });
    assert.ok(!html.includes(unsafe)); assert.ok(html.includes('&lt;img src=x onerror=&quot;audit()&quot;&gt;'));
    assert.match(html, /11\.500\.000/);
  } finally { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete global[key]; else global[key] = value; } }
});

for (const actor of ['customer', 'manager']) test(`${actor} list shows an API error instead of invented orders`, async () => {
  const file = path.resolve(__dirname, `../src/app/${actor}/requests/page.tsx`);
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const page = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text.endsWith('Page'));
  const declaration = page.body.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations]).find(node => node.name.getText(source) === 'fetchOrders');
  const { run } = loadText('exports.run = ' + declaration.initializer.arguments[0].getText(source), file);
  const previous = {}, values = {};
  const bindings = { apiClient: async () => { throw new Error('offline fixture'); }, filterStatus: 'all', departureDateFrom: '', departureDateTo: '',
    sortBy: 'createdAt', sortOrder: 'desc', page: 1, limit: 10, setLoading: () => {},
    setError: value => { values.error = value; }, setOrders: value => { values.orders = value; }, setPagination: value => { values.pagination = value; } };
  try {
    for (const [key, value] of Object.entries(bindings)) { previous[key] = global[key]; global[key] = value; }
    await run(); assert.deepEqual(values.orders, []); assert.equal(values.error, 'offline fixture'); assert.equal(values.pagination.total, 0);
  } finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete global[key]; else global[key] = value; } }
});

test('customer detail renders an error instead of an endless loading skeleton', () => {
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
  const file = path.resolve(__dirname, '../src/app/customer/requests/[id]/page.tsx');
  const source = fs.readFileSync(file, 'utf8');
  const aliases = new Proxy({}, { get: () => () => null });
  const imports = [...source.matchAll(/from\s+['"](@\/[^'"]+)['"]/g)].map(match => match[1]);
  const overrides = Object.fromEntries(imports.map(name => [name, aliases]));
  overrides['@/lib/customer-store'] = { useCustomerStore: () => ({}) };
  overrides['lucide-react'] = aliases;
  overrides['next/navigation'] = { useParams: () => ({ id: '404' }), useRouter: () => ({}) };
  overrides.swr = { default: () => ({ error: new Error('Not found'), isLoading: false, mutate: () => {} }) };
  const Page = loadText(source, file, overrides).default;
  const html = renderToStaticMarkup(React.createElement(Page));
  assert.match(html, /role="alert"/); assert.match(html, /Thử lại/); assert.doesNotMatch(html, /animation:pulse/);
});

test('road picker separates Shared/Dedicated and never displays customer identity', () => {
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
  const file = path.resolve(__dirname, '../src/features/routes/components/RoadTripPicker.tsx');
  const trips = ['shared_stall', 'dedicated_charter'].map((bookingType, index) => ({ id: index + 1, bookingType, vehicleId: index + 1,
    vehiclePlate: bookingType === 'shared_stall' ? 'SHARED-1' : 'PRIVATE-2', originLocation: 'A', destinationLocation: 'B',
    plannedDeparture: '2099-01-01T08:00:00Z', capacity: 4, bookedStalls: 2, customerName: 'Never display another owner' }));
  const { RoadTripPicker } = loadText(fs.readFileSync(file, 'utf8'), file, { swr: { default: () => ({ data: trips }) }, '@/lib/api-client': {} });
  const html = renderToStaticMarkup(React.createElement(RoadTripPicker, { leg: { sequenceNo: 1, legType: 'road' }, bookingType: 'shared_stall', readOnly: false, onChange() {} }));
  assert.match(html, /SHARED-1/); assert.match(html, /2\/4 ô/); assert.doesNotMatch(html, /PRIVATE-2|Never display another owner/);
});

test('selecting a shared trip carries canonical vehicle, route and schedule into the planning payload', () => {
  const file = path.resolve(__dirname, '../src/features/routes/components/RoadTripPicker.tsx');
  const trip = { id: 8, bookingType: 'shared_stall', vehicleId: 77, vehiclePlate: 'REAL-77', originLocation: 'A', destinationLocation: 'B',
    plannedDeparture: '2099-01-01T08:00:00Z', plannedArrival: '2099-01-01T12:00:00Z', capacity: 4, bookedStalls: 1 };
  const { RoadTripPicker } = loadText(fs.readFileSync(file, 'utf8'), file, { swr: { default: () => ({ data: [trip] }) }, '@/lib/api-client': {} });
  let updated; const tree = RoadTripPicker({ leg: { sequenceNo: 1, legType: 'road' }, bookingType: 'shared_stall', readOnly: false, onChange: value => { updated = value; } });
  function find(node, type) { if (!node || typeof node !== 'object') return; if (node.type === type) return node;
    for (const child of [].concat(node.props?.children ?? [])) { const match = find(child, type); if (match) return match; } }
  find(tree, 'select').props.onChange({ target: { value: '8' } });
  assert.equal(updated.roadTripId, 8); assert.equal(updated.vehicleId, 77); assert.equal(updated.plannedArrival, trip.plannedArrival);
  assert.equal(updated.originLocation, 'A');
});

test('a selected road trip locks its schedule while flight schedules remain editable', () => {
  const file = path.resolve(__dirname, '../src/features/routes/components/RoadTripPicker.tsx');
  const { LegScheduleFields } = loadText(fs.readFileSync(file, 'utf8'), file, { swr: {}, '@/lib/api-client': {} });
  assert.equal(LegScheduleFields({ leg: { legType: 'road', roadTripId: 8 }, readOnly: false, onChange() {} }).props.disabled, true);
  assert.equal(LegScheduleFields({ leg: { legType: 'flight' }, readOnly: false, onChange() {} }).props.disabled, false);
});
