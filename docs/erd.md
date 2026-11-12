# Entity Relationship Design

The executable schema is `database/schema.mysql.sql` and targets MySQL 8.0+ with InnoDB and utf8mb4.

## Core entities

- `role`, `user`, `otp_verification`
- `horse`
- `regulation`, `transport_document`, `document_approval`
- `shipment`, `shipment_horse`
- `vehicle`, `shipment_vehicle`, `route`, `route_stop`, `shipment_assignment`
- `route_stop_update`, `horse_condition_log`, `attachment`
- `incident_report`, `shipment_change_request`, `delivery_handover`
- `notification`

## Important relationships

- A customer owns one or more horses and creates transport orders.
- An order contains one or more horses and can become one transport plan/trip.
- A horse has a document set whose required documents depend on destination country and border gate.
- A trip uses a route made of ordered legs and stops, and has assigned vehicle/capacity and staff.
- Tracking events and horse health logs belong to a trip and record their author and timestamp.
- Incidents can create route-change and additional-cost approval records linked to the trip.
- Handover records close a trip only after the required horse/document checklist is confirmed.

The database schema is the executable source of truth; this document explains ownership and relationships at a business level.


## Official transport invoice

`shipment_invoice` (migration `016_route_payment_gate.sql`) belongs to `orders` billing. It references `shipment`, the confirmed `route`, and the paying customer (`user`). `route_id` is unique: repeated confirmations reuse the issued invoice. `amount` is a positive integer VND value; `snapshot` retains the customer, route and scheduled legs at issue time. `issued_at` is the server timestamp. Existing SePay receipts and sandbox history remain separate and unchanged.


## Equine insurance (migration 017)

- `shipment_horse`: `declared_value DECIMAL(15,2)`, `declared_currency`, `exchange_rate DECIMAL(18,6)`, `declared_value_vnd DECIMAL(15,2)`, `insurance_package`, per-horse `insurance_fee DECIMAL(15,2)`, `max_compensation DECIMAL(15,2)`, `emergency_vet_covered`, `insurance_policy_version`. The existing quantity multiplies premiums, not the declared unit value or unit compensation cap.
- `shipment`: `transport_cost DECIMAL(15,2) NULL` distinguishes pending freight from zero freight; `insurance_fee DECIMAL(15,2)` stores the sum of unit premiums multiplied by quantities. Existing `total_cost` becomes the combined quoted total after approval.
- `shipment_insurance_revision`: append-only `previous_snapshot` (JSON), shipment, changing customer, reason and server timestamp. It preserves policy data across pre-approval resubmissions without creating new horse identities.
- Migration 017 is rerunnable. Existing horses default to Basic with no added fee, historical totals remain unchanged, and existing quoted totals are copied to base freight. No prior trip is retrospectively charged insurance. The insurance record remains attached to its original shipment/horse relationship.
- Schema/migration 017 also supply missing nullable horse-profile columns (`color`, `weight`, `medical_status`, `special_requirements`) required by the existing horse selection and order detail API. Existing columns and profile values are preserved.
