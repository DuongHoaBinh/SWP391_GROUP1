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

### 8. Check-in GPS, Geofence, Chế độ Giả lập & Live Tracking (Migration 037 — Step 10)

- **Kiểm tra Geofence tại mốc dừng (`evaluateGeofence`):**
  - Khi Driver gọi check-in (`/legs/:id/start`, `/stops/:id/status`, `/legs/:id/complete`), vị trí gửi lên được kiểm tra với tọa độ kế hoạch của mốc.
  - Bán kính kiểm soát `radius`: mặc định `300 m` cho trạm nghỉ, trạm dừng thường; `1.000 m` cho sân bay, cảng biển, khu kiểm dịch biên giới.
  - Điểm được tính là hợp lệ (bên trong geofence) nếu: `distance <= radius + min(accuracy, 100)`.
  - Nếu độ chính xác GPS kém (`accuracy > 200 m`), từ chối với lỗi `409 LOW_GPS_ACCURACY`.
  - Nếu ngoài geofence mà không có lý do/bằng chứng: từ chối với lỗi `409 OUTSIDE_GEOFENCE`.
  - **Check-in thủ công dự phòng (Manual Override):** Khi ngoài vùng hoặc mất tín hiệu GPS, Driver phải nhập `manualReason` (tối thiểu 10 ký tự) và `evidenceUrl` (ảnh chụp thực tế). Hệ thống ghi nhận với `geofence_passed = 0`, đánh cờ `flagged = 1` và kích hoạt thông báo cảnh báo đến Logistics Manager.
- **Bắt buộc Ghi nhận Sinh hiệu trước khi rời trạm nghỉ/kiểm dịch:**
  - Tại các điểm dừng loại `rest` hoặc `quarantine`, trước khi Driver gọi check-in rời trạm (`departed`), hệ thống kiểm tra toàn bộ cá thể ngựa trên chuyến (`shipment_horse`).
  - Mọi con ngựa phải có ít nhất 1 bản ghi sinh hiệu (thân nhiệt `temperature_c` và nhịp tim `heart_rate_bpm`) được ghi sau thời điểm xe đến trạm (`actual_arrival`). Nếu thiếu, chặn xuất phát với lỗi `409 VITALS_REQUIRED` kèm danh sách `missingHorses`.
  - Khi sinh hiệu ghi nhận rơi vào tầng Đỏ (`red`), hệ thống gửi thông báo khẩn cấp ngay lập tức đến Logistics Manager và Khách hàng (tôn trọng cấu hình `customer_vitals_detail`).
- **Luồng Tọa độ Xe (`vehicle_position_ping`) & Chế độ Giả lập (Simulation):**
  - Tài xế/thiết bị xe gửi mảng ping vị trí định kỳ (`POST /tracking/shipments/:id/pings`, tối đa 100 điểm/lần). Bỏ qua ping tương lai (> 2 phút) hoặc quá cũ (> 24 giờ); gắn cờ `is_backdated = 1` nếu chậm > 5 phút.
  - Cờ `simulation_enabled` trong cấu hình hệ thống: chỉ Admin được phép bật/tắt (`PATCH /system-settings/tracking`). Nếu cờ tắt mà ping hoặc check-in gửi lên có `source = 'simulated'`, hệ thống trả lỗi `403 SIMULATION_DISABLED`.
  - Khi bật chế độ giả lập, mọi dữ liệu hiển thị trên bản đồ và bảng điều khiển đều được gắn nhãn nổi bật `[GIẢ LẬP / SIMULATED]`.
- **Live Tracking Map & Fleet Overview:**
  - `GET /tracking/shipments/:id/live`: Trả về tọa độ xe tức thời, heading, tốc độ, danh sách mốc/trạm, vệt đường thực tế (giảm lấy mẫu tối đa 500 điểm qua Ramer-Douglas-Peucker), tiến độ %, ETA, và sinh hiệu mới nhất.
  - `GET /tracking/live-overview`: Cung cấp giao diện radar cho Logistics Manager giám sát đồng thời toàn bộ xe đang `in_transit`, phân loại theo 3 tầng cảnh báo (`green`, `amber`, `red`).


## 9. Vòng đời Trạng thái Đơn Khứ hồi & No-Show (Step 5 — Review 11/2026)

- **Trạng thái `return_pending`:**
  - Đối với đơn một chiều (`one_way`), khi chặng cuối hoàn tất, đơn chuyển ngay sang `completed` và ngựa chuyển về `active`.
  - Đối với đơn khứ hồi (`round_trip`), khi chặng đi (`outbound`) hoàn tất:
    - Đơn chuyển sang trạng thái `return_pending`.
    - Ngựa tiếp tục giữ trạng thái `in_transit` (được lưu giữ chăm sóc tại trang trại/trung tâm điểm đến).
    - Toàn bộ các kiểm tra active shipment (hồ sơ, sự cố, đổi lịch) đều coi `return_pending` là trạng thái đang hoạt động bình đẳng như `in_transit`.
