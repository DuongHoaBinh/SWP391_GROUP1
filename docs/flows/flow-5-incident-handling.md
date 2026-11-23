# Flow 5: Incident Handling and Emergency Route Change (Optional)

> **Cập nhật sau review 11/2026:** Transport Specialist và Fleet & Route Coordinator đã gộp vào **Logistics Manager** (xem `docs/actors-and-roles.md`). Trong tài liệu này, mọi chỗ ghi Specialist/Coordinator được hiểu là Logistics Manager; role `TRANSPORT_SPECIALIST`/`FLEET_ROUTE_COORDINATOR` chỉ còn để tương thích dữ liệu cũ.

## Actors

Vehicle Driver / Escort, Fleet & Route Coordinator, Logistics Manager, Customer (notification recipient)

## Main path

1. Driver/escort reports vehicle failure, prolonged traffic, weather, border congestion, or a horse medical incident.
2. Coordinator assesses severity, records immediate actions, and proposes a route or schedule change.
3. Logistics Manager approves or rejects the changed route and any additional cost.
4. Coordinator publishes the approved change and the system notifies affected staff and customers.
5. Responsible staff record resolution and close the incident with an outcome.

**Owner:** `backend/src/modules/incidents`

## Phạm vi Design-Ready (Release 2 Extension Specification — BA Spec v3.1)

> [!NOTE]
> Theo `DEC-01`, Flow 5 là luồng tùy chọn (**Release 2 — Design-Ready**). Ở Release 1, tài liệu khóa sẵn điểm nối kiến trúc (extension points) và các bất biến nghiệp vụ để đảm bảo không chặn Flow 1–4. Phân quyền tuân thủ Ma trận RACI dòng 17 tại [actors-and-roles.md](file:///f:/SWP/Project/SWP391_GROUP1/docs/actors-and-roles.md).

### 1. Điểm Kích hoạt (Extension Hooks từ Flow 4 & Flow 2)

- **Báo cáo Sự cố Thực địa (`incident_report`):** `vehicle_breakdown`, `traffic_delay`, `horse_medical`, `weather`, `border_issue`, `other` kèm mức độ `low` | `medium` | `high` | `critical`, vị trí và ảnh/video đính kèm (`attachment`).
- **Runtime Compliance Expiry (`BR-F2-06`):** Kích hoạt sự cố `border_issue` khi hồ sơ Tầng B hết hạn trong lúc đơn đang `in_transit` và bị khóa `customs_cleared`.
- **Cảnh báo Đỏ Sinh hiệu (`BR-F4-03`):** Tầng Đỏ trên nhật ký sức khỏe gợi ý mở sự cố `horse_medical` khẩn cấp.

### 2. Quy trình Phê duyệt 2 Bước & 3 Quy tắc Bất biến

1. **Đề xuất (`shipment_change_request`):** Coordinator tiếp nhận (`in_review`), lập đề xuất `change_type` (`route` | `cost` | `schedule` | `vehicle` | `other`) ghi rõ `old_value`, `new_value`, dự toán chi phí phát sinh và `reason`, trình Logistics Manager phê duyệt (`approved`/`rejected`) trước khi xuất bản.
2. **Bất biến 1 — Bảo toàn Lịch sử & Cảnh báo Cửa khẩu mới:** Thay đổi lộ trình khẩn cấp **không xóa/sửa** các chặng và mốc đã hoàn thành trước sự cố; chỉ cập nhật các chặng chưa chạy. Nếu đổi tuyến sang cửa khẩu hoặc quốc gia quá cảnh mới → bắt buộc phát cảnh báo cho Transport Specialist rà soát lại quy định Flow 2.
3. **Bất biến 2 — Tách Chi phí Phát sinh khỏi `shipment_invoice` Gốc:** Mọi chi phí phát sinh được duyệt phải hạch toán thành khoản mục riêng gắn `incident_id`/`change_id`, tuyệt đối không sửa đè `shipment_invoice` ban đầu (lỗi nội bộ → `Operating Cost`; cấp cứu thú y gói `premium` → `emergency_vet_covered`; yêu cầu thêm của khách → phụ lục riêng).
4. **Bất biến 3 — Lan truyền trên Chuyến Ghép (`Shared Trip Ripple Effect`):** Khi sự cố xảy ra trên `road_trip` có nhiều đơn `shared_stall`, hệ thống cập nhật ETA và thông báo riêng đến từng Customer bị ảnh hưởng trên xe đó nhưng vẫn giữ cô lập dữ liệu chéo (`Cross-Customer Redaction`).
