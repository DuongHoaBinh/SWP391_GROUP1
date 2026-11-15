const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadText(source, filename, overrides = {}) {
  const compiled = new Module(filename, module); compiled.filename = filename; compiled.paths = module.paths;
  compiled.require = name => {
    if (name in overrides) return overrides[name];
    if (name.startsWith('@/')) {
      const target = path.resolve(__dirname, '../src', name.slice(2)) + '.ts';
      return loadText(fs.readFileSync(target, 'utf8'), target, overrides);
    }
    return require(name);
  };
  compiled._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
  return compiled.exports;
}
const helperPath = path.resolve(__dirname, '../src/features/orders/quotation-html.ts');
const { escapeQuotationText } = loadText(fs.readFileSync(helperPath, 'utf8'), helperPath);

test('locked plan view preserves saved route details and never invents a vehicle or missing leg', () => {
  const file = path.resolve(__dirname, '../src/features/routes/plan-display.ts');
  const { savedPlanView } = loadText(fs.readFileSync(file, 'utf8'), file);
  assert.deepEqual(savedPlanView({ routeName: 'Saved road plan', totalDistanceKm: 115, legs: [], stops: [] }),
    { routeName: 'Saved road plan', distanceKm: 115, notes: '', legs: [], stops: [] });
  const leg = { sequenceNo: 1, legType: 'flight', originLocation: 'Saved origin', destinationLocation: 'Saved destination', vehicleId: null };
  const route = { routeName: 'Saved air plan', totalDistanceKm: null, strategicNotes: 'Saved note', legs: [leg], stops: [] };
  const view = savedPlanView(route);
  assert.deepEqual(view.legs, [leg]);
  assert.notEqual(view.legs[0], leg);
  assert.equal(view.distanceKm, 0);
});

test('changing Singapore to Hanoi never reuses the previous geocoding country or coordinates', () => {
  const file = path.resolve(__dirname, '../src/components/maps/RoutePlanningMap.tsx');
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = source.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
    .find(node => node.name.getText(source) === 'RoutePlanningMap').initializer;
  const declarations = component.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]);
  const fields = ['activeOriginGeo', 'activeDestGeo'].map(name => declarations.find(node => node.name.getText(source) === name));
  assert.ok(fields.every(Boolean));
  const route = declarations.find(node => node.name.getText(source) === 'routeResult');
  const { run } = loadText(`exports.run = (buildEquineRoute, customOriginGeo, customDestGeo) => {
    const originText = 'Trang trại Củ Chi, TP.HCM', destinationText = 'Trang trại Ngựa Thể thao Sóc Sơn, Hà Nội';
    const mode = 'road', transportType = 'Domestic';
    ${fields.map(field => 'const ' + field.getText(source) + ';').join('\n')}
    return (${route.initializer.arguments[0].getText(source)})();
  };`, file);
  const geoFile = path.resolve(__dirname, '../src/lib/geo-corridors.ts');
  const { buildEquineRoute } = loadText(fs.readFileSync(geoFile, 'utf8'), geoFile);
  const result = run(buildEquineRoute, null, { query: 'Singapore Turf Club', country: 'Singapore', coords: [1.3, 103.8] });
  assert.equal(result.destination.country, 'Việt Nam');
  assert.ok(result.destination.name.includes('Hà Nội'));
  assert.ok(!result.destination.name.includes('Singapore'));
});

for (const actor of ['customer', 'manager']) {
  for (const [status, label] of [['change_requested', 'Changes Requested'], ['confirmed', 'Confirmed'],
    ['ready_to_depart', 'Ready to Depart'], ['future_status', 'Unknown Status']]) {
    test(`${actor} request row renders a visible badge for ${status}`, () => {
      const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
      const file = path.resolve(__dirname, `../src/app/${actor}/requests/page.tsx`);
      const text = fs.readFileSync(file, 'utf8');
      const aliases = new Proxy({}, { get: () => () => null });
      const imports = [...text.matchAll(/from\s+['"](@\/[^'"]+)['"]/g)].map(match => match[1]);
      const overrides = Object.fromEntries(imports.map(name => [name, aliases]));
      const order = { id: 75, requestCode: 'REQ-075', customerId: 7, contactName: 'Fixture', contactEmail: 'fixture@example.test',
        originLocation: 'A', destinationLocation: 'B', requestedDate: '2026-11-14', departureDate: null,
        status, totalCost: 15000000, createdAt: '2026-11-14', horses: [] };
      overrides.react = { ...React, useState: initial => [Array.isArray(initial) ? [order] : initial === true ? false : initial, () => {}],
        useEffect() {}, useCallback: callback => callback };
      overrides['next/navigation'] = { useRouter: () => ({ push() {} }) };
      overrides['next/link'] = { default: ({ children }) => React.createElement('a', null, children) };
      overrides['lucide-react'] = aliases;
      overrides['@/lib/customer-store'] = { useCustomerStore: () => ({}) };
      overrides['@/features/orders/booking-policy'] = { bookingName: () => 'Shared Stall' };
      const { default: Page } = loadText(text, file, overrides);
      const html = renderToStaticMarkup(React.createElement(Page));
      assert.match(html, new RegExp(`<span[^>]*>${label}</span>`));
    });
  }
}

