# Flow 2: Legal, Quarantine, and Customs Documents (Required)

## Actors

Transport Specialist, Customer, Logistics Manager, external authorities

## Main path

1. The system identifies required documents from origin, destination country, border gate, transport mode, and horse profile.
2. Transport Specialist maintains the applicable medical, quarantine, customs, and permit requirements.
3. Customer uploads a digital file for each horse, such as vaccination certificate, horse passport, and import/export permit.
4. Specialist reviews each document as `PENDING`, `ACCEPTED`, `REJECTED`, or `EXPIRED`, with reason and expiry date.
5. Specialist records authority submission and approval progress for agriculture, customs, and quarantine agencies.
6. The system notifies the customer about missing, rejected, or soon-to-expire documents before departure.

## Key rules

- Requirements are evaluated per horse and per transport order.
- A document cannot be marked accepted without type, owner horse, issue/expiry information where applicable, and review history.
- The trip cannot reach `READY_TO_DEPART` while mandatory documents are missing, rejected, or expired.
- Customers can upload and replace their own documents; only the Transport Specialist can accept them.

## Outputs

Document checklist, authority approval status, missing-document notifications, and a compliance readiness result.

**Owner:** `backend/src/modules/documents`  
**Supporting module:** `backend/src/modules/auth`  
**Primary UI:** `frontend/src/app/specialist`, `frontend/src/app/customer`, `frontend/src/app/manager`

## Payment and departure

Document completion is a departure requirement, not the payment trigger. A confirmed Flow 3 plan opens payment independently of Flow 2 completion. Reviewing or replacing documents refreshes departure readiness; approved documents must remain valid. Missing/invalid compliance prevents departure even after payment.
