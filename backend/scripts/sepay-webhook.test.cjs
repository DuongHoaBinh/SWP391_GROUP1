const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHmac, randomBytes } = require('node:crypto');
const { createReceiver, WEBHOOK_PATH } = require('./sepay-webhook.cjs');

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
