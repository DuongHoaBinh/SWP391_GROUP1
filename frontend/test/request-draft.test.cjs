const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const file = path.resolve(__dirname, '../src/features/orders/request-draft.ts');
const loaded = new Module(file, module); loaded.paths = module.paths;
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { readRequestDraft, requestDraftKey, saveRequestDraft } = loaded.exports;
function storage() { const items = new Map(); return { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) }; }
const draft = { version: 1, savedAt: 1000000000, fields: { title: 'Transport test', transportType: 'Domestic', origin: 'A', destination: 'B',
  departureDate: '2099-01-01', arrivalDate: '2099-01-02', horseCount: 3, specialReqs: 'Keep this note' }, currentStep: 3,
  horseQuantities: { '9': 3 }, bookingType: 'dedicated_charter', insuranceValues: { '9': { declaredValue: '1000000.50', declaredCurrency: 'USD', insurancePackage: 'premium' } },
  routeData: { distanceKm: 200, durationHours: 4, mode: 'road', source: 'road-routing' } };
test('reload restores fields, review step, quantities, booking, policy, decimals and route choice exactly', () => {
  const store = storage(), key = requestDraftKey('customer-a');
  assert.equal(saveRequestDraft(store, key, draft), true);
  assert.deepEqual(readRequestDraft(store, key, draft.savedAt), draft);
  assert.equal(readRequestDraft(store, requestDraftKey('customer-b'), draft.savedAt), null);
  assert.equal(readRequestDraft(store, requestDraftKey('customer-a', '9'), draft.savedAt), null);
  assert.equal(saveRequestDraft(store, key, { ...draft, fields: { ...draft.fields, title: '', arrivalDate: '' }, currentStep: 1 }), true);
  assert.equal(readRequestDraft(store, key, draft.savedAt).fields.title, '');
});
test('expired, corrupted and untrusted drafts cannot bypass the form state shape', () => {
  const store = storage(), key = requestDraftKey('customer');
  for (const invalid of ['bad-json', JSON.stringify({ ...draft, currentStep: 99 }), JSON.stringify({ ...draft, horseQuantities: { '__proto__': 1, nope: -1 } })]) {
    store.setItem(key, invalid); assert.equal(readRequestDraft(store, key, draft.savedAt), null);
  }
  saveRequestDraft(store, key, draft); assert.equal(readRequestDraft(store, key, draft.savedAt + 8 * 86400000), null);
  assert.equal(store.getItem(key), null);
});
test('disabled or full browser storage does not crash the request form', () => {
  const broken = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); }, removeItem() { throw Error('blocked'); } };
  assert.equal(saveRequestDraft(broken, 'key', draft), false);
  assert.equal(readRequestDraft(broken, 'key'), null);
});

test('the real submit handler keeps the draft on API failure and clears it only after successful creation', async () => {
  const pageFile = path.resolve(__dirname, '../src/app/customer/requests/new/page.tsx');
  const source = ts.createSourceFile(pageFile, fs.readFileSync(pageFile, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'CreateTransportRequestForm');
  const handler = component.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
    .find(node => node.name.getText(source) === 'onSubmitForm').initializer;
  const runner = new Module(pageFile, module); runner.paths = module.paths;
  runner._compile(ts.transpileModule(`exports.submit = (context, data) => {
    const { isSubmitting, validateInsurance, setSubmitError, setIsSubmitting, selectedHorses, insuranceValues, defaultInsurance,
      getCurrentUser, routeData, travelDurationLabel, bookingType, totalSelectedHorses, apiClient, draftSubmitted, draftStorageKey,
      sessionStorage, refreshHorses, router, console } = context;
    return (${handler.getText(source)})(data);
  };`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, pageFile);
  for (const fail of [true, false]) {
    const store = storage(); store.setItem('draft-key', 'preserved content');
    let errorMessage = '', navigation = null, requestBody;
    const context = {
      isSubmitting: false, validateInsurance: () => true, setSubmitError: value => { errorMessage = value; }, setIsSubmitting() {},
      selectedHorses: [{ id: '9', backendId: 9, name: 'Horse A', quantity: 2, gender: 'Stallion' }],
      insuranceValues: { '9': { declaredValue: '1000000.50', declaredCurrency: 'VND', insurancePackage: 'standard' } }, defaultInsurance: {},
      getCurrentUser: () => ({ fullName: 'Test Customer', email: 'customer@example.test', phone: '0900000000' }),
      routeData: null, travelDurationLabel() {}, bookingType: 'dedicated_charter', totalSelectedHorses: 2,
      apiClient: async (url, options) => { assert.equal(url, '/orders'); requestBody = JSON.parse(options.body); if (fail) throw Error('Internal server error'); return { id: 5001 }; },
      draftSubmitted: { current: false }, draftStorageKey: { current: 'draft-key' }, sessionStorage: store,
      refreshHorses: async () => {}, router: { push: url => { navigation = url; } }, console: { error() {} },
    };
    await runner.exports.submit(context, { ...draft.fields, horseCount: 2 });
    assert.equal(requestBody.expectedArrivalDate, draft.fields.arrivalDate);
    assert.equal(requestBody.horses[0].declaredValue, 1000000.50);
    if (fail) {
      assert.equal(store.getItem('draft-key'), 'preserved content'); assert.equal(context.draftSubmitted.current, false);
      assert.equal(navigation, null); assert.match(errorMessage, /Nội dung vẫn được giữ lại/);
    } else {
      assert.equal(store.getItem('draft-key'), null); assert.equal(context.draftSubmitted.current, true);
      assert.equal(navigation, '/customer/requests/5001');
    }
  }
});
