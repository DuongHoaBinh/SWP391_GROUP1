# API Documentation

## API technology

The backend is implemented with **NestJS and TypeScript**. It exposes a **REST API** consumed by the **React/Next.js frontend**. The target database is **MySQL 8.0+**; authentication stores users and registration OTP records in MySQL. OpenAPI/Swagger UI is available at `http://localhost:5000/api/docs` while the backend is running.

## Authentication endpoints

Base URL: `http://localhost:5000/api`

### `POST /auth/register`

Creates a pending **customer** registration and sends a six-digit OTP. Required body:

```json
{
	"email": "owner@example.com",
	"password": "Password123",
	"confirmPassword": "Password123"
}
```

The password must contain at least eight characters, one letter, and one number. The OTP is sent through the configured SMTP provider. It must not be exposed in production; `AUTH_EXPOSE_DEV_OTP=true` may be used only for local development.

### `POST /auth/verify-otp`

Completes the customer registration after a valid OTP. OTPs expire after ten minutes.

```json
{
	"email": "owner@example.com",
	"otp": "123456"
}
```

### `POST /auth/login`

Authenticates verified customers and pre-provisioned internal accounts. Returns a JWT access token and the user's role.

```json
{
	"email": "owner@example.com",
	"password": "Password123"
}
```

### `GET /auth/profile`

Retrieves the authenticated user's profile details. Requires Bearer JWT token.

Response:
```json
{
	"id": "7",
	"email": "tamngoi192@gmail.com",
	"role": "CUSTOMER",
	"fullName": "Nguyễn Văn Tâm",
	"name": "Nguyễn Văn Tâm",
	"phone": "0912345678",
	"address": "123 Nguyễn Huệ, TP.HCM",
	"avatarUrl": "",
	"createdAt": "2026-09-30T10:00:00.000Z"
}
```

### `PATCH /auth/profile`

Updates the authenticated user's profile information. Requires Bearer JWT token.

Request body:
```json
{
	"fullName": "Nguyễn Văn Tâm",
	"phone": "0912345678",
	"address": "123 Nguyễn Huệ, Quận 1, TP.HCM",
	"avatarUrl": ""
}
```

Response:
```json
{
	"message": "Profile updated successfully",
	"user": {
		"id": "7",
		"email": "tamngoi192@gmail.com",
		"role": "CUSTOMER",
		"fullName": "Nguyễn Văn Tâm",
		"name": "Nguyễn Văn Tâm",
		"phone": "0912345678",
		"address": "123 Nguyễn Huệ, Quận 1, TP.HCM",
		"avatarUrl": "",
		"createdAt": "2026-09-30T10:00:00.000Z"
	}
}
```

### `POST /auth/change-password`

Changes the password for the currently authenticated user. Requires Bearer JWT token.

Request body:
```json
{
	"currentPassword": "OldPassword123",
	"newPassword": "NewPassword123",
	"confirmPassword": "NewPassword123"
}
```

Response:
```json
{
	"message": "Mật khẩu đã được thay đổi thành công"
}
```

## Local MySQL and SMTP configuration

The backend reads database and SMTP settings from `backend/.env`. `SMTP_USER` and `SMTP_PASSWORD` belong to a dedicated system sender account, not to the customer. The customer email from `POST /auth/register` is passed as the recipient of the OTP email. Required values for the real registration flow are `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASSWORD`. For Gmail, use an App Password with two-step verification enabled. Never commit `backend/.env` or expose `SMTP_PASSWORD`.

API contracts are organized by backend module:

- `/api/auth`
- `/api/orders` - requests, manager approval, assignments
- `/api/documents` - horse document sets, requirements, reviews, authority approvals
- `/api/compliance` - country, border-gate, quarantine, and customs rules
- `/api/fleet` - vehicles, aircraft capacity, stalls, availability
- `/api/routes` - route plans, legs, stops, schedule changes
- `/api/tracking` - trip status, route events, horse health logs, attachments
- `/api/incidents` - emergency reports, escalation, route/cost changes (optional)
- `/api/handover` - delivery checklist and acceptance (optional)
- `/api/notifications` - customer and internal alerts
- `/api/reports` - revenue, operating cost, and on-time delivery

## Orders endpoints (Flow 1: Transport Request & Approval)

Base URL: `http://localhost:5000/api` (All endpoints require `Authorization: Bearer <token>`)

