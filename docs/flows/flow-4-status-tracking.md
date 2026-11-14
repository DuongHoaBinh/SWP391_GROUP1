# Flow 4: Status Updates and Route Log (Required)

## Actors

Vehicle Driver / Escort, Fleet & Route Coordinator, Logistics Manager, Customer

## Main path

1. Driver/escort or coordinator records a route milestone: departed, arrived at stop, customs cleared, or delivered.
2. The system records the trip, leg/stop, author, timestamp, location, and optional note/photo.
3. The current trip status is derived from the latest valid event and remains visible to authorized users.
4. Driver/escort records horse health observations, including stable, not eating, stressed, or climate change, with text and images when needed.
5. The system notifies customers and internal staff when important milestones or delays are recorded.

## Key rules

- Tracking events are append-only; a correction creates a new event with a reason.
- Drivers/escorts can update only assigned trips; coordinators can update trips they coordinate.
- A milestone cannot move backward without an explicitly recorded correction or incident.
- Health logs are associated with an individual horse, trip, author, time, and optional attachment.
- Customer tracking exposes operational status and approved location information, not private staff notes.
- For consolidated shared road trips (`shared_stall` with multiple origins/destinations), staff tracking timelines (`DRIVER_ESCORT`, `FLEET_ROUTE_COORDINATOR`, `LOGISTICS_MANAGER`, `ADMIN`) display the ordered physical corridor (`farther origin -> closer pickup transfer_hub -> shared corridor transit stops -> closer dropoff transfer_hub -> farther destination`) and `consolidatedRouteSummary`, keeping sibling stops synchronized on the same `road_trip`.
- When departing a dropoff `transfer_hub` milestone on a consolidated shared trip, only the sibling shipment(s) whose destination matches that hub are transitioned to completed (`completed`), while remaining shipments continue `in_transit` and the assigned vehicle stays `in_use` until the final destination completes.
- Customer tracking responses redact `transfer_hub` milestones, sibling pickup/dropoff locations, `roadTripId`, and shared-trip terminology (`chuyến ghép`) server-side so each customer sees only their own origin, corridor transit stops, and destination.
- The order completion endpoint permits only Manager/Admin or an assigned Driver/Escort. It accepts only an in-transit order (retries on completed orders are idempotent), locks the shipment and updates shipment/horse/route together. Optional Flow 6 evidence is not a mandatory prerequisite for Flow 4 completion.

## Outputs

Current trip status, chronological route log, horse health log, delay alerts, and customer notifications.

**Owner:** `backend/src/modules/tracking`  
**Primary UI:** `frontend/src/app/driver`, `frontend/src/app/coordinator`, `frontend/src/app/customer`, `frontend/src/app/manager`
