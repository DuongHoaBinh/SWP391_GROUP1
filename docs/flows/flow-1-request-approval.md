# Flow 1: Create and Approve Transport Request (Required)

## Actors

Customer, Logistics Manager

## Main path

1. Customer enters origin, destination, domestic/international scope, requested dates, horse count, horse details, and special requirements.
2. Customer submits the request and uploads available identity/medical documents.
3. The system creates the request as `DRAFT` or `SUBMITTED` and records the customer and timestamp.
4. Logistics Manager reviews feasibility, service scope, dates, and requested requirements.
5. Manager either requests changes, rejects the request with a reason, or approves it for planning.
6. For an approved request, the manager assigns work to the Transport Specialist, Fleet & Route Coordinator, and Driver / Escort as planning becomes available.

## Key rules

- An order must contain at least one horse, origin, destination, and requested transport date before submission.
- Rejection and change requests require a reason.
- Only the Logistics Manager can approve or reject a submitted order.
- Customer edits after a change request create a new revision and preserve the previous version.
- Approval does not mean the trip can depart; document readiness and operational planning are separate gates.

## SePay payment rules

- After approval and a positive integer VND quote, the customer creates/reuses one transfer QR for the order. Backend checks ownership and uses the database amount.
- Default code is DH plus eight digits, matching SePay's numeric recognition pattern. Code, account and amount are persisted before displaying QR.
- Only a fresh HMAC-signed incoming transfer matching bank, account, exact code, amount and eligible shipment marks payment succeeded. Samples and browser actions never settle.
- Retries never double-credit. Partial/extra money, changed quotes and unavailable orders require review. No automatic second collection or installment summation.
- Status polling rechecks the current quote, shipment eligibility and receiving configuration; obsolete transfer instructions are hidden before any transfer. Once review is required, later transfers remain auditable and cannot automatically confirm payment.
- MySQL stores receipt audit, payment state and notification atomically. Payment does not change transport state or introduce new gates in Flows 1-4. Historical sandbox data is retained but never counts as real money.

## Outputs

Approved order, assigned work items, order status history, and customer notification.

**Owner:** `backend/src/modules/orders`  
**Primary UI:** `frontend/src/app/customer`, `frontend/src/app/manager`