### `POST /orders` (Customer)
Creates and submits a new transport request.
- **Role:** `CUSTOMER`
- **Body:**
```json
{
  "contactName": "Nguyễn Văn A",
  "contactAddress": "123 Trần Phú, Q.5, TP.HCM",
  "contactPhone": "0901234567",
  "contactEmail": "owner@example.com",
  "requestedHorseCount": 1,
  "originLocation": "Trang trại Củ Chi, TP.HCM",
  "destinationLocation": "Singapore Turf Club, Singapore",
  "requestedDate": "2026-10-15T08:00:00.000Z",
  "specialRequirements": "Cần xe điều hòa đặc biệt",
  "medicalDocumentUrl": "https://example.com/docs/medical-rules.pdf",
  "horseName": "Xích Thố",
  "horseBreed": "Thoroughbred",
  "horseGender": "male",
  "horseAge": 4,
  "horses": [
    {
      "name": "Xích Thố",
      "breed": "Thoroughbred",
      "gender": "male",
      "age": 4
    }
  ]
}
```

### `GET /orders/my-orders` (Customer)
Lists all transport requests submitted by the authenticated customer.

### `GET /orders` (Logistics Manager / Admin)
Lists all transport requests across the system. Supports optional query parameter `?status=requested`.

### `GET /orders/:id`
Retrieves detailed information for a specific order. Customers can only view their own orders.

### `PATCH /orders/:id/approve` (Logistics Manager / Admin)
Approves a pending `requested` order and notifies the customer.
- **Body:** `{ "totalCost": 15000000, "note": "Phê duyệt kế hoạch" }`

### `PATCH /orders/:id/reject` (Logistics Manager / Admin)
Rejects a pending `requested` order with a mandatory reason and notifies the customer.
- **Body:** `{ "reason": "Lý do từ chối đơn hàng" }`

### `PATCH /orders/:id/request-changes` (Logistics Manager / Admin)
Requests modifications on a pending `requested` order with a mandatory explanation note. Updates status to `change_requested` and sends a notification to the customer.
- **Body:** `{ "reason": "Vui lòng dời ngày xuất phát sang 16/10 và cập nhật địa chỉ đón chi tiết" }`

### `PUT /orders/:id` (Customer)
Customer updates editable order details (dates, route locations, horse info, special requirements) and resubmits the request. Resets status back to `requested` for manager review.
- **Body:** Partial or full fields from `CreateOrderDto`.

## Documents endpoints (Flow 2: Legal, Quarantine, and Customs Documents)

Base URL: `http://localhost:5000/api` (All endpoints require `Authorization: Bearer <token>`)

### `GET /documents/regulations`
Lists active quarantine and legal regulations by destination country. Supports optional query `?country=Singapore`.

### `POST /documents/regulations` (Transport Specialist / Admin)
Creates a new document requirement for a destination country.
- **Role:** `TRANSPORT_SPECIALIST`, `ADMIN`
- **Body:**
```json
{
  "country": "Singapore",
  "documentType": "horse_passport",
  "description": "Hộ chiếu FEI hoặc liên đoàn quốc gia cấp có gắn mã microchip",
  "effectiveDate": "2026-01-01"
}
```

### `POST /documents/upload` (Customer / Transport Specialist / Admin)
Uploads an official scan/PDF document for a specific horse.
- **Body:**
```json
{
  "horseId": 1,
  "regulationId": 1,
  "docType": "horse_passport",
  "docNumber": "FEI-VN-2026-12",
  "fileUrl": "https://storage.example.com/docs/passport.pdf",
  "issueDate": "2026-01-10",
  "expiryDate": "2027-01-10"
}
```

### `GET /documents/:id`
Retrieves detailed information for a specific document, including reviewer notes and official authority approval history.

### `GET /documents/horse/:horseId`
Lists all uploaded documents for a specific horse.

### `GET /documents/order/:orderId/checklist`
Returns the complete legal and quarantine compliance checklist for all horses in a transport order. Evaluates missing regulations, accepted documents, and the overall `isFullyCompliant` status.

### `PATCH /documents/:id/review` (Transport Specialist / Admin)
Specialist reviews and approves (`approved`), rejects (`rejected` with required reason), or marks a document as expired (`expired`). Notifies the customer automatically.
- **Body:**
```json
{
  "status": "approved",
  "notes": "Hồ sơ hợp lệ và còn thời hạn",
  "expiryDate": "2027-01-10"
}
```

