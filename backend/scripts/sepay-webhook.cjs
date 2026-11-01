const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, createHmac, timingSafeEqual } = require('node:crypto');

const WEBHOOK_PATH = '/api/payments/sepay/webhook';

function createReceiver({ secret, accountNumber, directory, forwardUrl }) {
  if (typeof secret !== 'string' || secret.length < 32 || !/^\d+$/.test(accountNumber)) {
    throw new Error('Configure SEPAY_WEBHOOK_SECRET (32+ characters) and SEPAY_ACCOUNT_NUMBER.');
  }
  if (forwardUrl && !/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(forwardUrl)) {
    throw new Error('The local gateway forwards only to a loopback HTTP backend.');
  }
  fs.mkdirSync(directory, { recursive: true });
  const journal = path.join(directory, 'inbox.ndjson');
  const seen = new Map();
  if (fs.existsSync(journal)) {
    for (const line of fs.readFileSync(journal, 'utf8').split('\n').filter(Boolean)) {
      const record = JSON.parse(line);
      if (!record.isTest) seen.set(record.payload.id, record.digest);
    }
  }
  let queue = Promise.resolve();

  const reply = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer(async (req, res) => {
    if (req.url !== WEBHOOK_PATH) return reply(res, 404, { success: false });
    if (req.method === 'GET') {
      if (forwardUrl) {
        try {
          const upstream = await fetch(forwardUrl + WEBHOOK_PATH, { signal: AbortSignal.timeout(5000), redirect: 'error' });
          return reply(res, upstream.status, await upstream.json());
        } catch { return reply(res, 503, { service: 'ht-sepay-webhook', status: 'backend-unavailable' }); }
      }
      return reply(res, 200, { service: 'ht-sepay-webhook', status: 'ready', mode: 'receive-only' });
    }
    if (req.method !== 'POST') return reply(res, 405, { success: false });
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
      return reply(res, 415, { success: false, message: 'Use application/json.' });
    }
    const timestamp = req.headers['x-sepay-timestamp'];
    const signature = req.headers['x-sepay-signature'];
    if (typeof timestamp !== 'string' || !/^\d{10}$/.test(timestamp) ||
        Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
        typeof signature !== 'string' || !/^sha256=[a-fA-F0-9]{64}$/.test(signature)) {
      return reply(res, 401, { success: false, message: 'Invalid or expired signature.' });
    }
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 65536) {
          reply(res, 413, { success: false });
          return;
        }
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks);
      const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest();
      if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'))) {
        return reply(res, 401, { success: false, message: 'Invalid signature.' });
      }
      let payload;
      try { payload = JSON.parse(raw.toString('utf8')); }
      catch { return reply(res, 400, { success: false, message: 'Invalid JSON.' }); }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
          !Number.isSafeInteger(payload.id) || payload.id < 0 ||
          !['in', 'out'].includes(payload.transferType) ||
          !Number.isSafeInteger(payload.transferAmount) || payload.transferAmount <= 0 ||
          typeof payload.accountNumber !== 'string') {
        return reply(res, 400, { success: false, message: 'Invalid transaction.' });
      }
      // SePay's "Send test" uses id=0 and sample account details. Keep it separate.
      const isTest = payload.id === 0;
      if (!isTest && payload.accountNumber !== accountNumber) {
        return reply(res, 422, { success: false, message: 'Receiving account mismatch.' });
      }
      if (forwardUrl) {
        const upstream = await fetch(forwardUrl + WEBHOOK_PATH, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SePay-Signature': signature, 'X-SePay-Timestamp': timestamp },
          body: raw, signal: AbortSignal.timeout(15000), redirect: 'error',
        });
        return reply(res, upstream.status, await upstream.json());
      }
      const digest = createHash('sha256').update(raw).digest('hex');
      const save = queue.then(() => {
        if (!isTest && seen.has(payload.id)) {
          return seen.get(payload.id) === digest ? 200 : 409;
        }
        const fd = fs.openSync(journal, 'a', 0o600);
        try {
          fs.writeFileSync(fd, JSON.stringify({ receivedAt: new Date().toISOString(), isTest, digest, payload }) + '\n');
          fs.fsyncSync(fd);
        } finally { fs.closeSync(fd); }
        if (!isTest) seen.set(payload.id, digest);
        return 200;
      });
      queue = save.catch(() => {});
      const status = await save;
      reply(res, status, status === 200 ? { success: true } : { success: false, message: 'Transaction ID conflict.' });
    } catch {
      console.error('[SePay] Receipt failed; returning an error for retry.');
      if (!res.headersSent && !res.destroyed) reply(res, 503, { success: false });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}

if (require.main === module) {
  const envFile = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  const port = Number(process.env.SEPAY_WEBHOOK_PORT || 5002);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid webhook port.');
  const server = createReceiver({
    secret: process.env.SEPAY_WEBHOOK_SECRET,
    accountNumber: process.env.SEPAY_ACCOUNT_NUMBER,
    directory: path.resolve(__dirname, '../.local/sepay'),
    forwardUrl: process.env.SEPAY_BACKEND_URL,
  });
  server.on('error', () => { console.error('[SePay] Cannot listen on webhook port.'); process.exit(1); });
  server.listen(port, '127.0.0.1', () => console.log(`[SePay] Listening at http://127.0.0.1:${port}${WEBHOOK_PATH}`));
}

module.exports = { createReceiver, WEBHOOK_PATH };
