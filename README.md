# SWP391_GROUP1

Cross-Border Racehorse Transport Management System - SWP391 Group 1

## Technology stack

### Frontend

- **Language:** TypeScript
- **UI library:** React
- **Framework:** Next.js (built on React)
- **Styling:** CSS Modules or the styling solution agreed by the team
- **Responsibilities:** actor-based pages, forms, document uploads, tracking views, notifications, and API consumption

Frontend code belongs under `frontend/src`. Use `app/` for route pages, `features/` for domain-specific UI and client logic, `components/` for shared UI, and `lib/` for API clients and utilities.

### Backend

- **Language:** TypeScript
- **Framework:** NestJS
- **API style:** REST API with JSON responses
- **Responsibilities:** authentication/RBAC, business rules, workflow validation, file metadata, notifications, tracking, reports, and audit logs

Backend code belongs under `backend/src`. Organize controllers, services, DTOs, and persistence logic by business module.

### Database and infrastructure

- **Database:** MySQL 8.0+ (InnoDB, utf8mb4)
- **API documentation:** OpenAPI/Swagger
- **File storage:** local storage for development, replaceable provider for production
- **External integrations:** adapter interfaces with mock providers during development

### Development ports

- **Backend API:** `http://localhost:5000`
- **Frontend:** `http://localhost:3001`

The frontend and backend are two separate processes. The frontend runs on port `3001` and sends API requests to the backend on port `5000`; they should not use the same port on the same computer.

The authentication API is backend-only on this feature branch. Customer registration uses email, password, password confirmation, OTP verification, MySQL persistence, and SMTP email delivery. Internal roles receive provisioned accounts and do not use public registration.

## Repository layout

- `frontend/src/app`: route surfaces grouped by actor.
- `frontend/src/features`: reusable domain behavior for orders, documents, and tracking.
- `backend/src/modules`: backend modules grouped by business domain.
- `database`: schema, seed data, and reviewed migrations.
- `docs`: requirements, role definitions, API notes, and flow specifications.

## Getting started

1. Copy `.env.example` to the frontend and backend environment files required by the selected setup.
2. Install dependencies separately in `frontend/` and `backend/`.
3. Read `docs/requirements.md` and `docs/actors-and-roles.md` before implementing a flow.
4. Keep each flow's business rules in its owning backend module and update the matching file under `docs/flows/`.
5. Initialize a fresh local MySQL 8.0+ database using `database/schema.mysql.sql` (canonical 40-table schema, single source of truth for fresh installs) and optional development accounts/regulations in `database/seed.sql`.

### Enable persistent customer registration

1. Create `backend/.env` from the root `.env.example` and set `DB_PASSWORD` to the local MySQL `root` password.
2. Configure Gmail SMTP with a 16-character Google App Password in `SMTP_PASSWORD`; do not use or commit the normal Gmail password.
3. Ensure `database/schema.mysql.sql` has been executed cleanly.
4. Start the backend with `npm run start:dev` from `backend/`.

With this configuration, `POST /api/auth/register` stores the pending OTP and password hash in MySQL and sends the OTP by email. `POST /api/auth/verify-otp` creates the `Customer` row in `user`, and `POST /api/auth/login` reads the account from MySQL.

For local development, start the backend on port `5000` and the Next.js frontend on port `3001` (for example, `next dev -p 3001`).

### Schema source of truth, parity check & health check

- **Fresh installs:** Use `database/schema.mysql.sql` as the single canonical schema source (includes all 40 tables, `shipment.status` with `'cancelled_operational'`, `horse.status` without legacy `'delivered'`, and active generated unique indexes). Files under `database/migrations/` are historical upgrade scripts for older existing databases; do **not** run `migrate:all` on top of a fresh `schema.mysql.sql` install (or use targeted Wave scripts only on pre-wave DBs).
- **Schema parity test:** From `backend/`, run `npm run test:schema-parity` to verify in an isolated DB (`horse_transport_test` vs `horse_transport_schema_only_check`) that `schema.mysql.sql` and the test harness produce 100% identical tables, columns, ENUMs, and indexes.
- **Health endpoint:** `GET http://localhost:5000/api/health` verifies database connectivity (`SELECT 1`).

### Quality checks & tests

- **Backend** (`backend/`): run `npx tsc --noEmit && npm run build && npm test` (builds NestJS and runs unit/policy test suites).
- **Frontend** (`frontend/`): run `npx tsc --noEmit && npm run lint && npm run build`, plus focused regression suites `npm run test:auth`, `npm run test:booking`, `npm run test:insurance`, `npm run test:sepay`, and `npm run test:controlled`.

### Login troubleshooting

Login requires the backend and its configured MySQL instance to be running. The frontend displays an error for connection failures, failed API responses or invalid sessions; it never substitutes a demo JWT. Successful login saves the returned session before navigating to the role dashboard. Visiting the login page does not clear an existing session; use Logout to sign out. A redirect to `/` or an authentication page falls back to the role dashboard to avoid returning immediately to login.

Run `npm run test:auth` from `frontend/` for login failure, session and redirect regressions.

An expired or invalid session (HTTP 401) clears the old session and returns to login with an expiry notice and the original page as the return destination. Multiple failed requests redirect once; a delayed response from an old session cannot clear a newer login. Permission errors (403), server errors and connection failures do not sign the user out.

## Suggested ownership

The first implementation slice is `auth`, `orders`, and `documents`, plus the `manager` and `customer` application routes. Other modules can be developed independently against the documented contracts.