### `POST /documents/:id/authority-approval` (Transport Specialist / Admin)
Records official submission and approval progress with agricultural, veterinary, and customs agencies.
- **Body:**
```json
{
  "authorityName": "Cơ quan Thú y Singapore (AVS)",
  "status": "approved",
  "approvalDate": "2026-10-10T08:00:00.000Z",
  "notes": "Đã cấp giấy phép nhập khẩu số AVS-2026/099"
}
```

### `POST /documents/order/:orderId/notify-missing` (Transport Specialist / Admin)
Evaluates compliance for the order and automatically sends a high-priority notification to the customer listing all missing and rejected documents per horse.
- **Body:**
```json
{
  "customMessage": "Vui lòng hoàn tất nộp giấy tờ trước ngày 10/10 để kịp trình Cục Thú Y."
}
```

## Notifications endpoints

### `GET /notifications`
Retrieves all notifications for the authenticated user (sorted newest first).

### `PATCH /notifications/:id/read`
Marks a notification as read.

## Horses endpoints

### `GET /horses`
Retrieves all racehorses belonging to the authenticated customer.

### `GET /horses/:id`
Retrieves details of a specific racehorse. Customers can only view their own horses.

### `POST /horses`
Registers a new racehorse profile directly into the database.
- **Body:**
```json
{
  "name": "Pegasus Star",
  "breed": "Thoroughbred",
  "gender": "male",
  "age": 5,
  "dateOfBirth": "2021-04-15",
  "microchipNo": "985141001248999",
  "passportNo": "FEI-VN-2026-888",
  "status": "active"
}
```

### `PUT /horses/:id`
Updates details of a racehorse profile owned by the customer.

### `DELETE /horses/:id`
Deletes a horse profile. If the horse has been part of past shipments, it is soft-deleted to status `'retired'` to preserve transport audit history.

## Fleet endpoints (Flow 3: Fleet Management & Capacity Allocation)

Base URL: `http://localhost:5000/api` (All endpoints require `Authorization: Bearer <token>`)

### `GET /fleet/vehicles`
Lists transport vehicles. Supports optional query filters: `?status=available|in_use|maintenance` and `?type=truck|aircraft_stall|container`.

### `GET /fleet/vehicles/:id`
Retrieves details of a specific vehicle.

### `POST /fleet/vehicles` (Fleet Coordinator / Manager / Admin)
Registers a new transport vehicle with plate/code and horse capacity.
- **Body:**
```json
{
  "vehicleType": "truck",
  "plateOrCode": "51C-888.99",
  "capacity": 4,
  "status": "available"
}
```

### `GET /fleet/staff` (Fleet Coordinator / Manager / Admin)
Lists drivers, escorts, and coordinators available for trip assignment.

### `GET /fleet/shipments/:id/assignments`
Retrieves all vehicles and staff assigned to a specific shipment.

### `POST /fleet/shipments/:id/assign-vehicles` (Fleet Coordinator / Manager / Admin)
Assigns vehicles to an approved transport order. Enforces rule: total vehicle capacity must be >= `requestedHorseCount`. Sets vehicle status to `in_use` and order status to `planning`.
- **Body:** `{ "vehicleIds": [1, 2] }`

### `POST /fleet/shipments/:id/assign-staff` (Fleet Coordinator / Manager / Admin)
Assigns drivers and escorts to a transport trip and sends system notifications.
- **Body:**
```json
{
  "assignments": [
    { "userId": 5, "roleInShipment": "driver" },
    { "userId": 6, "roleInShipment": "escort" }
  ]
}
```

## Routes endpoints (Flow 3: Route Planning & Trip Publishing)

Base URL: `http://localhost:5000/api` (All endpoints require `Authorization: Bearer <token>`)

### `GET /routes/shipment/:shipmentId`
Retrieves the planned route and ordered stops for a shipment.

### `GET /routes/shipment/:shipmentId/plan`
Returns the full trip plan (route, assigned vehicles, staff) and readiness evaluation (`isReadyToPublish`, list of `missingRequirements`).

