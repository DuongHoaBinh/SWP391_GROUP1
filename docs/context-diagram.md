# Context Diagram

> **Cập nhật sau review 11/2026:** Transport Specialist và Fleet & Route Coordinator đã gộp vào **Logistics Manager** (xem `docs/actors-and-roles.md`). Trong tài liệu này, mọi chỗ ghi Specialist/Coordinator được hiểu là Logistics Manager; role `TRANSPORT_SPECIALIST`/`FLEET_ROUTE_COORDINATOR` chỉ còn để tương thích dữ liệu cũ.

The system coordinates horse owners (customers), internal operations staff, drivers/escorts, and external services including email delivery, payment gateways, and quarantine/customs compliance storage.

```mermaid
flowchart LR
  C["Customer / Horse Owner"]
  M["Logistics Manager"]
  S["Transport Specialist"]
  F["Fleet & Route Coordinator"]
  D["Driver / Vet Escort"]

  subgraph SYS["EquiTransit Platform"]
    FE["Next.js Web Portal (Port 3001)"]
    BE["NestJS REST API (Port 5000)"]
    DB["MySQL 8.0+ Database"]
    FS["Protected File Storage"]
  end

  SMTP["SMTP Email Service"]
  SEPAY["SePay VietQR Bank Gateway"]
  MOMO["MoMo Sandbox Adapter"]
  GOAUTH["Google OAuth 2.0"]

  C --> FE
  M --> FE
  S --> FE
  F --> FE
  D --> FE

  FE <--> BE
  BE <--> DB
  BE <--> FS
  BE --> SMTP
  BE <--> SEPAY
  BE <--> MOMO
  FE --> GOAUTH
  BE --> GOAUTH
```

External integrations are encapsulated behind adapters so local development can use sandboxed gateways while preserving auditability.
