# Entity Relationship Design

The executable schema is `database/schema.mysql.sql` and targets MySQL 8.0+ with InnoDB and utf8mb4.

## Core entities

- `role`, `user`, `otp_verification`
- `horse`
- `regulation`, `document_type`, `transport_document`, `document_approval`
- `shipment`, `shipment_horse`
- `depot`, `vehicle_class`, `vehicle`, `shipment_vehicle`, `route`, `route_stop`, `shipment_assignment`
- `route_stop_update`, `horse_condition_log`, `attachment`
- `incident_report`, `shipment_change_request`, `delivery_handover`
- `notification`

## Important relationships

- **Trạm xe, loại phương tiện, sức chứa (migration `030_depots_vehicle_classes.sql`, Step 3)**:
  - `depot(depot_id, code UNIQUE, name, country, city, address, lat, lng, type ENUM('own','partner'), is_active)`. Seed demo: Thủ Đức, Long Biên, Đà Nẵng, Cần Thơ (own) và Phnom Penh, Bangkok, Singapore (partner).
  - `vehicle_class(code PK, mode ENUM('road','air','sea'), name_vi, name_en, horse_capacity NULL, price_coefficient, is_heavy_truck, sort_order)`.
  - `vehicle.depot_id` là FK nullable tới `depot`; xe đường bộ cũ được gán Trạm Thủ Đức. `vehicle.vehicle_class_code` là FK nullable tới `vehicle_class`, backfill theo `capacity`. `vehicle.capacity` được giữ để tương thích và luôn lấy theo loại khi tạo hoặc đổi loại. Cột `vehicle.current_location` có trong schema (trước đây chỉ được thêm lúc backend khởi động).
  - Số chỗ chuồng của đơn = tổng `shipment_horse.quantity` × (2 nếu `horse.requires_private_stall`, ngược lại 1). `route_leg.stalls_booked` lưu số chỗ này.
  - `shipment.booking_type` mặc định đổi sang `dedicated_charter`; giá trị `shared_stall` giữ trong ENUM cho đơn cũ. Bảng `road_trip` được giữ: mỗi chặng đường bộ của đơn mới vẫn có một `road_trip` riêng.

- A customer owns one or more horses and creates transport orders.
- `horse.status` uses `ENUM('active','in_transit','retired','deceased')` (`'delivered'` is not used): `'in_transit'` means the horse is currently held/reserved by a non-terminal shipment (`requested` through `in_transit`) and returns to `'active'` upon removal during `change_requested` or terminal shipment states (`cancelled`, `rejected`, `cancelled_operational`, `completed`).
- An order contains one or more horses and can become one transport plan/trip.
- A horse has a document set whose required documents depend on destination country and border gate.
- **Hồ sơ ngựa sau review 11/2026 (migration `029_horse_profile_after_review.sql`)**:
  - `horse.gender` và `horse.date_of_birth` ngừng dùng. Cột được giữ để không mất dữ liệu cũ, nhưng API không đọc/ghi nữa.
  - Thêm `horse.requires_private_stall BOOLEAN DEFAULT FALSE` và `horse.temperament ENUM('calm','normal','difficult') DEFAULT 'normal'` để xếp ngựa lên phương tiện.
  - `document_type(code PK, name_vi, name_en, default_validity_days, is_identity, sort_order)` là danh mục loại giấy tờ.
  - `transport_document.document_type_code` là FK nullable tới `document_type.code`. `transport_document.regulation_id` cho phép NULL: giấy tờ chung của ngựa (hộ chiếu, vi mạch...) không thuộc riêng quy định nào và được dùng lại cho nhiều đơn.
  - Giấy tờ vẫn append-only: tải bản mới thì bản cũ cùng loại có `is_archived = TRUE` và `superseded_by_document_id` trỏ sang bản mới.
- A trip uses a route made of ordered legs and stops, and has assigned vehicle/capacity and staff.
- Tracking events and horse health logs belong to a trip and record their author and timestamp.
- Incidents can create route-change and additional-cost approval records linked to the trip.
- Handover records close a trip only after the required horse/document checklist is confirmed.

