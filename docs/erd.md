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

## SePay settlement (migration 015)

- shipment_sepay_payment belongs to a shipment and customer. Unique shipment_id, payment_code and settled transaction_id prevent duplicate collection. Stores immutable VND amount, bank/account snapshot, pending/review/succeeded state and settlement timestamps.
- sepay_webhook_receipt is the append-only authenticated receipt ledger, keyed by transaction ID. Nullable payment_id links matched receipts; identity_hash identifies equivalent retries and outcome records paid/ignored/unmatched/review results.
- Receipt, payment projection and customer notification commit together. Neither table stores webhook secrets or changes trip execution state.
- Tables from migrations 013-014 remain historical only. Sandbox successes are never migrated to real settlement.

## Flow 4 persistence (migration 012)

- `route_stop_update` is the append-only check-in history. It references `route_stop` and the author in `user`. Optional `vehicle_temperature_c` records the observed cabin temperature. `event_time` preserves the actual event time, including clearance; `actual_arrival` and `actual_departure` retain their specific meanings. `created_at` records insertion time with millisecond precision. `route_stop` keeps the current status/timestamps as a projection.
- `horse_condition_log` references a specific `shipment_horse` and author. It stores `condition_status`, optional `temperature_c`, `heart_rate_bpm`, `vehicle_temperature_c`, internal notes, JSON attachment URLs and `recorded_at` with millisecond precision. Horse and shipment identity are derived from `shipment_horse`; client-provided names are not trusted.
- `trip_status_log` stores append-only leg departure/arrival and trip completion audit events, including actor, previous/new state, `occurred_at` and optional stop/leg identifiers. Insertion time and actual event time remain separate.
- `route_leg.actual_departure` / `actual_arrival` and `route_stop.actual_arrival` / `actual_departure` / `updated_by` / `notes` are projections for the milestone timeline.
- Nullable unique `legacy_health_log_id` and `legacy_status_log_id` preserve migration provenance and make history imports repeatable. Legacy tables remain intact. No startup seed is run by `TrackingStore`.
- New check-ins/health logs never overwrite existing history. Shipment-level transactions serialize execution updates and commit projections and audit records together.
