# Flow 1: Create and Approve Transport Request (Required)

## Actors

Customer, Logistics Manager

## Main path

1. Customer enters origin, destination, domestic/international scope, requested dates, horse count, horse details, and special requirements.
2. Customer submits the request and uploads available identity/medical documents.
3. The system creates the request as `DRAFT` or `SUBMITTED` and records the customer and timestamp.
4. Logistics Manager reviews feasibility, service scope, dates, and requested requirements.
5. Manager either requests changes, rejects the request with a reason, or approves it for planning. Approval produces an estimated VND quotation (printable PDF), not an invoice or payment request.
6. For an approved request, the manager assigns work to the Transport Specialist, Fleet & Route Coordinator, and Driver / Escort as planning becomes available.

## Key rules

- An order must contain at least one horse, origin, destination, and requested transport date before submission.
- Rejection and change requests require a reason.
- Only the Logistics Manager can approve or reject a submitted order.
- Customer edits after a change request create a new revision and preserve the previous version.
- Payment instructions remain locked until the Flow 3 route is confirmed and its invoice is issued, even when Flow 2 is already complete.
- Approval does not mean the trip can depart; document readiness and operational planning are separate gates.

## Outputs

Approved order, assigned work items, order status history, and customer notification.

**Owner:** `backend/src/modules/orders`  
**Primary UI:** `frontend/src/app/customer`, `frontend/src/app/manager`

- Self-service cancellation is allowed only before approval (`requested` / `change_requested`); retries are idempotent. Approval and cancellation cannot both win concurrently. Approved or invoiced trips require operational handling.


## Equine value and insurance

1. In the horse-selection step, the customer enters a value per horse and chooses Basic, Standard or Premium. Standard/Premium require a positive declared value; Basic defaults to zero premium and permits an undeclared value for backward compatibility.
2. The backend validates owned, available horses, quantities, currency and package. A create transaction either reserves every selected horse and stores all policies or rolls back entirely. No orphan order is left on an invalid policy/horse.
3. Declared values have at most two decimal places. USD uses the configured server rate (up to six decimal places); converted VND value is rounded to two decimal places. The per-horse premium is rounded half up to one whole VND, then multiplied by quantity. Maximum stored values follow `DECIMAL(15,2)`.
4. Before approval, the UI shows insurance fees and pending freight. Manager approval takes base freight in VND; the server adds the aggregate premium once. Both Manager approval surfaces show the breakdown. Legacy `totalCost` approval input is treated as base freight; new clients use `transportCost`.
5. A change-request resubmission can update a policy only while the order is `change_requested`. The customer detail modal allows editing values/packages and adding notes without replacing the original route requirements. The existing horse identity is preserved; removed horses are released. The former policy rows are appended to `shipment_insurance_revision` before replacement. Unchanged declarations keep their stored exchange rate and premium, even when the configured rate changes or USD is no longer enabled. A substantive value/currency/package change uses the current server rate. The old quote is cleared until the Manager approves again. Concurrent approval, cancellation and change requests cannot reopen a finalized decision.
6. Approval locks the customer's policy. The quotation, confirmed-route invoice and bank QR use the same combined total. Invoice snapshots include the saved per-horse policies and separate freight/insurance amounts. The Flow 3 payment gate remains in force.

This implements policy selection, premium and coverage recording; it does not add an insurance-claim adjudication or external insurer settlement system.

Role notifications use existing active accounts with the requested role. If no account matches, no recipient is invented; approval still succeeds. This prevents false approval errors and notifications sent to unrelated users on databases without all staff accounts.
