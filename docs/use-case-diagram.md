# Use Case Diagram

The system connects three operational actors (plus Admin) across core Flows 1–4 and optional Flows 5–6 as defined in `docs/requirements.md`.

> Sau review hội đồng 11/2026, Transport Specialist và Fleet & Route Coordinator đã gộp vào **Logistics Manager** (xem `docs/actors-and-roles.md`).

```mermaid
flowchart TB
  Customer["Customer / Horse Owner"]
  Manager["Logistics Manager (Quản lý vận hành)"]
  Driver["Vehicle Driver / Vet Escort"]
  Admin["Admin"]

  subgraph F1["Flow 1: Transport Request & Quote"]
    UC1["Manage Horses & Submit Order"]
    UC2["Approve, Price & Set Mode"]
    UC3["Settle Freight via SePay / MoMo"]
  end

  subgraph F2["Flow 2: Compliance & Quarantine"]
    UC4["Manage Country Regulations"]
    UC5["Upload Equine Dossiers"]
    UC6["Review Dossiers & Record Clearance"]
  end

  subgraph F3["Flow 3: Fleet & Route Planning"]
    UC7["Assign Strategic Framework"]
    UC8["Manage Fleet, Road Trips & Legs"]
    UC9["Accept Trip & Publish Route"]
  end

  subgraph F4["Flow 4 & 5-6: Tracking, Incidents & Reporting"]
    UC10["Update Stop Check-ins & Vital Logs"]
    UC11["Report / Resolve Corridor Incidents"]
    UC12["Monitor SLA & Performance Reports"]
    UC13["Execute Refund Transfer (SoD)"]
  end

  Customer --> UC1
  Customer --> UC5
  Customer --> UC3
  Customer --> UC10

  Manager --> UC2
  Manager --> UC4
  Manager --> UC6
  Manager --> UC7
  Manager --> UC8
  Manager --> UC9
  Manager --> UC10
  Manager --> UC11
  Manager --> UC12

  Driver --> UC9
  Driver --> UC10
  Driver --> UC11

  Admin --> UC13
```
