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

- **Database:** PostgreSQL
- **API documentation:** OpenAPI/Swagger
- **File storage:** local storage for development, replaceable provider for production
- **External integrations:** adapter interfaces with mock providers during development

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
5. Use PostgreSQL migrations for schema changes.

## Suggested ownership

The first implementation slice is `auth`, `orders`, and `documents`, plus the `manager` and `customer` application routes. Other modules can be developed independently against the documented contracts.