The database schema is the executable source of truth; this document explains ownership and relationships at a business level.


## Official transport invoice

`shipment_invoice` (migration `016_route_payment_gate.sql`) belongs to `orders` billing. It references `shipment`, the confirmed `route`, and the paying customer (`user`). `route_id` is unique: repeated confirmations reuse the issued invoice. `amount` is a positive integer VND value; `snapshot` retains the customer, route and scheduled legs at issue time. `issued_at` is the server timestamp. Existing SePay receipts and sandbox history remain separate and unchanged.


## Equine insurance (migration 017)

- `shipment_horse`: `declared_value DECIMAL(15,2)`, `declared_currency`, `exchange_rate DECIMAL(18,6)`, `declared_value_vnd DECIMAL(15,2)`, `insurance_package`, per-horse `insurance_fee DECIMAL(15,2)`, `max_compensation DECIMAL(15,2)`, `emergency_vet_covered`, `insurance_policy_version`. The existing quantity multiplies premiums, not the declared unit value or unit compensation cap.
- `shipment`: `transport_cost DECIMAL(15,2) NULL` distinguishes pending freight from zero freight; `insurance_fee DECIMAL(15,2)` stores the sum of unit premiums multiplied by quantities. Existing `total_cost` becomes the combined quoted total after approval.
- `shipment_insurance_revision`: append-only `previous_snapshot` (JSON), shipment, changing customer, reason and server timestamp. It preserves policy data across pre-approval resubmissions without creating new horse identities.
- Migration 017 is rerunnable. Existing horses default to Basic with no added fee, historical totals remain unchanged, and existing quoted totals are copied to base freight. No prior trip is retrospectively charged insurance. The insurance record remains attached to its original shipment/horse relationship.
- Schema/migration 017 also supply missing nullable horse-profile columns (`color`, `weight`, `medical_status`, `special_requirements`) required by the existing horse selection and order detail API. Existing columns and profile values are preserved.

## Booking type (migration 018)

- `shipment.booking_type ENUM('shared_stall','dedicated_charter') NOT NULL DEFAULT 'shared_stall'` records the service Customer selected. Existing totals are preserved when adding this default to historical orders.
- `shipment.stall_unit_price DECIMAL(15,2) NULL` stores whole-VND unit freight for new shared quotes. Dedicated and legacy total-only quotes keep it null. `transport_cost` remains the total freight; `total_cost = transport_cost + insurance_fee` after approval.
- `shipment_booking_revision`: shipment/user foreign keys, previous/new booking enums, server timestamp and index by shipment/time. Revisions append on changes requested by Manager. They do not modify prior invoice snapshots.
- `shipment_invoice.snapshot` additionally retains booking type/unit price/horse count for the issued quote. Migration 018 is rerunnable and never recalculates historical prices.

## Road-trip capacity (migration 019)

- `road_trip`: vehicle FK, booking enum, origin/destination, booked start/end, creating staff FK and creation time. Trip coordinates/time are immutable through the API. A CHECK enforces arrival after departure.
- `route_leg.road_trip_id`: nullable FK to the road trip. Existing legs are unchanged. Road `stalls_booked` is set from the locked shipment's horse quantity, never the Customer/Coordinator payload.
- Shared membership is the set of road legs linked to a trip through their own routes/shipments. Vehicle row locks serialize all reservation decisions; overlapping different trips or Dedicated occupants are rejected. Completed booking intervals remain recorded; cancelled/rejected orders do not consume slots. No cross-customer membership details are exposed publicly.
- Applying 019 requires the existing Flow 3 schema (migration 010). The base schema declares road_trip; 019 supplies the leg FK after route_leg exists. This follows the project's base-schema-plus-migrations setup.

## Independent transport mode (migration 020)

- `shipment.transport_mode ENUM('road','air') NULL`: the Manager's selected mode. This is independent of `transportation_type` (Domestic/International) and `booking_type` (Shared/Dedicated).
- New approval writes the mode without overwriting geographic scope. Responses and invoice snapshots include the mode. Old rows remain null; older UI note-based inference remains a fallback, with no automatic historical rewrite.

## Target Schema Extensions (BA Spec v3.1 — `Planned`, Chưa có Migration)