for (const [status, label] of [['confirmed', 'Đã xác nhận lịch trình'], ['change_requested', 'Cần chỉnh sửa'], ['future_status', 'Trạng thái chưa xác định']]) {
  test(`manager detail renders the correct status for ${status}`, () => {
    const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
    const file = path.resolve(__dirname, '../src/app/manager/requests/[id]/page.tsx');
    const text = fs.readFileSync(file, 'utf8');
    const aliases = new Proxy({}, { get: () => () => null });
    const imports = [...text.matchAll(/from\s+['"](@\/[^'"]+)['"]/g)].map(match => match[1]);
    const overrides = Object.fromEntries(imports.map(name => [name, aliases]));
    const order = { id: 75, status, horses: [], totalCost: 15000000, insuranceFee: 0, requestedHorseCount: 3,
      originLocation: 'A', destinationLocation: 'B', requestedDate: '2026-11-14', createdAt: '2026-11-14', specialRequirements: '' };
    overrides.react = { ...React, default: React };
    overrides['lucide-react'] = aliases;
    overrides['next/navigation'] = { useParams: () => ({ id: '75' }), useRouter: () => ({ push() {} }) };
    overrides['next/link'] = { default: ({ children }) => React.createElement('a', null, children) };
    overrides['@/lib/geo-corridors'] = { buildEquineRoute: () => ({ distanceKm: 10, durationHours: 1 }) };
    overrides.swr = { default: url => ({ data: url === '/orders/75' ? order : undefined, isLoading: false, mutate() {} }) };
    const { default: Page } = loadText(text, file, overrides);
    const html = renderToStaticMarkup(React.createElement(Page));
    assert.ok(html.includes(label));
  });
}

for (const [profileCount, horseCount] of [[1, 5], [2, 7]]) {
  test(`coordinator displays ${horseCount} horses from ${profileCount} profiles`, () => {
    const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
    const file = path.resolve(__dirname, '../src/app/coordinator/routes/page.tsx');
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const helper = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'renderHorseNamesDisplay');
    const { run } = loadText(helper.getText(source) + '\nexports.run = renderHorseNamesDisplay;', file);
    const html = renderToStaticMarkup(run(Array.from({ length: profileCount }, (_, i) => ({ name: `Horse ${i}` })), horseCount)).replace(/<!--.*?-->/g, '');
    assert.match(html, new RegExp(`${horseCount} (con|ngựa)`));
  });
}

test('dashboard approval opens the full booking and insurance quotation instead of a USD total shortcut', () => {
  const React = require('react');
  const file = path.resolve(__dirname, '../src/app/manager/page.tsx');
  const calls = [];
  const noIcon = new Proxy({}, { get: () => () => null });
  const { default: Page } = loadText(fs.readFileSync(file, 'utf8'), file, {
    react: { ...React, useState: initial => [initial, () => {}], useEffect() {} },
    'next/navigation': { useRouter: () => ({ push: url => calls.push(url) }) },
    'next/link': { default: () => null }, 'lucide-react': noIcon,
    '@/lib/api-client': { apiClient: () => { throw new Error('Dashboard must not approve directly'); } },
    '@/components/ui/Modal': { Modal: () => null },
    swr: { default: () => ({ data: [{ id: 42, status: 'requested', originLocation: 'A', destinationLocation: 'B',
      horses: [], totalCost: 0 }], mutate() {} }) },
    'react-hot-toast': { default: { success() {} } },
  });
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return;
    if (predicate(node)) return node;
    for (const child of [].concat(node.props?.children ?? []).flat()) { const match = find(child, predicate); if (match) return match; }
  }
  const tree = Page();
  const table = find(tree, node => node.props?.id === 'pending-requests-table');
  const approve = find(table, node => node.type === 'button' && String(node.props.children).trim() === 'Approve');
  assert.ok(approve, 'Actual dashboard approval button must exist');
  approve.props.onClick();
  assert.deepEqual(calls, ['/manager/requests/42']);
});

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

