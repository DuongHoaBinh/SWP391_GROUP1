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
- A coordinator override must use an action matching its milestone: departure for a leg start, arrival/completion for a leg end, or a stop action for a stop. Mismatched requests are rejected without changing state or appending events.
- Coordinators/managers/admins must use the override endpoint with a nonblank reason. Ordinary departure, arrival and stop endpoints cannot bypass this requirement.
- Health logs are associated with an individual horse, trip, author, time, and optional attachment.
- Customer tracking exposes operational status and approved location information, not private staff notes.

## Outputs

Current trip status, chronological route log, horse health log, delay alerts, and customer notifications.

**Owner:** `backend/src/modules/tracking`  
**Primary UI:** `frontend/src/app/driver`, `frontend/src/app/coordinator`, `frontend/src/app/customer`, `frontend/src/app/manager`

## Implementation and persistence

- Run migrations 006–012 after the baseline schema as appropriate for the existing database. Apply migration 012 with `node database/apply-tracking-migration.cjs` from the repository root; it uses `backend/.env`. Backend startup does not create sample trips or change the schema.
- `POST /tracking/shipments/:id/start` starts the next eligible leg. The shipment and route must be `ready_to_depart` for first departure. The assigned staff member must have confirmed their assignment. Road milestones belong to the assigned driver; flight milestones belong to the assigned escort.
- `POST /tracking/shipments/:id/checkin` appends to `route_stop_update` and updates the current stop projection in the same transaction. Each shipment is locked during mutations, preventing duplicate starts/check-ins and partially written audit history.
- A rest/refuel stop follows `pending → arrived → departed`. Customs/quarantine stops follow `pending → arrived → customs_cleared → departed`. A later stop/leg cannot be processed before earlier required milestones. Legacy `cleared` means clearance granted; departure still needs recording.
- `POST /tracking/shipments/:id/health-logs` requires a horse assigned to that shipment; it appends to `horse_condition_log` via `shipment_horse_id`. The horse name comes from MySQL. No sample vital signs are inserted when a measurement is missing.
- Health history supports `page`, `pageSize` (1–100), and `horseId`. Ordering is `recorded_at DESC, log_id DESC`. The UI uses ten records per page and resets the page when the horse filter changes.
- Temperature inputs accept at most one decimal place, matching MySQL storage and avoiding rounding across alert thresholds. History pages must be integers from 1 through 2,147,483,647; oversized values are rejected before querying MySQL.
- Shipment start/arrival events are kept in `trip_status_log`; stop check-ins are also exposed as `checkIns` by the detail API. Legacy status and health history is migrated without deleting the old tables. Health records without a matching shipment horse remain in the legacy table for manual reconciliation.
- Customer and coordinator screens poll every five seconds. They show the most recent recorded milestone, measurement timestamps and explicit missing-data states. The UI does not claim to provide GPS or connected IoT measurements.
- Vehicle temperature can be entered during check-in or a horse health observation. Red alerts are raised strictly below **16°C**, above **22°C**, or when an individual horse's latest body temperature is above **38.5°C**. Boundary values do not trigger alerts. Current alerts use the latest observation per horse and latest non-null vehicle measurement, independently of history pagination. Historical abnormal readings remain visibly marked in the log.
- Customers can read their own shipments only; operational notes are omitted. Assigned drivers/escorts may read/write only their assigned shipments. Coordinators can monitor operational trips; mutations require the `fleet_coordinator` assignment. Managers/admins can intervene with an audited reason. Health recording is reserved to assigned driver/escort accounts.
- Health alerts notify the customer, fleet coordinators and managers. Milestones notify the customer. Notification failures are logged after the tracking transaction commits; they do not erase recorded events.
- Finishing the last leg completes the shipment. The explicit completion endpoint cannot bypass unfinished legs; optional incident/handover modules do not block Flow 4.

## Verification

With the backend running against a development database, run `npm run test:tracking` in `backend/`. The integration suite creates isolated temporary fixtures and removes only those fixtures afterward. It covers ownership/assignment, invalid inputs, concurrency, stop/customs ordering, flight permissions, MySQL persistence, pagination/filtering, privacy and alert thresholds.

## UI synchronization and review

- List/detail caches are scoped to account, role and shipment. Polling is deduplicated; initial loading, empty data and network failure have distinct states. Refresh failures preserve previously loaded observations and show a retry action.
- An explicit unavailable or malformed `shipmentId` shows an error and no other shipment's details. The user can recover by choosing an accessible trip. Automatic selection applies only when the URL has no shipment selection.
- The legacy tracking arrays, localStorage observations and simulated telemetry actions have been removed from the shared fleet store. Flow 4 reads and writes the tracking API; unrelated Flow 3 fleet planning state remains in its existing store.
- Changing shipment closes milestone, override and health forms. Submitting a milestone rechecks its current allowed action; the driver starts the explicit leg selected in the form. Unconfirmed staff receive no milestone actions. Coordinator intervention starts with no assumed reason and requires an explicit selection.
- The timeline includes an append-only journey history with actual event time and author. The current milestone means next required confirmation when no actual time exists.
- Each horse has its own latest observation card, independent of history pagination. Missing readings remain unmeasured. Shared dialogs support keyboard focus containment, Escape and focus restoration; responsive controls wrap on narrow screens.

- The customer order detail route summary now reads persisted tracking distance, ETA and actual stops. It shares the same API as the tracking modal; corridor estimates and invented checkpoints are not displayed as a planned itinerary. Shared actor layouts, Header, Modal, Button and status translations were adjusted only to support these screens (responsive layout, real account identity, keyboard focus and readable status labels).
