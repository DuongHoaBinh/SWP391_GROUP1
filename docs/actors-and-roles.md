# Actors and Roles

| Actor | Main responsibilities | Allowed actions |
|---|---|---|
| **Logistics Manager** | Owns operational approval and performance oversight | Review/approve/reject orders; create overall plans; assign staff; approve emergency route and extra-cost changes; view revenue, cost, and on-time reports |
| **Transport Specialist** | Owns legal, medical, quarantine, and customs readiness | Manage country/gate rules; create horse document sets; review completeness; track authority approvals; request missing documents from customers |
| **Fleet & Route Coordinator** | Owns capacity, route, schedule, and trip coordination | Manage vehicles, aircraft capacity, stalls, stops, routes, trip legs, assignments, schedule changes, and operational alerts |
| **Vehicle Driver / Escort** | Executes the assigned trip and observes horse welfare | View assigned trips/horses/stops; update milestones; add text/photo health logs; report incidents |
| **Customer** | Requests service and supplies horse information | Create own requests; upload own horse documents; view own order/document/tracking status; receive notifications |

## Permission boundaries

- Public registration is available only for the `CUSTOMER` role.
- `ADMIN`, `LOGISTICS_MANAGER`, `TRANSPORT_SPECIALIST`, `FLEET_ROUTE_COORDINATOR`, and `DRIVER_ESCORT` accounts are provisioned by an administrator or deployment seed; they cannot register through the public API.
- Only the Logistics Manager can approve/reject a transport request and approve emergency cost changes.
- Only the Transport Specialist can mark legal/document requirements as reviewed or incomplete.
- Only the Fleet & Route Coordinator can publish route legs, capacity assignments, and planned schedules.
- Drivers/escorts can update execution events and health logs only for assigned trips.
- Road-trip catalog and creation are restricted to Coordinator/Manager/Admin. Customer cannot inspect other owners' routes/full plans or shared-trip membership. Completion checks Driver/Escort assignment server-side, including on retries.
- Customers cannot edit an approved request or operational status; they can submit requested corrections/documents.

All authorization checks belong to `backend/src/modules/auth` and must be enforced server-side. The frontend route grouping is a usability boundary, not a security boundary.


### Payment and confirmation permissions

- Financial and route-confirmation APIs require verified JWTs; development `mock-jwt-token-*` strings are rejected.
- Customer can read their own invoice/payment and initiate payment only after route confirmation. Manager/Admin can inspect payment state; they cannot create a bank transfer on the customer's behalf.
- Driver/Escort can confirm only their own existing transport assignment after Manager approval. Admin may explicitly identify the assigned person.
- Customer/Admin can cancel an unapproved request (`requested` / `change_requested`). Approved/invoiced/paid requests require operational handling rather than the self-service cancellation endpoint. Approval and cancellation use conditional writes to prevent a cancelled request from becoming payable.

## Segregation of Duties (SoD), Operational Authority & Role Split (BA Spec v3.1)

- **Vai trò Thực thi Tài chính (`ADMIN` ở Release 1 / tách `FINANCE` ở Release 2):** Ngoài cấp phát tài khoản nội bộ, chịu trách nhiệm thực thi chuyển khoản hoàn tiền thủ công và tải chứng từ ủy nhiệm chi sau khi `LOGISTICS_MANAGER` đã phê duyệt mức hoàn. Áp dụng ràng buộc cứng **`transferred_by != approved_by`** (trùng người trả `403 Forbidden`); các khoản hoàn `>= 20,000,000 VND` yêu cầu xác nhận kép (Dual-Approval).
- **Phân tách `driver` vs `escort` trong `DRIVER_ESCORT` (`DEC-07` — Approved):** Ở cấp phân công (`role_in_shipment`), `driver` ưu tiên lái xe và check-in mốc đường bộ; `escort` ưu tiên hộ tống xuyên chặng (bao gồm chặng bay quốc tế) và ghi nhận nhật ký sức khỏe ngựa. Hai vai trò cùng được phân công trên chuyến phép check-in chéo dự phòng nhưng **bắt buộc** lưu `updated_by_role` vào lịch sử hành trình.
- **Thẩm quyền Hủy Vận hành & Xác nhận `excused_delay`:**
  - Duy nhất `LOGISTICS_MANAGER` hoặc `ADMIN` (cùng tác vụ tự động khi hết `grace_due_at`) được chuyển đơn sang `cancelled_operational` từ `approved`, `planning`, `confirmed`, `ready_to_depart`; cấm tuyệt đối khi đơn đang `in_transit` (`409 Conflict`). *(Trạng thái `DEC-04`: Ready for Finance/Legal Sign-off)*.
  - Duy nhất `LOGISTICS_MANAGER` hoặc `ADMIN` được xác nhận `excused_delay = true` kèm bằng chứng trong vòng **48 giờ** sau `actual_arrival_date` (`DEC-02`).

