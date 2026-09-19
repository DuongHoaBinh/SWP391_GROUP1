# Entity Relationship Design

## Core entities

- `users`, `roles`, `user_roles`
- `customers`, `horses`
- `transport_orders`, `transport_order_horses`
- `transport_plans`, `assignments`
- `documents`, `document_requirements`, `document_reviews`
- `countries`, `border_gates`, `compliance_rules`, `authority_approvals`
- `vehicles`, `air_transport_capacity`, `stalls`
- `routes`, `route_legs`, `trip_stops`, `trips`
- `tracking_events`, `horse_health_logs`, `attachments`
- `incidents`, `route_change_requests`, `additional_cost_approvals`
- `handover_records`, `handover_items`
- `notifications`, `audit_logs`

## Important relationships

- A customer owns one or more horses and creates transport orders.
- An order contains one or more horses and can become one transport plan/trip.
- A horse has a document set whose required documents depend on destination country and border gate.
- A trip uses a route made of ordered legs and stops, and has assigned vehicle/capacity and staff.
- Tracking events and horse health logs belong to a trip and record their author and timestamp.
- Incidents can create route-change and additional-cost approval records linked to the trip.
- Handover records close a trip only after the required horse/document checklist is confirmed.

The database schema is the executable source of truth; this document explains ownership and relationships at a business level.
