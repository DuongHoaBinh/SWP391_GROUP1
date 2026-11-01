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
- A customer may cancel their own requested/change-requested order only before approval and before a SePay payment exists. Cancellation is persisted with a notification audit and releases horse reservations not held by another active order. Retrying cancellation does not duplicate the audit. Approval, rejection, change requests and resubmission cannot overwrite a cancellation after a concurrent state change.
- Customer edits after a change request create a new revision and preserve the previous version.
- Approval does not mean the trip can depart; document readiness and operational planning are separate gates.

## SePay payment rules

- After approval and a positive integer VND quote, the customer creates/reuses one transfer QR for the order. Backend checks ownership and uses the database amount.
- Default code is DH plus eight digits, matching SePay's numeric recognition pattern. Code, account and amount are persisted before displaying QR.
- Only a fresh HMAC-signed incoming transfer matching bank, account, exact code, amount and eligible shipment marks payment succeeded. Samples and browser actions never settle.
- Retries never double-credit. Partial/extra money, changed quotes and unavailable orders require review. No automatic second collection or installment summation.
- Status polling rechecks the current quote, shipment eligibility and receiving configuration; obsolete transfer instructions are hidden before any transfer. Once review is required, later transfers remain auditable and cannot automatically confirm payment.
- MySQL stores receipt audit, payment state and notification atomically. Payment does not change transport state or introduce new gates in Flows 1-4. Historical sandbox data is retained but never counts as real money.
- Order detail links to `/customer/requests/:id/payment` for QR checkout. Verified success is displayed there with links back to order detail and the order list. Closing checkout returns to `/customer/requests/:id#sepay-payment`; it does not cancel the order, invalidate an issued transfer code, refund money or stop later bank confirmation. The order remains pending until the webhook confirms receipt, and reopening reuses the same instructions.

## Outputs

Approved order, assigned work items, order status history, and customer notification.

**Owner:** `backend/src/modules/orders`  
**Primary UI:** `frontend/src/app/customer`, `frontend/src/app/manager`

- The manager approval form converts USD input to whole VND at its displayed application rate (25,400 VND per USD) before sending totalCost; VND input is rounded to whole VND. Previously stored quotes are not changed automatically.
- The customer request list links to the payment section of approved orders. Order details explain approval/quote prerequisites and report when SePay configuration is disabled.
- Customer and manager lists display payment status separately from transport status and refresh every 15 seconds. Order details/checkout refresh order eligibility every 10 seconds; pending payments refresh every 3 seconds. Cached QR instructions are hidden when order eligibility is lost or payment refresh fails.
- The approval API accepts only whole VND from 0 through 9,999,999,999,999; a zero quote can be approved but cannot create payment instructions.