## Ma trận RACI Chuẩn hóa (Single Source of Truth — BA Spec v3.1)

> [!IMPORTANT]
> Mỗi dòng nghiệp vụ (19/19) có **duy nhất 1 `A` (Accountable)**. Các tài liệu flow trong `docs/flows/` tham chiếu trực tiếp bảng này.
> *(R = Responsible, A = Accountable, C = Consulted, I = Informed)*

| # | Nghiệp vụ / Hoạt động cốt lõi | Customer | Manager | Admin / Finance | Specialist | Coordinator | Driver/Escort |
|---|---|---|---|---|---|---|---|
| 1 | Tạo yêu cầu vận chuyển, chọn ngựa, bảo hiểm, loại booking | **R / A** | I | - | - | - | - |
| 2 | Sửa đơn (`change_requested`) / Tự hủy đơn trước duyệt | **R / A** | I | - | - | - | - |
| 3 | Duyệt / Từ chối / Yêu cầu sửa đơn & Báo giá cước (Flow 1) | I | **R / A** | - | I | I | - |
| 4 | Hủy vận hành (`cancelled_operational`) & Phê duyệt mức hoàn/bảo lưu *(Target Spec v3.1)* | I | **R / A** | I | C | C | - |
| 5 | Thực thi chuyển khoản hoàn tiền thủ công & Tải ủy nhiệm chi (`SoD`) *(Target Spec v3.1)* | I | I | **R / A** | - | - | - |
| 6 | Quản trị danh mục quy định (quốc gia, cửa khẩu, mode, `lead_time_days`) | I | C | - | **R / A** | - | - |
| 7 | Cung cấp & Tải lên hồ sơ định danh/y tế gốc của từng ngựa | **R / A** | - | - | C *(tải hộ giấy CQ cấp)* | - | - |
| 8 | Thẩm định hồ sơ (`approved`/`rejected`/`expired`) & Log cơ quan chức năng | I | I | - | **R / A** | I | - |
| 9 | Quản lý đội xe, stalls, master stops & Khởi tạo `road_trip` | - | C | - | - | **R / A** | - |
| 10 | Lập khung chiến lược (Bước 1a) & Duyệt kế hoạch chi tiết (Bước 2) | - | **R / A** | - | - | C | - |
| 11 | Dựng chi tiết chặng, điểm dừng, ghép xe & Nhập booking bay (Bước 1b) | - | **A** | - | - | **R** | - |
| 12 | Phân công nhân sự & Điều phối xác nhận nhận chuyến (Bước 3) | I *(sau Confirmed)* | **A** | - | C | **R** | **R** *(Confirm/Decline)* |
| 13 | Thanh toán hóa đơn chính thức qua SePay (Gate 1) | **R / A** | I | I | - | I | - |
| 14 | Cập nhật mốc hành trình & Đảm bảo tính chính xác tiến độ tuyến (Flow 4) | I | I | - | - | **A** *(Giám sát/Override)* | **R** *(Check-in thực địa)* |
| 15 | Quan sát & Ghi nhận nhật ký sức khỏe, sinh hiệu ngựa (Flow 4) | I | I | - | - | I | **R / A** *(Ưu tiên `escort`)* |
| 16 | Báo cáo Doanh thu, Chi phí vận hành, OTD & Xác nhận `excused_delay` | - | **R / A** | C *(đối soát hoàn tiền)* | - | C *(nhập chi phí thực tế)* | - |
| 17 | *(Optional — Flow 5)* Báo cáo sự cố, đề xuất & Duyệt đổi lộ trình/chi phí | I | **A** | I | C *(nếu đổi cửa khẩu)* | **R** *(Đề xuất/Xuất bản)* | **R** *(Phát hiện/Báo)* |
| 18 | *(Optional — Flow 6)* Bàn giao tại điểm đích & Ký xác nhận nghiệm thu | **R / A** *(Ký nhận/Tranh chấp)* | I | - | - | I | **R** *(Trình diện & Bàn giao)* |
| 19 | *(Optional — Flow 6)* Giải quyết tranh chấp bàn giao (`disputed`) & Đóng hồ sơ | C | **R / A** | C *(nếu bồi thường)* | C | I | C |
