# SePay payment review — 2026-11-01

## Expected flow

| Event | Payment state | Customer behavior |
| --- | --- | --- |
| Request submitted | unpaid | Wait for manager approval and quote |
| Approved with a positive whole-VND quote | unpaid | Open order payment page and create QR |
| QR created | pending | Exact bank/account/amount/code instructions; check every 3 seconds |
| Close checkout | pending | Return to the same order; reopening reuses the existing code |
| Matching signed incoming bank transaction | succeeded | QR removed; show receipt and links to order/list |
| Missing/extra money, quote change after transfer, unavailable order | review | Hide QR; contact staff; no automatic additional collection |
| Duplicate delivery | unchanged | One receipt identity and one success notification |
| Cancel an unapproved request without payment | unpaid; order cancelled | Persist cancellation; release reservations; no payment may be created |

Payment success does not change shipment status. Closing checkout does not reverse a bank transfer, invalidate its code, cancel the order or refund money. There is no separate `cancelled` payment state for a closed page.

## Fixes during this review

- Customer request list now displays real payment status and refreshes every 15 seconds; API failures no longer fall back to sample orders.
- Order/checkout eligibility refreshes every 10 seconds. Cached QR is hidden when eligibility is false, quote differs, gateway is disabled or payment refresh fails.
- Missing/forbidden order details display an error and recovery links instead of an endless loading screen.
- Cancel Request now calls an owned backend endpoint for unapproved requests. Approval and cancellation cannot overwrite each other concurrently.
- Approval API rejects fractional, negative and out-of-range VND quotes. The manager form converts USD to VND before submission.
- Payment status responses are not cacheable. Secrets remain backend-only and ignored by Git.

## Automated checks

- Backend build and frontend production build/type check.
- `backend`: `node --test test/sepay.integration.cjs` — isolated HTTP/MySQL fixtures covering ownership, persisted amounts, HMAC/raw body/timestamp, wrong bank/account/direction/code, under/overpayment, duplicate/concurrent delivery, success persistence, late success after closing, invalid quotes, order cancellation and concurrent approval.
- `backend`: `node --test scripts/sepay-webhook.test.cjs` — original signed-byte forwarding, tampering rejection, durable deduplication and retry errors.
- `frontend`: `npm run test:sepay` — rendered component states for unpaid/pending/review/success/error/disabled/ineligible orders and exact success/close navigation links. These are component tests with mocked data, not browser interaction tests.
- `backend`: `node --test test/tracking.integration.cjs` — regression check that payment/order work preserves transport tracking behavior.
- Temporary test users, horses, orders, notifications, payment rows and synthetic receipts are removed after testing. Real order 32 is not settled by tests.

## Live verification limits

- No real bank transfer was made. Synthetic signed receipts demonstrate application behavior, not bank settlement.
- Local public webhook health and a signed id=0 sample can be tested without creating a payment. The SePay dashboard still needs the current URL from `backend/.local/sepay/runtime.json` and a successful Send test from SePay itself.
- This review could not automate browser clicks: Computer Use rejected the current Windows/Coc Coc browser because URL policy enforcement is unsupported. Component rendering and HTTP checks do not replace a manual browser walkthrough.
- Partial/extra money needs staff reconciliation. There is no automatic refund, installment summation, reconciliation screen or recovery through SePay transaction API when a webhook is permanently missed.
- Local startup now uses the ngrok account's fixed dev domain (requires NGROK_AUTHTOKEN in backend/.env) and reuses the saved hostname on restart. Migrate the SePay dashboard URL once from the previous Cloudflare quick tunnel. A running computer/backend/database/tunnel is still required, and ngrok usage quotas apply. Use a stable HTTPS backend URL when deployed.

## ngrok migration verification — 2026-11-01

- Installed the Microsoft Store ngrok agent and validated its configuration.
- The public ngrok URL returned HTTP 200 with `{"success":true}` for a signed
  id=0 connectivity sample, HTTP 401 for an unsigned request, and HTTP 404 for
  `/api/orders`. The sample created no bank receipts or settlements.
- Restarted the project tunnel once and verified the webhook URL stayed identical.
  Running the startup script again reused that same active tunnel.
- The current URL is recorded in the private runtime.json. The previous project
  Cloudflare tunnel was stopped after the ngrok public health check passed.
- SePay dashboard migration and replay of actual transaction 95120953 still
  require the account owner. Its DH19690057 code is absent from this local database;
  receiving that transfer alone cannot assign it to an order or settle one.
