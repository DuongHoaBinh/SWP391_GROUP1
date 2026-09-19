# Actors and Roles

| Actor | Main responsibilities | Allowed actions |
|---|---|---|
| **Logistics Manager** | Owns operational approval and performance oversight | Review/approve/reject orders; create overall plans; assign staff; approve emergency route and extra-cost changes; view revenue, cost, and on-time reports |
| **Transport Specialist** | Owns legal, medical, quarantine, and customs readiness | Manage country/gate rules; create horse document sets; review completeness; track authority approvals; request missing documents from customers |
| **Fleet & Route Coordinator** | Owns capacity, route, schedule, and trip coordination | Manage vehicles, aircraft capacity, stalls, stops, routes, trip legs, assignments, schedule changes, and operational alerts |
| **Vehicle Driver / Escort** | Executes the assigned trip and observes horse welfare | View assigned trips/horses/stops; update milestones; add text/photo health logs; report incidents |
| **Customer** | Requests service and supplies horse information | Create own requests; upload own horse documents; view own order/document/tracking status; receive notifications |

## Permission boundaries

- Only the Logistics Manager can approve/reject a transport request and approve emergency cost changes.
- Only the Transport Specialist can mark legal/document requirements as reviewed or incomplete.
- Only the Fleet & Route Coordinator can publish route legs, capacity assignments, and planned schedules.
- Drivers/escorts can update execution events and health logs only for assigned trips.
- Customers cannot edit an approved request or operational status; they can submit requested corrections/documents.

All authorization checks belong to `backend/src/modules/auth` and must be enforced server-side. The frontend route grouping is a usability boundary, not a security boundary.