### `POST /routes/shipment/:shipmentId` (Fleet Coordinator / Manager / Admin)
Creates or updates an ordered route with stops (rest, border check, quarantine, refuel, other). International routes must include at least one `border_check` or `quarantine` stop.
- **Body:**
```json
{
  "routeName": "Tuyến TP.HCM - Mộc Bài - Phnom Penh - Singapore",
  "totalDistanceKm": 1250.5,
  "stops": [
    {
      "sequenceNo": 1,
      "stopType": "other",
      "locationName": "Củ Chi Horse Farm, TP.HCM",
      "country": "Vietnam",
      "plannedDeparture": "2026-10-15T08:00:00Z"
    },
    {
      "sequenceNo": 2,
      "stopType": "border_check",
      "locationName": "Mộc Bài Border Gate",
      "country": "Vietnam",
      "plannedArrival": "2026-10-15T12:00:00Z",
      "plannedDeparture": "2026-10-15T14:00:00Z"
    },
    {
      "sequenceNo": 3,
      "stopType": "rest",
      "locationName": "Phnom Penh Vet Care Station",
      "country": "Cambodia",
      "plannedArrival": "2026-10-15T19:00:00Z",
      "plannedDeparture": "2026-10-16T06:00:00Z"
    },
    {
      "sequenceNo": 4,
      "stopType": "quarantine",
      "locationName": "Singapore Turf Club Quarantine Station",
      "country": "Singapore",
      "plannedArrival": "2026-10-17T15:00:00Z"
    }
  ]
}
```

### `PATCH /routes/:routeId/schedule` (Fleet Coordinator / Manager / Admin)
Modifies planned schedule times on stops. A mandatory `reason` is required for audit history.
- **Body:**
```json
{
  "reason": "Thời tiết xấu và ùn tắc tại cửa khẩu, lùi giờ khởi hành 2 tiếng",
  "stops": [
    {
      "stopId": 2,
      "plannedArrival": "2026-10-15T14:00:00Z",
      "plannedDeparture": "2026-10-15T16:00:00Z"
    }
  ]
}
```

### `POST /routes/shipment/:shipmentId/publish` (Logistics Manager / Coordinator / Admin)
Publishes the trip plan. Validates that the order is approved, route has >= 2 stops, assigned vehicles meet horse capacity, and staff is assigned. Changes shipment status to `in_transit` and route status to `active`. Notifies customer and operations team.
- **Body:** `{ "notes": "Xe đã chuẩn bị đầy đủ oxy và thuốc chống say" }`

### `POST /routes/stops/:stopId/progress` (Driver / Escort / Operations)
Records actual progress at a milestone stop (`arrived`, `customs_cleared`, `departed`, `delivered`) and notifies the coordinator and customer.
- **Body:**
```json
{
  "status": "arrived",
  "actualArrival": "2026-10-15T12:15:00Z",
  "notes": "Đã đến trạm Mộc Bài an toàn, kiểm tra sức khỏe ngựa ổn định"
}
```

## Contract rules

- Every mutation returns the updated resource status and an audit identifier.
- Status-changing endpoints must validate the actor's role and resource ownership.
- File upload endpoints must return attachment metadata, not expose local file paths.
- Tracking events are append-only; corrections are new events with a reason.
- Emergency route or cost changes require manager approval before publication.

Document request/response examples here as each module reaches an agreed contract.

## Flow 4 — Tracking

All endpoints are under `/api`, require a bearer JWT, and enforce ownership/assignment server-side. A customer cannot mutate tracking. Unassigned drivers/escorts receive 403. Coordinators may monitor; writes require a `fleet_coordinator` assignment. Legacy leg/stop endpoints remain compatible and use the same checks and persistence.

Coordinator/manager/admin milestone writes must use `/tracking/shipments/:id/coordinator-override` with a nonblank `reason`. Ordinary start/check-in/leg endpoints return 400 for these actors, including when a caller adds an unsupported `reason` field to their bodies.

| Method | Path | Purpose |
|---|---|---|
| GET | `/tracking/my-trips` | Own customer trips, assigned driver/escort trips, or operational trips for coordinator/manager/admin |
| POST | `/tracking/shipments/:id/start` | Start the next eligible leg and set shipment/route to `in_transit` |
| POST | `/tracking/shipments/:id/checkin` | Append a stop check-in and update its current projection |
| POST | `/tracking/shipments/:id/health-logs` | Append a health observation for a horse in the shipment |
| GET | `/tracking/shipments/:id/health-logs` | Paginated history; `page=1`, `pageSize=10` (max 100), optional `horseId` |
| GET | `/tracking/shipments/:id` | Actual milestones, check-ins, status history, first health page, latest telemetry and alerts |
| POST | `/tracking/shipments/:id/legs/:legId/start` | Compatible explicit leg departure |
| POST | `/tracking/shipments/:id/stops/:stopId/status` | Compatible explicit stop check-in |
| POST | `/tracking/shipments/:id/legs/:legId/complete` | Complete the current leg; last leg completes shipment |
| POST | `/tracking/shipments/:id/coordinator-override` | Apply the current permitted action with mandatory `reason` |
| POST | `/tracking/shipments/:id/complete` | Completion only if all route legs are complete |

