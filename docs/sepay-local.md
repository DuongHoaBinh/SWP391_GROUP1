# SePay local setup

Checkout is integrated into the NestJS orders module and MySQL. The port-5002
gateway forwards original signed raw requests to port 5000. Only the webhook path
is tunneled; other backend routes and uploads are not publicly exposed. The
ngrok account's fixed dev domain is used for the public URL. The SePay HMAC
secret is unchanged when switching tunnel providers.

## This machine

- Frontend: http://localhost:3000
- Backend: http://localhost:5000/api
- Dedicated portable MySQL 8.4.13: 127.0.0.1:3307; data in backend/.local/mysql/data.
- Database connection, JWT, SMTP, SePay bank details, HMAC secret and forwarding target: backend/.env.
- Local customer/manager login: backend/.local/mysql/local-accounts.txt.
- Root credential backup: backend/.local/mysql/admin.env. Keep this private.

Environment files and .local directories are ignored by Git. Copy the value of
SEPAY_WEBHOOK_SECRET into SePay's HMAC Secret Key field. Do not rotate only one side.

Before the first ngrok start:

1. Install ngrok from the Microsoft Store: `winget install ngrok -s msstore`.
2. Sign in at https://dashboard.ngrok.com/get-started/your-authtoken and copy
   the agent Authtoken into `NGROK_AUTHTOKEN` in backend/.env. Do not paste a CLI
   command, an API key or a SePay secret into this field; never send tokens in chat.
