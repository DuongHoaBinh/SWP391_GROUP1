# Flow 3: Route Planning and Fleet Coordination (Required)

## Actors

Logistics Manager, Fleet & Route Coordinator, Vehicle Driver / Escort

## Main path

1. Coordinator receives an approved order and checks horse count, size, special care, transport mode, and document readiness.
2. Coordinator selects compatible vehicle, airline cargo capacity, and stalls based on availability and capacity.
3. Coordinator creates an ordered route with origin, destination, border gates, rest stops, quarantine stations, fuel stations, and transfer points.
4. Coordinator assigns a driver/escort and records planned departure, arrival, and leg schedules.
5. Logistics Manager reviews the overall plan where required and publishes the trip schedule.
6. Coordinator and assigned driver/escort can view the published plan and operational instructions.

## Key rules

- A vehicle/capacity assignment cannot exceed availability or horse capacity.
- Every trip leg has an order, planned times, location, and responsible status.
- A route must identify required border, quarantine, and handover stops for international orders.
- Schedule changes after publication must preserve the old schedule and record a reason.
- A trip cannot be published without an approved order, assigned capacity, route, and responsible staff.

## Outputs

Published trip plan, route legs/stops, vehicle or airline assignment, staff assignments, and schedule notifications.

**Owner:** `backend/src/modules/fleet` and route services  
**Primary UI:** `frontend/src/app/coordinator`, `frontend/src/app/manager`, `frontend/src/app/driver`
