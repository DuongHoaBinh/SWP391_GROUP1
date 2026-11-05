const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function render(state, props = {}, loadError) {
  const filename = path.resolve(__dirname, '../src/features/orders/components/SepayPayment.tsx');
  let swrOptions;
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = module.paths;
  compiled.require = name => {
    if (name === 'swr') return (key, fetcher, options) => {
      swrOptions = options;
      return { data: state, error: loadError, mutate() {}, isLoading: false, isValidating: false };
    };
    if (name === 'next/link') return ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children);
    if (name === 'lucide-react') return Object.fromEntries(['CheckCircle2', 'Copy', 'QrCode', 'RefreshCw', 'ShieldCheck'].map(icon => [icon, () => null]));
    if (name === '@/lib/auth') return { getCurrentUser: () => ({ id: 99 }) };
    if (name === '@/lib/api-client') return { apiClient: () => { throw new Error('Rendering must never initiate a transfer'); } };
    return require(name);
  };
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
  const html = renderToStaticMarkup(React.createElement(compiled.exports.SepayPayment, {
    shipmentId: 123, requestCode: 'REQ-TEST', amount: 15000, ...props,
  }));
  return { html, options: swrOptions };
}

const payment = {
  id: 9, shipmentId: 123, paymentCode: 'DH12345678', amount: 15000, status: 'pending',
  bankCode: 'MBBank', accountNumber: '0123456789', accountName: 'TEST ACCOUNT',
  qrUrl: 'https://vietqr.app/img?amount=15000', blockedReason: null, transactionId: null, paidAt: null,
};
const state = value => ({ enabled: true, provider: 'sepay', payment: value });

test('unpaid order opens its own checkout; checkout presents QR creation without declaring success', () => {
  const detail = render(state(null)).html;
  assert.match(detail, /href="\/customer\/requests\/123\/payment"/);
  assert.doesNotMatch(detail, /<img|Đã nhận/);
  const checkout = render(state(null), { checkout: true }).html;
  assert.match(checkout, /Tạo mã QR thanh toán/);
  assert.match(checkout, /href="\/customer\/requests\/123#sepay-payment"/);
  assert.match(checkout, /Đóng thanh toán và về đơn/);
});

test('pending checkout displays exact transfer details and polls; closing is a navigation link', () => {
  const { html, options } = render(state(payment), { checkout: true });
  for (const value of ['DH12345678', '15.000 VND', '0123456789', 'TEST ACCOUNT']) assert.ok(html.includes(value));
  assert.match(html, /<img/);
  assert.match(html, /Đóng thanh toán và về đơn/);
  assert.match(html, /chỉ đóng màn hình thanh toán/);
  assert.equal(options.refreshInterval(state(payment)), 3000);
  const detail = render(state(payment)).html;
  assert.doesNotMatch(detail, /<img/);
  assert.match(detail, /Tiếp tục thanh toán/);
});

test('verified success displays receipt and return links, removes QR and stops polling', () => {
  const paid = { ...payment, status: 'succeeded', qrUrl: null, transactionId: '123456', paidAt: '2026-11-01T00:00:00Z' };
  const { html, options } = render(state(paid), { checkout: true });
  assert.match(html, /Đã nhận 15.000 VND/);
  assert.match(html, /123456/);
  assert.match(html, /Về chi tiết đơn/);
  assert.match(html, /href="\/customer\/requests"/);
  assert.doesNotMatch(html, /<img|Tạo mã QR|Đóng thanh toán/);
  assert.equal(options.refreshInterval(state(paid)), 0);
});

test('review, changed quote, blocked order, network failure and disabled gateway hide transfer instructions', () => {
  const review = render(state({ ...payment, status: 'review', qrUrl: null }), { checkout: true }).html;
  assert.match(review, /Giao dịch cần đối soát/);
  assert.match(review, /Chưa chuyển thêm tiền/);
  const changed = render(state(payment), { checkout: true, amount: 20000 }).html;
  assert.match(changed, /Báo giá đã thay đổi/);
  const blocked = render(state({ ...payment, qrUrl: null, blockedReason: 'Đơn đã hủy' }), { checkout: true }).html;
  assert.match(blocked, /Đơn đã hủy/);
  const failed = render(state(payment), { checkout: true }, new Error('Network unavailable')).html;
  assert.match(failed, /Network unavailable/);
  const disabled = render({ ...state(payment), enabled: false }, { checkout: true }).html;
  const ineligible = render(state(payment), { checkout: true, eligible: false }).html;
  assert.match(ineligible, /không còn đủ điều kiện/);
  for (const html of [review, changed, blocked, failed, disabled, ineligible]) assert.doesNotMatch(html, /<img|Tạo mã QR thanh toán/);
});

test('unapproved or unquoted order cannot create a payment', () => {
  const html = render(state(null), { checkout: true, eligible: false, amount: 0 }).html;
  assert.match(html, /Đơn cần được duyệt/);
  assert.doesNotMatch(html, /Tạo mã QR thanh toán|<img/);
});
