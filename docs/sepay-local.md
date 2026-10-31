# SePay local setup

Checkout is integrated into the NestJS orders module and MySQL. The port-5002
gateway forwards original signed raw requests to port 5000. Only the webhook path
is tunneled; other backend routes and uploads are not publicly exposed. This
machine's existing public URL and HMAC secret have been preserved.

## This machine

- Frontend: http://localhost:3000
- Backend: http://localhost:5000/api
- Dedicated portable MySQL 8.4.13: 127.0.0.1:3307; data in backend/.local/mysql/data.
- Database connection and JWT secret: backend/.env.
- SePay bank details, HMAC secret and forwarding target: backend/.env.sepay.local.
- Local customer/manager login: backend/.local/mysql/local-accounts.txt.
- Root credential backup: backend/.local/mysql/admin.env. Keep this private.

Environment files and .local directories are ignored by Git. Copy the value of
SEPAY_WEBHOOK_SECRET into SePay's HMAC Secret Key field. Do not rotate only one side.

Start the already-built project from the repository root:

```powershell
.\backend\scripts\start-project-local.ps1
```

Keep the computer online and processes running. They are not startup services.
The script reuses the running tunnel. Restarting cloudflared can change its URL;
update SePay if it changes. The current URL and tunnel PID are saved in
backend/.local/sepay/runtime.json. Logs are in that directory. MySQL data is
persistent; do not delete the data directory to restart the server.

## SePay Dashboard

Select incoming transfers, the receiving account, JSON, retries enabled and
HMAC-SHA256. Enable payment verification and code recognition. Select prefix DH.
The numeric suffix must allow eight digits (for example min=6/max=8 or min=max=8).
If your DH pattern differs, set SEPAY_CODE_LENGTH to the same supported length.

The QR contains the account, exact VND quote and payment code. The browser polls
every three seconds for bank-confirmed success. Creating QR/checking status does
not transfer money. This checkout uses real bank transfers.

## Another machine or deployment

1. Install Node.js 22+, MySQL 8.0+ and dependencies in backend and frontend.
2. Create backend/.env from .env.example, including a strong JWT_SECRET. Configure
   SEPAY_* values in backend/.env or backend/.env.sepay.local, never NEXT_PUBLIC_*.
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

Dashboard id=0 samples check connectivity without financial writes. A real
payment requires the configured bank/account, a unique exact code in content and
the exact amount. Verify with a small real bank transfer on an actual quoted order
when ready. Partial/extra amounts, changed quotes and cancelled orders need staff
review; customers are told not to transfer again while in review. Unmatched and
ignored transfers remain in sepay_webhook_receipt. This version does not sum
installments, auto-refund or count sandbox results as real money.

The pre-integration backend/.local/sepay/inbox.ndjson remains historical and is not
replayed into settlement.

References: [HMAC](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc),
[webhooks](https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook),
[VietQR](https://developer.sepay.vn/vi/tien-ich-khac/tao-qr-code).
