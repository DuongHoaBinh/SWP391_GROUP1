# Flow 4: Status Updates and Route Log (Required)

> **Cập nhật sau review 11/2026:** Transport Specialist và Fleet & Route Coordinator đã gộp vào **Logistics Manager** (xem `docs/actors-and-roles.md`). Trong tài liệu này, mọi chỗ ghi Specialist/Coordinator được hiểu là Logistics Manager; role `TRANSPORT_SPECIALIST`/`FLEET_ROUTE_COORDINATOR` chỉ còn để tương thích dữ liệu cũ.

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
- Health logs are associated with an individual horse, trip, author, time, and optional attachment.
- Customer tracking exposes operational status and approved location information, not private staff notes.
- For consolidated shared road trips (`shared_stall` with multiple origins/destinations), staff tracking timelines (`DRIVER_ESCORT`, `FLEET_ROUTE_COORDINATOR`, `LOGISTICS_MANAGER`, `ADMIN`) display the ordered physical corridor (`farther origin -> closer pickup transfer_hub -> shared corridor transit stops -> closer dropoff transfer_hub -> farther destination`) and `consolidatedRouteSummary`, keeping sibling stops synchronized on the same `road_trip`.
- When departing a dropoff `transfer_hub` milestone on a consolidated shared trip, only the sibling shipment(s) whose destination matches that hub are transitioned to completed (`completed`), while remaining shipments continue `in_transit` and the assigned vehicle stays `in_use` until the final destination completes.
- Customer tracking responses redact `transfer_hub` milestones, sibling pickup/dropoff locations, `roadTripId`, and shared-trip terminology (`chuyến ghép`) server-side so each customer sees only their own origin, corridor transit stops, and destination.
- The order completion endpoint permits only Manager/Admin or an assigned Driver/Escort. It accepts only an in-transit order (retries on completed orders are idempotent), locks the shipment and updates shipment/horse/route together, releasing the shipment's held horses from `horse.status = 'in_transit'` back to `'active'` (`'delivered'` is not used on `horse.status`). Optional Flow 6 evidence is not a mandatory prerequisite for Flow 4 completion.

## Outputs

Current trip status, chronological route log, horse health log, delay alerts, and customer notifications.

**Owner:** `backend/src/modules/tracking`  
**Primary UI:** `frontend/src/app/driver`, `frontend/src/app/coordinator`, `frontend/src/app/customer`, `frontend/src/app/manager`

## Ngưỡng Sinh hiệu 3 Tầng, Check-in Chéo, Kênh Thông báo & Offline Fallback (BA Spec v3.1 — `DEC-06` & `DEC-07`)