Start body: `{ "notes": "Vehicle checked" }`. Optional `actualTime` must be ISO 8601, not in the future, and not before the preceding event.

Check-in body:

```json
{ "routeStopId": 12, "action": "arrived", "vehicleTemperatureC": 21.5, "notes": "At rest stop" }
```

`action` is `arrived`, `customs_cleared`, or `departed`. Normal stops require arrival before departure; customs/quarantine requires arrival, clearance, then departure. Stops and legs must belong to the requested shipment and follow their configured order. Repeated or backward actions return 400.

Health body:

```json
{ "horseId": 5, "conditionStatus": "stable", "temperatureC": 38.2, "heartRateBpm": 40, "vehicleTemperatureC": 20, "notes": "Internal observation", "attachments": [] }
```

`horseId` and `conditionStatus` are required. Allowed conditions: `stable`, `not_eating`, `stressed`, `climate_change`, `other`. Optional measurements must be numeric: body 20–50°C, whole-number pulse 1–300 bpm, cabin -30–70°C. Attachments allow at most five HTTP(S) or `/uploads/` URLs. Horse identity is checked against `shipment_horse` and the name is read from the database.

All body/cabin temperature fields accept at most one decimal place; greater precision returns 400 rather than rounding across an alert boundary. This applies to health observations and milestone/check-in bodies. History `page` must be an integer between 1 and 2,147,483,647; `pageSize` must be an integer between 1 and 100.

Health history response: `{ "items": [], "page": 1, "pageSize": 10, "total": 0, "totalPages": 0 }`, ordered newest first by timestamp and ID. Detail responses retain `healthLogs` (first ten records) and add `healthLogsPagination`, `checkIns`, `telemetry: { vehicleTemperatureC, recordedAt }`, and `alerts`. Missing measurements are `null`. Customer responses omit internal notes. `lastUpdated` is the latest persisted event timestamp, not the polling time.