- **Khởi hành Chặng về:**
  - Khi tài xế xuất phát chặng về đầu tiên, đơn chuyển từ `return_pending` sang `in_transit`, và `return_status` chuyển thành `'in_progress'`.
- **Hoàn thành Toàn bộ Chuyến đi:**
  - Khi chặng về cuối cùng cập bến, đơn chuyển sang `completed`, `return_status` chuyển sang `'completed'`, và ngựa được giải phóng về trạng thái `active`.
- **Quy trình Xử lý No-Show Chặng về (`POST /tracking/shipments/:id/return/no-show`):**
  - Tài xế được phân công chặng về có trách nhiệm có mặt tại điểm đón trước giờ khởi hành và chờ tối thiểu 120 phút (`return_wait_minutes`).
  - Trước mốc `return_departure_at + return_wait_minutes`: Hệ thống chặn không cho đánh dấu no-show (`409 Conflict` kèm thông tin `allowedAt`).
  - Sau mốc chờ: Tài xế chụp ảnh làm bằng chứng và gửi yêu cầu no-show.
  - Server cập nhật `shipment.status = 'completed'`, `shipment.return_status = 'no_show'`, `shipment.return_no_show = true`, giải phóng ngựa về `active`, giải phóng xe về `active`, ghi `trip_status_log` (milestone `no_show`) và gửi thông báo cho khách hàng cùng Logistics Manager. Khách hàng không được hoàn lại bất kỳ khoản cước chặng về nào.

## 10. Timeline Tiến độ Dạng Line Dọc Dùng Chung (Step 11 — BA Spec & Hội đồng G12)

### 1. Mục tiêu và Nguyên tắc Dùng chung
- Hợp nhất hiển thị tiến trình của một chuyến đi thành component duy nhất `VerticalTimeline` phục vụ đồng bộ cả 3 actor: **Customer**, **Logistics Manager**, và **Driver/Escort**.
- Tiến độ được chia thành 4 nhóm mốc thời gian rõ ràng:
  1. `pre_trip` (Trước chuyến đi): Đặt cọc/Thanh toán cước, Quản lý phê duyệt, Hồ sơ kiểm dịch & hải quan, Xe & tài xế xác nhận xuất phát.
  2. `outbound` (Chặng đi): Điểm đón xuất phát, các trạm dừng chân/nghỉ ngơi, cửa khẩu/trạm kiểm dịch, sân bay/cảng, và điểm giao đích.
  3. `return` (Chặng về - chỉ hiển thị với đơn khứ hồi): Lộ trình đón trả ngựa quay trở về điểm xuất phát ban đầu.
  4. `post_trip` (Sau chuyến đi): Bàn giao ngựa & ký biên bản nghiệm thu (Flow 6), hoặc xử lý sự cố hủy/no-show/hoàn tiền.

### 2. Trạng thái Mốc và Trực quan hóa
- `done`: Chấm tròn đặc màu xanh lục `#287653`, đoạn nối phía dưới tô đầy màu đồng `#A67C2E`.
- `current`: Chấm tròn có vòng hào quang nhấp nháy (`motion-safe:animate-ping`), đoạn nối phía dưới tô dần theo tỉ lệ hoàn thành quãng đường (`progressPercent`), viền nổi bật và đánh dấu `aria-current="step"`.
- `upcoming`: Chấm rỗng, đoạn nối nét đứt (`border-dashed`), chữ xám dịu.
- `skipped`: Chấm xám, tiêu đề gạch ngang.
- `failed`: Chấm đỏ cảnh báo `#B33E3E` (áp dụng khi đơn no-show, hủy chuyến hoặc hoàn tiền).

### 3. Quy tắc Tính toán Trễ/Sớm và Định dạng Giờ
- `delayMinutes = actualAt - plannedAt` (tính theo phút) khi mốc đã diễn ra; hoặc `etaAt - plannedAt` đối với mốc đang xử lý (`current`).
- Hiển thị badge:
  - `Trễ X phút` (badge vàng nếu trễ $\le 60$ phút, badge đỏ nếu trễ $> 60$ phút).
  - `Sớm X phút` (badge xanh lục).
  - Định dạng hiển thị giờ: `HH:mm dd/MM` theo múi giờ `Asia/Ho_Chi_Minh`.

### 4. Phân Quyền và Ẩn Thông Tin (Privacy & SoD)
- **Customer viewer:** Ẩn danh tính nhân viên nội bộ (`actorLabel` bị redact), ẩn các trạm trung chuyển gom hàng nội bộ (`transfer_hub`) của đơn hàng khác. Sinh hiệu hiển thị dạng trung tính nếu chưa có kết quả lâm sàng chi tiết.
- **Manager viewer:** Hiển thị đầy đủ nhãn người cập nhật, nguồn tọa độ (GPS, Giả lập, Thủ công) kèm cờ cảnh báo `flagged` nếu điều phối can thiệp, cung cấp nút "Cập nhật thay Driver".
- **Driver viewer:** Trên mốc `current`, hiển thị slot hành động nhanh `renderCurrentActions` gồm các nút: Báo cáo mốc / Bắt đầu chuyến đi và Cập nhật Sinh hiệu Ngựa.