> [!IMPORTANT]
> Phân quyền thực hiện tuân thủ Ma trận RACI tại [actors-and-roles.md](file:///f:/SWP/Project/SWP391_GROUP1/docs/actors-and-roles.md). Quy tắc ngưỡng sinh hiệu bên dưới đã chốt về mặt cấu trúc toán học (**`DEC-06`: Structurally Approved — Pending Vet Calibration**) và bắt buộc đọc từ cấu hình `equine_vital_config`, không hardcode trong mã nguồn.

### Quy tắc Nghiệp vụ Bổ sung (`BR-F4-02` → `BR-F4-05`)

- **Check-in chéo `driver` vs `escort` (`DEC-07` Approved):** Đường bộ ưu tiên `driver` check-in mốc, chặng bay và nhật ký sức khỏe ưu tiên `escort`; cho phép hai vai trò được phân công trên cùng chuyến check-in chéo dự phòng nhưng **bắt buộc** lưu `updated_by_role` (`Target Spec v3.1 (Planned)`).
- **`BR-F4-03` (Ngưỡng Cảnh báo Sinh hiệu Ngựa 3 Tầng — Phân hoạch Kín, `Target Spec v3.1 (Planned)`):**
  - **Thân nhiệt `t` (°C — phủ kín, không khoảng hở):** Xanh `37.5 <= t <= 38.5`; Vàng `37.0 <= t < 37.5` hoặc `38.5 < t < 39.3`; Đỏ `t < 37.0` hoặc `t >= 39.3`.
  - **Nhịp tim `hr` (bpm — baseline nghỉ, Vet hiệu chỉnh ngưỡng vận chuyển trước Go-Live):** Xanh `28 <= hr <= 44`; Vàng `24 <= hr < 28` hoặc `44 < hr < 60`; Đỏ `hr < 24` hoặc `hr >= 60`.
  - **Phân tầng Cảnh báo Tổng hợp & Chống Quá tải (Alert Fatigue Prevention):**
    - *Tầng Đỏ (Red Alert — Báo khẩn Manager + Coordinator + Quy trình Thú y):* `t` thuộc Đỏ **HOẶC** `hr` thuộc Đỏ **HOẶC** trên cùng một cá thể ngựa (`shipment_horse_id`) ghi nhận **`>= 2` mốc Vàng thuộc nhóm leo thang (`escalatable_amber`) liên tiếp trong cửa sổ tối đa `Δt <= 6 giờ`** (`consecutive_alert_window_hours = 6`).
    - *Tầng Vàng (Amber Alert — Thông báo Coordinator & Specialist):* Chia 2 nhóm: (1) `escalatable_amber`: `t` thuộc Vàng, `hr` thuộc Vàng, hoặc `condition_status IN ('not_eating', 'stressed')`; (2) `observational_amber`: `condition_status IN ('climate_change', 'other')` khi sinh hiệu Xanh (mặc định chỉ quan sát, không tự cộng dồn lên Red Alert).
    - *Tầng Xanh (Normal):* `condition_status = stable` và mọi sinh hiệu nhập vào đều thuộc Xanh.
- **`BR-F4-05` (Kênh Thông báo & Chế độ Mất sóng Thực địa — `Target Spec v3.1 (Planned)`):**
  - *Kênh thông báo:* `In-App` (mọi sự kiện); `Email SMTP` (OTP, báo giá, hóa đơn/thanh toán, thiếu hồ sơ gấp, lịch chính thức, thông quan, hoàn tất); `Push/SMS` (mở rộng Release 2 cho Red Alert & trễ sát giờ bay).
  - *Offline Fallback:* Cho phép Driver/Escort nhập `actualTime` tách biệt `createdAt` server. Nếu `|createdAt - actualTime| > 30 phút` → gắn cờ `isBackdated = true` và bắt buộc `notes`. Nếu mất sóng `> 60 phút` quá giờ ETA mốc → gọi hotline để Coordinator thực hiện `coordinator-override` kèm lý do.

### Acceptance Criteria (BDD — Flow 4)

- **AC-F4-01 (Chặn Xuất phát thiếu Gate 2):** *Given* đơn `confirmed`, đủ hồ sơ Flow 2 nhưng mới thanh toán MoMo Sandbox (chưa có SePay `succeeded`). *When* Driver gọi `checkInLegStart` chặng 1. *Then* trả `422 Unprocessable Entity` kèm danh sách `missingRequirements`.
- **AC-F4-02 (Hoàn tất Từng phần Chuyến Ghép):** *Given* `road_trip` chở Đơn A (đích Đà Nẵng `transfer_hub`) và Đơn B (Hà Nội) trên xe `51C-888.99`. *When* Driver check-in rời `transfer_hub` Đà Nẵng. *Then* Đơn A → `completed`, ngựa Đơn A → `active`, Customer A nhận thông báo; Đơn B giữ `in_transit` và xe giữ `in_use`.
- **AC-F4-03 (Ranh giới Sinh hiệu Kín, Cửa sổ 6h & Chống Alert Fatigue):** *Given* Ngựa X đang `in_transit` (`consecutive_alert_window_hours = 6`). *When* (1) 08:00 & 10:00 ghi `climate_change` sinh hiệu Xanh; (2) 12:00 ghi `stable`, `t = 38.55`, `hr = 25`; (3) 15:00 (cách 3h `<= 6h`) ghi `not_eating`, `t = 38.0`, `hr = 40`. *Then* (1) chỉ sinh Amber quan sát; (2) 12:00 phân loại `escalatable_amber` (không hở tại `38.55°C` và `25 bpm`); (3) 15:00 kích hoạt **Red Alert** cho Manager & Coordinator.
