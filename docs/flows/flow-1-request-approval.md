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
- Customers may try MoMo sandbox payment from their approved/operational order detail using its persisted VND quote. Amount and ownership are checked by the orders backend. ATM card session creation (`payWithATM`) is pending until a verified IPN or backend query confirms the sandbox result; browser redirects cannot mark payment success.
- Sandbox payment records and append-only payment events are separate from shipment status and real settlement. This optional demo does not block approval, compliance, departure or tracking. Pending/uncertain transactions are reused to avoid duplicate creation.
- A query reporting a terminal failure (including expired session code `1005`) may omit the amount. Partner, order and query request IDs must still match; a supplied amount must match the stored quote. Pending/success responses require the matching amount. An expired session is recorded as failed with its history retained, allowing a new card session.

## Outputs

Approved order, assigned work items, order status history, and customer notification.

**Owner:** `backend/src/modules/orders`  
**Primary UI:** `frontend/src/app/customer`, `frontend/src/app/manager`

- ATM sandbox accepts integer quotes from 10,000 to 50,000,000 VND (verified against the test gateway). Payment card data stays on the hosted MoMo page. Migration 014 preserves legacy wallet attempts and their events; the UI offers card checkout only.