test('an existing road-trip selection remains visible when its catalog cannot load', () => {
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
  const file = path.resolve(__dirname, '../src/features/routes/components/RoadTripPicker.tsx');
  const { RoadTripPicker } = loadText(fs.readFileSync(file, 'utf8'), file, {
    swr: { default: () => ({ data: undefined, error: new Error('offline'), mutate() {} }) }, '@/lib/api-client': {},
  });
  const html = renderToStaticMarkup(React.createElement(RoadTripPicker, {
    leg: { roadTripId: 8, vehiclePlate: 'TEST-08' }, bookingType: 'shared_stall', readOnly: false, onChange() {},
  }));
  assert.match(html, /<option value="8" selected="">/);
  assert.match(html, /Chuyến đã chọn #8/);
  assert.match(html, /Thử lại/);
});

test('saved customer schedule shows only persisted legs and distinguishes drafts from confirmation', () => {
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
  const file = path.resolve(__dirname, '../src/features/routes/components/SavedTransportSchedule.tsx');
  function render(route, error) {
    const { SavedTransportSchedule } = loadText(fs.readFileSync(file, 'utf8'), file, {
      swr: { default: () => ({ data: { route }, error, mutate() {} }) }, '@/lib/api-client': {},
    });
    return renderToStaticMarkup(React.createElement(SavedTransportSchedule, { shipmentId: 7 }));
  }
  const route = { planStatus: 'draft', legs: [{ sequenceNo: 1, legType: 'road', originLocation: 'Saved A', destinationLocation: 'Saved B',
    plannedDeparture: '2099-01-01T01:30:00Z', plannedArrival: '2099-01-01T03:00:00Z' }] };
  assert.match(render(route), /Lịch dự thảo/);
  assert.match(render(route), /Saved A/); assert.match(render(route), /08:30/);
  const confirmed = render({ ...route, planStatus: 'confirmed' });
  assert.match(confirmed, /đã xác nhận/); assert.doesNotMatch(confirmed, /Lịch dự thảo/);
  assert.match(render(null), /Chưa có giờ đi\/đến chi tiết được lưu/);
  assert.match(render(null, new Error('offline')), /Không tải được lịch đã lưu/);
});

test('stop scheduler converts Vietnam times, retains the leg association and locks reviewed plans', () => {
  const file = path.resolve(__dirname, '../src/features/routes/components/StopScheduleFields.tsx');
  const { StopScheduleFields } = loadText(fs.readFileSync(file, 'utf8'), file);
  const stop = { sequenceNo: 1, legSequenceNo: 2, plannedArrival: '2099-01-01T02:00:00Z', plannedDeparture: '2099-01-01T02:30:00Z' };
  const legs = [{ sequenceNo: 2, originLocation: 'A', destinationLocation: 'B', plannedDeparture: '2099-01-01T01:00:00Z', plannedArrival: '2099-01-01T03:00:00Z' }];
  let updated;
  const tree = StopScheduleFields({ stop, legs, readOnly: false, onChange: value => { updated = value; } });
  function findAll(node, type) {
    if (!node || typeof node !== 'object') return [];
    return [...(node.type === type ? [node] : []), ...[].concat(node.props?.children ?? []).flat(Infinity).flatMap(child => findAll(child, type))];
  }
  const [arrival, departure] = findAll(tree, 'input');
  assert.equal(arrival.props.value, '2099-01-01T09:00');
  assert.equal(arrival.props.min, '2099-01-01T08:00');
  assert.equal(arrival.props.max, '2099-01-01T10:00');
  assert.equal(departure.props.min, '2099-01-01T09:00');
  arrival.props.onChange({ target: { value: '2099-01-01T09:15' } });
  assert.equal(updated.plannedArrival, '2099-01-01T02:15:00.000Z');
  assert.equal(updated.plannedDeparture, stop.plannedDeparture); assert.equal(updated.legSequenceNo, 2);
  findAll(tree, 'select')[0].props.onChange({ target: { value: '' } });
  assert.equal(updated.legSequenceNo, undefined);
  assert.equal(StopScheduleFields({ stop, legs, readOnly: true, onChange() {} }).props.disabled, true);
});

test('global fleet provider skips the staff endpoint for Customer, Driver, Specialist and unauthenticated sessions', async () => {
  const file = path.resolve(__dirname, '../src/lib/fleet-route-store.tsx');
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const provider = source.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
    .find(node => node.name.getText(source) === 'FleetRouteStoreProvider').initializer;
  const callback = provider.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
    .find(node => node.name.getText(source) === 'refreshStaff').initializer.arguments[0];
  const { run } = loadText(`exports.run = (apiClient, getAuthToken, getCurrentUser, setAvailableStaff) => (${callback.getText(source)})();`, file);
  for (const role of ['CUSTOMER', 'DRIVER_ESCORT', 'TRANSPORT_SPECIALIST', 'FLEET_ROUTE_COORDINATOR', 'LOGISTICS_MANAGER', 'ADMIN']) {
    let calls = 0, saved = [{ id: 99 }];
    await run(async url => { assert.equal(url, '/fleet/staff'); calls++; return []; }, () => 'test-token', () => ({ role }), value => { saved = value; });
    assert.equal(calls, ['FLEET_ROUTE_COORDINATOR', 'LOGISTICS_MANAGER', 'ADMIN'].includes(role) ? 1 : 0);
    assert.deepEqual(saved, [], 'Stale staff from another session must be cleared, including an empty catalog');
  }
  await run(async () => { throw Error('Must not call staff before login'); }, () => null, () => ({ role: 'ADMIN' }), () => {});
});