Alerts contain `type`, `message`, `value`, `recordedAt` and optional `horseId`. Types: `horse_fever` (>38.5°C on each horse's latest observation), `vehicle_temperature` (<16°C or >22°C on latest non-null cabin measurement). These are operational thresholds; they do not simulate an IoT feed.

Tracking `requestCode` is derived from the actual `shipment_id` (`REQ-001`, etc.), never from notes or demo markers. `checkIns.actualTime` preserves the submitted/observed event time, including customs clearance. Status audit entries expose `occurredAt` separately from insertion `createdAt`; backward event times are rejected under the same shipment transaction.

Coordinator overrides validate the action against the milestone identifier. `leg-<id>-start` accepts `start_leg`; `leg-<id>-end` accepts `arrive_leg` or the compatible alias `complete_leg`. `stop-<id>` accepts `arrive_stop`, `depart_stop`, `clear_customs` and their status aliases. A mismatch returns 400 without changing shipment state or writing history. The current milestone and assignment rules still apply.

## Customer MoMo sandbox

The customer order detail panel uses the MoMo test gateway. It creates a domestic ATM card session (`requestType=payWithATM`) and opens MoMo's hosted `payUrl`. Card details are entered only on MoMo; this application neither accepts nor stores card numbers or OTPs. Browser-local success simulation has been removed. Sandbox results are stored separately and never mark a shipment as paid with real money or change execution status. The optional payment flow does not block Flows 1–4.

| Method | Path under `/api` | Authorization / purpose |
|---|---|---|
| GET | `/orders/:id/payments/momo` | Customer owns shipment; returns `{ enabled, sandbox: true, payment }` |
| POST | `/orders/:id/payments/momo` | Customer owns approved/operational shipment; creates or reuses a sandbox payment |
| POST | `/orders/:id/payments/momo/refresh` | Customer owns shipment; backend queries MoMo for the persisted transaction |
| POST | `/orders/payments/momo/ipn` | No JWT; verifies MoMo HMAC signature and persisted transaction fields; acknowledges with HTTP 204 |

Create and refresh require no body. Amount is read from MySQL `shipment.total_cost`, an integer VND quote between 10,000 and 50,000,000. Clients cannot override amount, callbacks, merchant credentials or transaction IDs. Creation locks the shipment while reserving the transaction; concurrent/repeated requests reuse the existing creating/pending/unknown/succeeded payment. Only a failed payment permits a new attempt. Quote/partner changes while an existing payment is unresolved return 409.

Payment response fields: `id`, `shipmentId`, `orderId`, `amount`, `status`, `payUrl`, `method`, `resultCode`, `message`, `transactionId`, `updatedAt`, `sandbox: true`. Status is `creating`, `pending`, `succeeded`, `failed`, or `unknown`. Create `resultCode=0` means card session created, **not payment completed**. Verified query/IPN codes 0 or 9000 mean sandbox success for this one-step auto-capture flow. Timeouts retain `unknown` to prevent an unsafe duplicate attempt. Successful records cannot be downgraded by delayed notifications. IPN retries are deduplicated, and changes append to `shipment_sandbox_payment_event`.

IPN requires `partnerCode`, `orderId`, `requestId`, `amount`, `orderInfo`, `orderType`, `transId`, `resultCode`, `message`, `payType`, `responseTime`, `extraData`, `signature`. HMAC-SHA256 uses the alphabetically ordered documented IPN fields plus `accessKey`; identity and amount are matched with MySQL. Redirect query parameters never determine payment status. On return, the browser requests server-side reconciliation.

### Setup and verification

1. Apply migrations 013–014: `node database/apply-momo-migration.cjs` from the root. It preserves existing orders.
2. Set the backend-only variables from `.env.example`: `MOMO_SANDBOX_ENABLED=true`, `MOMO_ENDPOINT=https://test-payment.momo.vn/v2/gateway/api/create`, `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY`, `MOMO_REDIRECT_ORIGIN`, `MOMO_IPN_URL`. Never put keys in `NEXT_PUBLIC_*` variables or commit `.env`.
3. MoMo publishes shared test credentials in its [official Node.js sample](https://github.com/momo-wallet/payment/blob/master/nodejs/MoMo.js). On 2026-10-21 the user-supplied sample credentials were verified against ATM create (code 0, pay URL without QR) and query (code 1000, awaiting confirmation). Merchant-owned testing credentials can also be obtained from [MoMo Business](https://developers.momo.vn/v3/vi/docs/payment/api/other/postman/).
4. For push callbacks, `MOMO_IPN_URL` must be a reachable HTTPS endpoint. A localhost URL works for local request signing but cannot receive MoMo's external IPN; use the authenticated **Kiểm tra kết quả** button to query instead. Enter only official ATM test card details on the MoMo sandbox page. Public success fixture: 9704 0000 0000 0018, NGUYEN VAN A, date 03/07, OTP `OTP`; see [MoMo test instructions](https://developers.momo.vn/v3/vi/docs/payment/onboarding/test-instructions/).
5. Build backend and run `npm run test:momo` in `backend/`. Tests use isolated MySQL fixtures and stub the external gateway. They do not perform a real card payment. Live sandbox creation/query are checked separately.

Only the exact MoMo sandbox endpoint is accepted; production mode disables this feature. Public demo credentials do not establish trustworthy real settlement. This implementation is intentionally limited to sandbox records. Query signing includes `requestId`, as required and verified by the current test gateway. Official references: [one-time ATM API](https://developers.momo.vn/v3/docs/payment/api/atm/onetime/), [IPN](https://developers.momo.vn/v3/docs/payment/api/result-handling/notification/).

### ATM method migration and tracking read additions

Query reconciliation accepts an omitted/null amount only for recognized terminal failure codes (1001–1007, 1017, 1026), with matching partner, order and query request IDs. Any supplied amount must match MySQL; pending and successful results always require the stored amount. Sandbox code `1005` is persisted as `failed` with an expiry message so the customer can create a fresh card session. Previous payment rows and events remain in history. This handles the live sandbox's expired-session response, which omits `amount` and `transId`.

Migration 014 adds immutable `request_type`; legacy rows remain `captureWallet`. New sessions use `payWithATM`; legacy pending wallet sessions are retained as history and are not presented as card sessions. Any verified successful payment, including a legacy wallet payment, prevents a new attempt. Successful ATM IPNs must have `payType=napas`.

Tracking detail additionally returns `latestHorseHealth`: the latest observation for each assigned horse, independent of the ten-item health history page. Customer responses omit internal notes here too. Milestone `allowedActions` are empty for unconfirmed driver/escort assignments.
