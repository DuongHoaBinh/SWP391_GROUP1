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

## Contract rules

- Every mutation returns the updated resource status and an audit identifier.
- Status-changing endpoints must validate the actor's role and resource ownership.
- File upload endpoints must return attachment metadata, not expose local file paths.
- Tracking events are append-only; corrections are new events with a reason.
- Emergency route or cost changes require manager approval before publication.

Document request/response examples here as each module reaches an agreed contract.
