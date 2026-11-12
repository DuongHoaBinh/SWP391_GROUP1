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

## Booking type (migration 018)

- `shipment.booking_type ENUM('shared_stall','dedicated_charter') NOT NULL DEFAULT 'shared_stall'` records the service Customer selected. Existing totals are preserved when adding this default to historical orders.
- `shipment.stall_unit_price DECIMAL(15,2) NULL` stores whole-VND unit freight for new shared quotes. Dedicated and legacy total-only quotes keep it null. `transport_cost` remains the total freight; `total_cost = transport_cost + insurance_fee` after approval.
- `shipment_booking_revision`: shipment/user foreign keys, previous/new booking enums, server timestamp and index by shipment/time. Revisions append on changes requested by Manager. They do not modify prior invoice snapshots.
- `shipment_invoice.snapshot` additionally retains booking type/unit price/horse count for the issued quote. Migration 018 is rerunnable and never recalculates historical prices.

## Road-trip capacity (migration 019)

- `road_trip`: vehicle FK, booking enum, origin/destination, booked start/end, creating staff FK and creation time. Trip coordinates/time are immutable through the API. A CHECK enforces arrival after departure.
- `route_leg.road_trip_id`: nullable FK to the road trip. Existing legs are unchanged. Road `stalls_booked` is set from the locked shipment's horse quantity, never the Customer/Coordinator payload.
- Shared membership is the set of road legs linked to a trip through their own routes/shipments. Vehicle row locks serialize all reservation decisions; overlapping different trips or Dedicated occupants are rejected. Completed booking intervals remain recorded; cancelled/rejected orders do not consume slots. No cross-customer membership details are exposed publicly.
- Applying 019 requires the existing Flow 3 schema (migration 010). The base schema declares road_trip; 019 supplies the leg FK after route_leg exists. This follows the project's base-schema-plus-migrations setup.

## Independent transport mode (migration 020)

- `shipment.transport_mode ENUM('road','air') NULL`: the Manager's selected mode. This is independent of `transportation_type` (Domestic/International) and `booking_type` (Shared/Dedicated).
- New approval writes the mode without overwriting geographic scope. Responses and invoice snapshots include the mode. Old rows remain null; older UI note-based inference remains a fallback, with no automatic historical rewrite.
