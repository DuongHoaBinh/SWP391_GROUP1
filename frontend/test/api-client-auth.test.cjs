const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/lib/api-client.ts');
const expiredMessage = 'Phiên đăng nhập đã hết hạn hoặc không còn hợp lệ. Vui lòng đăng nhập lại.';

function loadClient(auth) {
  const loaded = new Module(filename, module);
  loaded.filename = filename; loaded.paths = module.paths;
  loaded.require = name => name === './auth' ? auth : require(name);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
  return loaded.exports.apiClient;
}

async function fixture(run, { pathname = '/customer/requests', token = 'expired-session' } = {}) {
  const saved = { fetch: global.fetch, window: global.window, localStorage: global.localStorage };
  const state = { token, clears: 0, redirects: [], requests: [] };
  try {
    global.localStorage = { getItem: () => 'vi' };
    global.window = { location: { pathname, search: '?status=planning', hash: '#documents',
      replace: value => state.redirects.push(value) } };
    const client = loadClient({ getAuthToken: () => state.token, SESSION_EXPIRED_MESSAGE: expiredMessage,
      clearAuthSession: () => { state.token = null; state.clears++; } });
    state.respond = (status, body) => { global.fetch = async (url, options) => {
      state.requests.push({ url, authorization: options.headers.get('Authorization') });
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    }; };
    await run(client, state);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete global[key]; else global[key] = value;
    }
  }
}

for (const endpoint of ['/documents', '/orders/my-orders']) {
  test(`${endpoint}: expired authentication redirects to login instead of retrying a stale token`, () => fixture(async (client, state) => {
    state.respond(401, { message: 'Invalid or expired authentication token' });
    await assert.rejects(client(endpoint), { message: expiredMessage });
    assert.equal(state.clears, 1);
    const target = new URL(state.redirects[0], 'http://localhost');
    assert.equal(target.pathname, '/login');
    assert.equal(target.searchParams.get('reason'), 'session-expired');
    assert.equal(target.searchParams.get('redirect'), '/customer/requests?status=planning#documents');
  }));
}

test('parallel unauthorized requests clear the session and navigate only once', () => fixture(async (client, state) => {
  state.respond(401, { message: 'Expired' });
  const results = await Promise.allSettled([client('/documents'), client('/orders/my-orders')]);
  assert.ok(results.every(result => result.status === 'rejected'));
  assert.equal(state.clears, 1); assert.equal(state.redirects.length, 1);
}));

test('a delayed old request cannot clear a newly authenticated session', () => fixture(async (client, state) => {
  global.fetch = async () => {
    state.token = 'new-session';
    return new Response(JSON.stringify({ message: 'Expired' }), { status: 401 });
  };
  await assert.rejects(client('/documents'), { message: expiredMessage });
  assert.equal(state.token, 'new-session'); assert.equal(state.clears, 0); assert.equal(state.redirects.length, 0);
}));

test('missing local storage session also returns to login when the API rejects it', () => fixture(async (client, state) => {
  state.respond(401, {}); await assert.rejects(client('/documents'), { message: expiredMessage });
  assert.equal(state.clears, 1); assert.equal(state.redirects.length, 1);
}, { token: null }));

test('a rejected explicit authorization header cannot clear the current session', () => fixture(async (client, state) => {
  state.respond(401, {});
  await assert.rejects(client('/documents', { headers: { Authorization: 'Bearer another-request-token' } }), { message: expiredMessage });
  assert.equal(state.token, 'expired-session');
  assert.equal(state.clears, 0); assert.equal(state.redirects.length, 0);
}));

for (const pathname of ['/login', '/register', '/forgot-password']) {
  test(`${pathname}: unauthorized responses do not create an authentication redirect loop`, () => fixture(async (client, state) => {
    state.respond(401, {}); await assert.rejects(client('/auth/profile'), { message: expiredMessage });
    assert.equal(state.clears, 0); assert.equal(state.redirects.length, 0);
  }, { pathname }));
}

for (const status of [403, 500]) {
  test(`HTTP ${status} keeps the current session and original error`, () => fixture(async (client, state) => {
    state.respond(status, { message: 'Original error' });
    await assert.rejects(client('/documents'), { message: 'Original error' });
    assert.equal(state.clears, 0); assert.equal(state.redirects.length, 0);
  }));
}

test('network failures preserve the current session', () => fixture(async (client, state) => {
  global.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(client('/documents'), { message: 'Failed to fetch' });
  assert.equal(state.clears, 0); assert.equal(state.redirects.length, 0);
}));

test('successful reloads return real document and order data with the active token', () => fixture(async (client, state) => {
  state.respond(200, [{ id: 42 }]);
  assert.deepEqual(await client('/documents'), [{ id: 42 }]);
  assert.deepEqual(await client('/orders/my-orders'), [{ id: 42 }]);
  assert.ok(state.requests.every(request => request.authorization === 'Bearer expired-session'));
  assert.equal(state.clears, 0); assert.equal(state.redirects.length, 0);
}));