> [!WARNING]
> Các mở rộng bảng và cột dưới đây thuộc **BA Spec v3.1 (`Target Spec`)** chưa được tạo thành SQL migration trong `database/migrations/` hay `database/schema.mysql.sql`. Tài liệu này phản ánh đúng ranh giới giữa schema thực thi hiện tại và thiết kế đích cho Release 1.

1. **`shipment` (Mở rộng trạng thái hủy vận hành, OTD & Runtime Compliance):**
   - Bổ sung `'cancelled_operational'` vào `shipment.status` ENUM.
   - Bổ sung `cancellation_category`, `cancellation_reason` (hủy vận hành); `excused_delay BOOLEAN`, `excused_delay_reason`, `excused_delay_confirmed_by`, `excused_delay_confirmed_at` (khóa sau 48h theo `DEC-02`); `in_transit_compliance_alert BOOLEAN` (`BR-F2-06`).
2. **`regulation` (Mở rộng đa chiều & Lead Time động — Gap G2 / `DEC-03`):**
   - Bổ sung `border_gate VARCHAR(100) NULL`, `transport_mode ENUM('road','air','both')`, `doc_tier ENUM('A','B')`, `lead_time_days INT`, `requires_authority_approval BOOLEAN`, `min_validity_buffer_hours INT`.
3. **`shipment_invoice` (Quản lý cửa sổ thanh toán động, gia hạn & nâng cấp `D - 3`):**
   - Bổ sung `status ENUM('active','void','superseded')`, `invoice_type ENUM('standard','replacement','supplemental')`, `payment_due_at DATETIME(3)`, `grace_due_at DATETIME(3)`, `grace_count TINYINT`, `parent_invoice_id INT NULL`.
4. **`shipment_operating_cost` (Bảng mới — Gap G1 / `DEC-02`):**
   - Lưu chi phí vận hành thực tế theo chuyến/hạng mục: `cost_id`, `shipment_id`, `route_leg_id NULL`, `cost_category ENUM('fuel','toll_border','airline_freight','quarantine_fee','staff_allowance','incident_absorbed','disbursement_absorbed_on_company_fault')`, `amount DECIMAL(15,2)`, `receipt_url`, `recorded_by`, `created_at`.
5. **`shipment_refund_record` (Bảng mới — Hoàn tiền Thủ công & SoD / `DEC-04`):**
   - Lưu chu trình hoàn tiền thủ công ngoài SePay: `refund_id`, `shipment_id`, `payment_id`, `refund_mode ENUM('cash_transfer','credit_30d')`, `amount BIGINT`, `status ENUM('pending_approval','approved_for_transfer','transferred','converted_to_credit','rejected')`, `approved_by`, `approved_at`, `second_approved_by NULL` (Dual-Approval `>= 20M VND`), `transferred_by NULL`, `transferred_at NULL`, `bank_reference`, `transfer_receipt_url`, `credit_expires_at`, ràng buộc nghiệp vụ `transferred_by != approved_by`.
6. **`shipment_disbursement` (Bảng mới — Ứng trước Phí Cơ quan có Biên lai / `BR-F1-09`):**
   - Lưu lệ phí cơ quan nhà nước ứng trước cho từng đơn (`disbursement_id`, `shipment_id`, `authority_name`, `amount BIGINT`, `authority_receipt_url`, `settled_status`, `recorded_by`).
7. **`equine_vital_config` (Bảng mới — Cấu hình Ngưỡng Sinh hiệu 3 Tầng / `DEC-06`):**
   - Tham số hóa ngưỡng `temp_green_min/max`, `temp_amber_low/high`, `hr_green_min/max`, `hr_amber_low/high`, `escalatable_statuses`, `consecutive_alert_window_hours` (mặc định `6`), `updated_by_vet_name`, `calibrated_at`.
8. **`route_stop_update` / `trip_status_log` (Mở rộng Audit Thực địa):**
   - Bổ sung `updated_by_role ENUM('driver','escort','coordinator','manager','admin')` (`DEC-07`) và `is_backdated BOOLEAN` (`BR-F4-05`).