3. Optionally set `NGROK_DOMAIN` to the assigned hostname from the ngrok dashboard
   (without https:// or a path). If blank, ngrok chooses the fixed dev domain
   assigned to the account. Subsequent starts explicitly reuse the hostname saved
   in runtime.json. A different account/domain requires updating the SePay URL.

Start the already-built project from the repository root:

```powershell
.\backend\scripts\start-project-local.ps1
```

Keep the computer online and processes running. They are not startup services.
The script reuses the running ngrok tunnel or starts it with the same hostname.
Set SePay's webhook URL to the printed HTTPS URL **once after migration from
Cloudflare**. No dashboard edit is needed for normal restarts on the same domain.
An existing Cloudflare process is stopped only after the ngrok public health
check passes. If credentials/startup fail, the previous runtime is preserved.
The current URL and tunnel PID are saved in backend/.local/sepay/runtime.json.
Logs are ngrok.log/ngrok-error.log in that directory. The local agent API binds
only to 127.0.0.1:4043, and request-body inspection is disabled. The public
tunnel forwards only to the port-5002 gateway, not directly to the whole backend.
The generated ngrok.yml contains no credentials; the token is passed through
the child environment, never CLI arguments. MySQL data is
persistent; do not delete the data directory to restart the server.

The domain staying fixed does not keep the backend online: the computer,
database, backend, gateway and ngrok must be running with internet access.
ngrok free-plan HTTP/bandwidth quotas still apply; dashboard Usage tracks them.
After an outage, replay failed real deliveries from SePay's webhook history.
A successful Send test checks connectivity only; it does not settle an order.

## Team setup

Pull the latest `feature/tracking-and-momo` before using the ngrok startup script.
The payment variables alone do not set up MySQL, JWT, dependencies or migrations;
follow the steps under **Another machine or deployment** as well.

Choose which environment owns the orders and receives bank webhooks:

- **Shared environment:** keep one backend, one MySQL database and one tunnel
  running. Every customer/tester must use that backend for both creating the
  payment code and reading payment status. Copying bank/ngrok variables to a
  separate local database does not share orders or receipts.
- **Independent local testing:** each developer uses their own ngrok account/token
  and assigned domain. Configure a separate SePay webhook for the intended
  environment; a webhook URL points to one receiver. A code created in another
  database cannot be settled by this receiver. Agree on which environment to use
  before transferring real funds.

Keep `SEPAY_WEBHOOK_SECRET` consistent with HMAC-SHA256 on the corresponding
SePay webhook. Share necessary credentials privately, never in Git or a public
channel. If a token or HMAC secret was exposed, replace it: update the ngrok token
in backend/.env and restart its process; update the SePay HMAC secret on the
dashboard, backend/.env, backend and gateway together. Do not rotate only one side.

On a Windows developer machine with dependencies installed and database ready:

```powershell
winget install ngrok -s msstore
# Save DB/JWT/SePay settings and your ngrok token in backend/.env, then build.
cd backend
npm ci
npm run build
cd ../frontend
npm ci
npm run build
cd ..
powershell -NoProfile -ExecutionPolicy Bypass -File backend/scripts/start-project-local.ps1
```

Use the printed webhook URL on SePay, enable retries, and send a dashboard test.
Keep the machine and processes running during testing. The frontend API URL
must be configured before its build; changes to NEXT_PUBLIC_API_BASE_URL need a
new frontend build. See the deployment section below for database migrations.

## SePay Dashboard

Select incoming transfers, the receiving account, JSON, retries enabled and
HMAC-SHA256. Enable payment verification and code recognition. Select prefix DH.
The numeric suffix must allow eight digits (for example min=6/max=8 or min=max=8).
If your DH pattern differs, set SEPAY_CODE_LENGTH to the same supported length.

The QR contains the account, exact VND quote and payment code. The browser polls
every three seconds for bank-confirmed success. Creating QR/checking status does
not transfer money. This checkout uses real bank transfers.

### Customer navigation

- Order detail `/customer/requests/:id` shows payment status and a checkout link.
- QR checkout is `/customer/requests/:id/payment`. Success comes only from the
  verified backend response, never from query parameters or browser navigation.
- After success, **Về chi tiết đơn** returns to
  `/customer/requests/:id#sepay-payment`; **Danh sách đơn hàng** opens
  `/customer/requests`.
- **Đóng thanh toán và về đơn** returns to the same order detail. This closes the
  screen only. It does not cancel a transfer/order or issue a refund. An existing
  pending code stays valid and receives later webhooks. Reopening the checkout
  reuses it, so a customer who already sent money should wait instead of paying twice.
- There are no external success/cancel redirect URLs to configure for this QR flow.

## Another machine or deployment

1. Install Node.js 22+, MySQL 8.0+ and dependencies in backend and frontend.
2. Create backend/.env from .env.example, including a strong JWT_SECRET. Configure
   SEPAY_* values alongside DB/JWT/SMTP in backend/.env, never NEXT_PUBLIC_*.
3. On an existing project database run node database/apply-sepay-migration.cjs.
   Migration 015 preserves historical sandbox data.
4. For a new database use database/schema.mysql.sql. The local prerequisites
   helper adds missing horse fields and applies migrations 010-011 if absent:
   node database/apply-local-prerequisites.cjs, then
   node database/apply-tracking-migration.cjs.
   setup-local-database.cjs is specifically for a newly initialized portable
   instance on port 3307 and refuses an existing .env or populated database.
5. Build backend and frontend. Set NEXT_PUBLIC_API_BASE_URL to the backend /api
   address for the frontend build. Deploy NestJS with HTTPS and persistent MySQL.
   Set SePay URL to https://YOUR-BACKEND/api/payments/sepay/webhook. A local gateway
   and tunnel are not required on deployment.
6. Configure SMTP separately for email registration. Local login credentials are
   in local-accounts.txt. SMTP credentials have not been invented.

## Verification and reconciliation

Start backend, then run npm run test:sepay in backend. Tests use temporary MySQL
fixtures, real HTTP/JWT and signed synthetic bank payloads. They transfer no bank
funds. Gateway tests: node --test scripts/sepay-webhook.test.cjs.
Frontend component state/navigation tests: run npm run test:sepay in frontend.
See [payment review](sepay-review.md) for covered cases and remaining live checks.

Dashboard id=0 samples check connectivity without financial writes. A real
payment requires the configured bank/account, a unique exact code in content and
the exact amount. Verify with a small real bank transfer on an actual quoted order
when ready. Partial/extra amounts, changed quotes and cancelled orders need staff
review; customers are told not to transfer again while in review.
Later exact transfers also remain in review for staff reconciliation. Status
polling hides obsolete QR/instructions when the quote, order or configuration changes.
Unmatched and ignored transfers remain in sepay_webhook_receipt. This version does not sum
installments, auto-refund or count sandbox results as real money.

The pre-integration backend/.local/sepay/inbox.ndjson remains historical and is not
replayed into settlement.

References: [HMAC](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc),
[webhooks](https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook),
[VietQR](https://developer.sepay.vn/vi/tien-ich-khac/tao-qr-code).
