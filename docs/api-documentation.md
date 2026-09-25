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

## Contract rules

- Every mutation returns the updated resource status and an audit identifier.
- Status-changing endpoints must validate the actor's role and resource ownership.
- File upload endpoints must return attachment metadata, not expose local file paths.
- Tracking events are append-only; corrections are new events with a reason.
- Emergency route or cost changes require manager approval before publication.

Document request/response examples here as each module reaches an agreed contract.
