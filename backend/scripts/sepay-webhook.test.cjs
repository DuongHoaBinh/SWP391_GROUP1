const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHmac, randomBytes } = require('node:crypto');
const { createReceiver, WEBHOOK_PATH } = require('./sepay-webhook.cjs');
const http = require('node:http');

test('authentic receipts persist, reject tampering, and deduplicate after restart', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-sepay-test-'));
  const secret = randomBytes(32).toString('hex');
  const accountNumber = '0123456789';
  let server;
  let url;
  const start = async () => {
    server = createReceiver({ secret, accountNumber, directory });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}${WEBHOOK_PATH}`;
  };
  const stop = () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  const post = (payload, { expired = false, tamper = false, signature = true } = {}) => {
    const raw = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000) - (expired ? 600 : 0));
    const headers = { 'Content-Type': 'application/json' };
    if (signature) {
      headers['X-SePay-Timestamp'] = timestamp;
      headers['X-SePay-Signature'] = 'sha256=' + createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
    }
    return fetch(url, { method: 'POST', headers, body: tamper ? raw + ' ' : raw });
  };
  const payload = { id: 42, accountNumber, transferType: 'in', transferAmount: 10000, content: 'HT12AB34CD56' };
  try {
    await start();
    assert.equal((await post(payload, { signature: false })).status, 401);
    assert.equal((await post(payload, { tamper: true })).status, 401);
    assert.equal((await post(payload, { expired: true })).status, 401);
    assert.equal((await post({ ...payload, accountNumber: '9999' })).status, 422);
    assert.equal((await post({ ...payload, id: '../escape' })).status, 400);
    assert.equal((await post({ ...payload, transferAmount: -1 })).status, 400);
    const concurrent = await Promise.all([post(payload), post(payload)]);
    for (const result of concurrent) {
      assert.equal(result.status, 200);
      assert.deepEqual(await result.json(), { success: true });
    }
    const journal = path.join(directory, 'inbox.ndjson');
    assert.equal(fs.readFileSync(journal, 'utf8').trim().split('\n').length, 1);
    assert.equal((await post({ ...payload, transferAmount: 20000 })).status, 409);
    await stop();
    await start();
    assert.equal((await post(payload)).status, 200);
    assert.equal(fs.readFileSync(journal, 'utf8').trim().split('\n').length, 1);
    assert.equal((await post({ ...payload, id: 0, accountNumber: 'sample' })).status, 200);
    const receipts = fs.readFileSync(journal, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(receipts.length, 2);
    assert.equal(receipts[1].isTest, true);
    assert.equal((await fetch(url.replace(WEBHOOK_PATH, '/api/docs'))).status, 404);
    const ready = await (await fetch(url)).json();
    assert.equal(ready.mode, 'receive-only');
  } finally {
    if (server?.listening) await stop();
    for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name));
    fs.rmdirSync(directory);
  }
});

test('integrated gateway forwards original signed bytes and preserves retry errors', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-sepay-forward-test-'));
  const secret = randomBytes(32).toString('hex');
  const accountNumber = '0123456789';
  const raw = JSON.stringify({ content: 'Payment DH12345678', id: 43, gateway: 'MBBank', accountNumber, transferAmount: 15000, transferType: 'in' }, null, 2);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = 'sha256=' + createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
  let responseStatus = 200;
  let forwarded = 0;
  const upstream = http.createServer(async (req, res) => {
    assert.equal(req.url, WEBHOOK_PATH);
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') return res.end(JSON.stringify({ status: 'ready', mode: 'integrated' }));
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString('utf8'), raw);
    assert.equal(req.headers['x-sepay-timestamp'], timestamp);
    assert.equal(req.headers['x-sepay-signature'], signature);
    forwarded++;
    res.statusCode = responseStatus;
    res.end(JSON.stringify({ success: responseStatus === 200 }));
  });
  const stop = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  let gateway;
  try {
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
    gateway = createReceiver({ secret, accountNumber, directory, forwardUrl: `http://127.0.0.1:${upstream.address().port}` });
    await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${gateway.address().port}${WEBHOOK_PATH}`;
    const post = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SePay-Timestamp': timestamp, 'X-SePay-Signature': signature }, body });
    assert.equal((await (await fetch(url)).json()).mode, 'integrated');
    assert.equal((await post(raw + ' ')).status, 401);
    assert.equal(forwarded, 0);
    assert.equal((await post(raw)).status, 200);
    responseStatus = 409;
    assert.equal((await post(raw)).status, 409);
    responseStatus = 500;
    assert.equal((await post(raw)).status, 500);
    assert.equal(forwarded, 3);
    assert.equal(fs.existsSync(path.join(directory, 'inbox.ndjson')), false);
    await stop(upstream);
    assert.equal((await post(raw)).status, 503);
    assert.equal((await fetch(url.replace(WEBHOOK_PATH, '/api/docs'))).status, 404);
  } finally {
    if (gateway?.listening) await stop(gateway);
    if (upstream.listening) await stop(upstream);
    fs.rmdirSync(directory);
  }
});
