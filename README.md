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
5. Review and run `database/schema.mysql.sql` against a local MySQL 8.0+ instance when database integration is enabled.

### Enable persistent customer registration

1. Create `backend/.env` from the root `.env.example` and set `DB_PASSWORD` to the local MySQL `root` password.
2. Configure Gmail SMTP with a 16-character Google App Password in `SMTP_PASSWORD`; do not use or commit the normal Gmail password.
3. Ensure the schema and `database/migrations/001_add_otp_password_hash.sql` have been executed.
4. Start the backend with `npm run start:dev` from `backend/`.

With this configuration, `POST /api/auth/register` stores the pending OTP and password hash in MySQL and sends the OTP by email. `POST /api/auth/verify-otp` creates the `Customer` row in `user`, and `POST /api/auth/login` reads the account from MySQL.

For local development, start the backend on port `5000` and the Next.js frontend on port `3001` (for example, `next dev -p 3001`).

### Login troubleshooting

Login requires the backend and its configured MySQL instance to be running. The frontend displays an error for connection failures, failed API responses or invalid sessions; it never substitutes a demo JWT. Successful login saves the returned session before navigating to the role dashboard. Visiting the login page does not clear an existing session; use Logout to sign out. A redirect to `/` or an authentication page falls back to the role dashboard to avoid returning immediately to login.

Run `npm run test:auth` from `frontend/` for login failure, session and redirect regressions.

## Suggested ownership

The first implementation slice is `auth`, `orders`, and `documents`, plus the `manager` and `customer` application routes. Other modules can be developed independently against the documented contracts.
