# Requirements

## System

**Cross-Border Racehorse Transport System** manages domestic and international racehorse transportation from the initial service request through route execution, customs/quarantine milestones, and safe handover.

The system must preserve an auditable history of approvals, documents, route changes, costs, trip events, horse health observations, and notifications.

## Actors and scope

### Logistics Manager

- Receive and approve domestic and international transport orders.
- Create the overall transport plan, including vehicle, airline, route, and transfer points.
- Assign work to the Transport Specialist, Fleet & Route Coordinator, and Driver / Escort.
- Approve route changes and additional costs during emergencies.
- View revenue, operating cost, and on-time delivery performance reports.

### Transport Specialist

- Maintain medical, quarantine, and customs rules by country and border gate.
- Create and store a digital transport file for each horse, including vaccination certificates, horse passports, and import/export permits.
- Track approval progress with agricultural authorities, customs, and quarantine agencies.
- Notify customers about missing documents and submission deadlines.

### Fleet & Route Coordinator

- Manage specialized vehicles, aircraft cargo capacity, and horse stalls.
- Build routes with rest stops, quarantine stations, fuel stations, transfer points, and border gates.
- Update trip progress by leg: departed, arrived at stop, customs cleared, and delivered.
- Adjust schedules and issue alerts for traffic, weather, or border congestion.

### Vehicle Driver / Escort

- View assigned schedules, horses, and rest stops.
- Submit milestone updates during the trip.
- Record horse health observations in text and images.
- Report vehicle, traffic, and horse medical emergencies to the operations center.

### Customer (club / horse owner)

- Create a transport request with origin, destination, dates, number of horses, and special requirements.
- Upload horse identity and medical documents.
- Track trip location and leg status.
- Receive notifications when customs is completed or the horse reaches the safe handover location.

## Mandatory flows

1. **Flow 1 - Create and approve transport request:** customer submission, manager review, approval/rejection, and assignment preparation.
2. **Flow 2 - Legal, quarantine, and customs documents:** rules by country/gate, horse document sets, review status, missing-document notifications, and authority approval tracking.
3. **Flow 3 - Route planning and fleet coordination:** vehicle/airline/stall selection, route legs and stops, staff assignment, schedule, and operational readiness.
4. **Flow 4 - Status updates and route log:** driver/coordinator milestone updates, live/current status, route event history, and customer notifications.

## Optional flows

5. **Flow 5 - Incident handling and emergency route changes:** incident reporting, escalation, revised route/cost approval, and resolution history.
6. **Flow 6 - Handover and trip acceptance:** receiving confirmation, horse/document checklist, evidence, and trip closure.

## Core business rules

- A transport order cannot be scheduled until it is approved and has passed the required document checks.
- A trip must have an assigned route, transport capacity, and responsible staff before departure.
- Every status, document review, route change, cost approval, and incident update must record actor, timestamp, and reason where applicable.
- Customers can access only their own horses, orders, documents, notifications, and tracking information.
- Operational staff permissions are separated by responsibility; server-side authorization is mandatory.
- Flow 5 and Flow 6 are optional features and must not block the four mandatory flows.

## Working rule

Each flow owns its business rules and API contract. Cross-flow changes must be recorded in the relevant flow document and database design before implementation.
