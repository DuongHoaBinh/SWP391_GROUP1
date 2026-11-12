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

## Outputs

Approved order, assigned work items, order status history, and customer notification.

**Owner:** `backend/src/modules/orders`  
**Primary UI:** `frontend/src/app/customer`, `frontend/src/app/manager`
