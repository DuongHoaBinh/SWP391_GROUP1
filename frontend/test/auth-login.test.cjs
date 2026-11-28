const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function compile(source, filename, overrides = {}) {
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths;
  loaded.require = name => (name in overrides ? overrides[name] : require(name));
  loaded._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
  return loaded.exports;
}
const pageFile = path.resolve(__dirname, '../src/app/(auth)/login/page.tsx');
const source = ts.createSourceFile(pageFile, fs.readFileSync(pageFile, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const page = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'LoginFormContent');
const handler = page.body.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations]).find(node => node.name.getText(source) === 'handleLogin').initializer;
const factory = compile(`exports.make = function(deps) {
  const {isLoading, isSuccess, email, password, rememberMe, searchParams, router, mockCurrentUser, setIsLoading, setError, setAuthSession, setIsSuccess, getPostLoginRedirect, loginWithPassword} = deps;
  return ${handler.getText(source)};
};`, pageFile).make;
const redirectFile = path.resolve(__dirname, '../src/lib/auth-redirect.ts');
const authRedirectExports = compile(fs.readFileSync(redirectFile, 'utf8'), redirectFile);
const { getPostLoginRedirect } = authRedirectExports;
const loginFile = path.resolve(__dirname, '../src/lib/auth-login.ts');
const { loginWithPassword, loginWithGoogle } = fs.existsSync(loginFile)
  ? compile(fs.readFileSync(loginFile, 'utf8'), loginFile, { './auth-redirect': authRedirectExports })
  : {};

async function runLogin({ status = 200, body, offline = false, redirect = null } = {}) {
  const state = { sessions: [], errors: [], successes: [], fullNavigations: [], routerNavigations: [] };
  const old = { fetch: global.fetch, window: global.window, localStorage: global.localStorage, setTimeout: global.setTimeout };
  try {
    global.fetch = async () => { if (offline) throw new TypeError('Failed to fetch'); return { ok: status >= 200 && status < 300, status, json: async () => body }; };
    global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    global.window = { location: { replace: target => state.fullNavigations.push(target) } };
    global.setTimeout = callback => { callback(); return 0; };
    const callback = factory({ isLoading: false, isSuccess: false, email: 'customer@example.test', password: 'test-only', rememberMe: false,
      searchParams: new URLSearchParams(redirect ? { redirect } : {}), router: { push: target => state.routerNavigations.push(target) },
      mockCurrentUser: { id: 'demo', role: 'CUSTOMER' }, setIsLoading() {}, setError: error => { if (error) state.errors.push(error); },
      setAuthSession: (...args) => state.sessions.push(args), setIsSuccess: value => state.successes.push(value), getPostLoginRedirect, loginWithPassword });
    await callback({ preventDefault() {} }); return state;
  } finally { for (const [key, value] of Object.entries(old)) { if (value === undefined) delete global[key]; else global[key] = value; } }
}

for (const [name, input] of [
  ['offline backend', { offline: true }],
  ['server error', { status: 500, body: { message: 'Server unavailable' } }],
  ['missing access token', { body: { user: { id: '7', email: 'customer@example.test', role: 'CUSTOMER' } } }],
  ['unknown role', { body: { accessToken: 'test-token', user: { id: '7', email: 'customer@example.test', role: 'UNKNOWN' } } }],
]) test(`${name} never creates a fake session or reports login success`, async () => {
  const state = await runLogin(input);
  assert.equal(state.sessions.length, 0); assert.ok(!state.successes.includes(true));
  assert.equal(state.fullNavigations.length + state.routerNavigations.length, 0); assert.ok(state.errors.length > 0);
});

test('wrong password stays on login and shows a Vietnamese error', async () => {
  const state = await runLogin({ status: 401, body: { message: 'Invalid email or password' } });
  assert.equal(state.sessions.length, 0); assert.equal(state.errors[0], 'Email hoặc mật khẩu không đúng.');
});

test('successful login saves the actual session before a fresh dashboard navigation', async () => {
  const state = await runLogin({ body: { accessToken: 'test-token', user: { id: '7', email: 'customer@example.test', role: 'LOGISTICS_MANAGER', fullName: 'Manager' } } });
  assert.equal(state.sessions[0][0], 'test-token'); assert.equal(state.sessions[0][1].role, 'LOGISTICS_MANAGER');
  assert.deepEqual(state.fullNavigations, ['/manager']); assert.deepEqual(state.routerNavigations, []);
});

test('redirect to root or an authentication page cannot bounce a successful login back to login', () => {
  for (const target of ['/', '/login', '/login?redirect=/customer', '//example.test', '/\\example.test']) assert.equal(getPostLoginRedirect(target, '/customer'), '/customer');
  assert.equal(getPostLoginRedirect('/customer/requests/7', '/customer'), '/customer/requests/7');
});

test('mounting login does not clear an existing session during navigation', () => {
  const effect = page.body.statements.filter(ts.isExpressionStatement).map(statement => statement.expression).find(expression => ts.isCallExpression(expression) && expression.expression.getText(source) === 'useEffect').arguments[0];
  const run = compile(`exports.run = function(deps) { const {searchParams,clearAuthSession,setEmail,setRememberMe}=deps;return (${effect.getText(source)})();};`, pageFile).run;
  let clears = 0; const old = global.localStorage;
  try { global.localStorage = { getItem: () => null }; run({ searchParams: new URLSearchParams(), clearAuthSession: () => { clears++; }, setEmail() {}, setRememberMe() {} }); assert.equal(clears, 0); }
  finally { if (old === undefined) delete global.localStorage; else global.localStorage = old; }
});

test('loginWithGoogle throws user-friendly error on backend failure', async () => {
  const oldFetch = global.fetch;
  try {
    global.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Token xác thực Google không hợp lệ hoặc đã hết hạn' }),
    });
    await assert.rejects(
      async () => loginWithGoogle('http://localhost:5000/api', 'invalid-google-token'),
      /Token xác thực Google không hợp lệ hoặc đã hết hạn/
    );
  } finally {
    global.fetch = oldFetch;
  }
});

test('loginWithGoogle successfully formats customer session from valid response', async () => {
  const oldFetch = global.fetch;
  try {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        accessToken: 'valid-google-jwt',
        user: {
          id: '10',
          email: 'google.customer@example.com',
          role: 'Customer',
          fullName: 'Google Customer',
          avatarUrl: 'https://lh3.googleusercontent.com/avatar',
        },
      }),
    });
    const session = await loginWithGoogle('http://localhost:5000/api', 'valid-google-token');
    assert.equal(session.accessToken, 'valid-google-jwt');
    assert.equal(session.user.id, '10');
    assert.equal(session.user.email, 'google.customer@example.com');
    assert.equal(session.user.role, 'CUSTOMER');
    assert.equal(session.user.name, 'Google Customer');
  } finally {
    global.fetch = oldFetch;
  }
});
