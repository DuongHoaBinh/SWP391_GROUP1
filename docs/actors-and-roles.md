# Actors and Roles

> **Thay đổi sau review hội đồng (11/2026):** ba actor nội bộ Logistics Manager, Transport Specialist và Fleet & Route Coordinator được **gộp thành một actor duy nhất: Logistics Manager (hiển thị: "Quản lý vận hành")**. Mã role giữ nguyên `LOGISTICS_MANAGER`. Xem `docs/dinh-huong-phat-trien-sau-review.md` (Step 1).

| Actor | Main responsibilities | Allowed actions |
|---|---|---|
| **Logistics Manager** (Quản lý vận hành) | Owns operational approval, legal/quarantine readiness, route planning, fleet dispatch and performance oversight | Review/approve/reject orders; manage country/gate regulations and review horse documents; track authority approvals; request missing documents; set strategic framework, build route legs/stops, manage vehicles, stalls and road trips; assign staff; monitor trips and override check-ins; handle incidents and approve emergency route/extra-cost changes; resolve handover disputes; approve refunds; view revenue, cost and on-time reports |
| **Vehicle Driver / Escort** | Executes the assigned trip and observes horse welfare | View assigned trips/horses/stops; update milestones; add text/photo health logs; report incidents; record handover |
| **Customer** | Requests service and supplies horse information | Create own requests; upload own horse documents; pay; view own order/document/tracking status; confirm or dispute handover; receive notifications |
| **Admin** | Accounts, system configuration, refund execution | Provision internal accounts; system settings; execute manual refund transfers (SoD with the approving Manager) |

## Legacy roles

- `TRANSPORT_SPECIALIST` and `FLEET_ROUTE_COORDINATOR` are **deprecated**. The `role` rows stay in the database so existing foreign keys and history remain valid; migration `028_merge_internal_roles.sql` moves all their users to Logistics Manager.
- The backend normalizes any legacy role from a JWT or DB row to `LOGISTICS_MANAGER` (`normalizeUserRole` in `backend/src/modules/auth/auth.types.ts`). Notifications addressed to a legacy role are delivered to Logistics Managers.
- The frontend portals `/specialist/*` and `/coordinator/*` were merged into `/manager/*`. Old URLs redirect (`mapLegacyPortalPath` in `frontend/src/lib/auth-redirect.ts`):

| Old path | New path |
|---|---|
| `/specialist` | `/manager/compliance` |
| `/specialist/compliance-orders` | `/manager/compliance/orders` |
| `/specialist/documents`, `/approval`, `/missing`, `/regulations` | `/manager/compliance/...` (same name) |
| `/coordinator` | `/manager/dispatch` |
| `/coordinator/routes`, `/schedule` | `/manager/dispatch/routes`, `/manager/dispatch/schedule` |
| `/coordinator/vehicles` | `/manager/fleet/vehicles` |
| `/coordinator/monitoring`, `/alerts` | `/manager/monitoring`, `/manager/monitoring/alerts` |
| `/specialist|coordinator/notifications`, `/settings` | `/manager/notifications`, `/manager/settings` |

## Permission boundaries

- Public registration is available only for the `CUSTOMER` role.
- `ADMIN`, `LOGISTICS_MANAGER` and `DRIVER_ESCORT` accounts are provisioned by an administrator or deployment seed; they cannot register through the public API.
- Only the Logistics Manager (or Admin) can approve/reject a transport request, mark legal/document requirements as reviewed or incomplete, publish route legs, capacity assignments and planned schedules, and approve emergency cost changes.
- Drivers/escorts can update execution events and health logs only for assigned trips.
- Road-trip catalog and creation are restricted to Manager/Admin. Customer cannot inspect other owners' routes/full plans or shared-trip membership. Completion checks Driver/Escort assignment server-side, including on retries.
- Customers cannot edit an approved request or operational status; they can submit requested corrections/documents.

All authorization checks belong to `backend/src/modules/auth` and must be enforced server-side. The frontend route grouping is a usability boundary, not a security boundary.

### Payment and confirmation permissions

- Financial and route-confirmation APIs require verified JWTs; development `mock-jwt-token-*` strings are rejected.
- Customer can read their own invoice/payment and initiate payment only after route confirmation. Manager/Admin can inspect payment state; they cannot create a bank transfer on the customer's behalf.
- Driver/Escort can confirm only their own existing transport assignment after Manager approval. Admin may explicitly identify the assigned person.
- Customer/Admin can cancel an unapproved request (`requested` / `change_requested`). Approved/invoiced/paid requests require operational handling rather than the self-service cancellation endpoint. Approval and cancellation use conditional writes to prevent a cancelled request from becoming payable.

## Segregation of Duties (SoD)

- **Đã bỏ SoD vận hành "Coordinator dựng tuyến, Manager duyệt tuyến"**: sau khi gộp actor, cùng một Manager có thể dựng kế hoạch chi tiết, gửi duyệt và duyệt. Các bước (khung chiến lược → dựng chi tiết → gửi duyệt → duyệt) vẫn giữ nguyên trong luồng và vẫn được ghi audit (người thực hiện, thời điểm).
- **Giữ nguyên SoD tài chính**: Manager phê duyệt mức hoàn tiền; `ADMIN` (vai trò thực thi tài chính ở Release 1) thực hiện chuyển khoản và tải ủy nhiệm chi. Ràng buộc cứng **`transferred_by != approved_by`** (trùng người trả `403 Forbidden`); khoản hoàn `>= 20,000,000 VND` cần xác nhận kép (Dual-Approval).
- **Phân tách `driver` vs `escort` trong `DRIVER_ESCORT` (`DEC-07`)**: `driver` ưu tiên lái xe và check-in mốc đường bộ; `escort` ưu tiên hộ tống xuyên chặng (gồm chặng bay) và ghi nhật ký sức khỏe ngựa. Hai vai trò trên cùng chuyến được check-in chéo dự phòng nhưng **bắt buộc** lưu `updated_by_role`.
- **Hủy vận hành & `excused_delay`**: chỉ `LOGISTICS_MANAGER` hoặc `ADMIN` (cùng tác vụ tự động khi hết `grace_due_at`) được chuyển đơn sang `cancelled_operational` từ `approved`, `planning`, `confirmed`, `ready_to_depart`; cấm khi `in_transit` (`409 Conflict`). Chỉ Manager/Admin được xác nhận `excused_delay = true` kèm bằng chứng trong **48 giờ** sau `actual_arrival_date` (`DEC-02`).

## Ma trận RACI (sau khi gộp actor)

> Mỗi dòng có **duy nhất 1 `A`**. *(R = Responsible, A = Accountable, C = Consulted, I = Informed)*

| # | Nghiệp vụ | Customer | Manager | Admin / Finance | Driver/Escort |
|---|---|---|---|---|---|
| 1 | Tạo yêu cầu vận chuyển, chọn ngựa, bảo hiểm, loại booking | **R / A** | I | - | - |
| 2 | Sửa đơn (`change_requested`) / Tự hủy đơn trước duyệt | **R / A** | I | - | - |
| 3 | Duyệt / Từ chối / Yêu cầu sửa đơn & Báo giá cước (Flow 1) | I | **R / A** | - | - |
| 4 | Hủy vận hành & Phê duyệt mức hoàn/bảo lưu | I | **R / A** | I | - |
| 5 | Thực thi chuyển khoản hoàn tiền & Tải ủy nhiệm chi (SoD) | I | I | **R / A** | - |
| 6 | Quản trị danh mục quy định (quốc gia, cửa khẩu, mode, `lead_time_days`) | I | **R / A** | - | - |
| 7 | Cung cấp & tải lên hồ sơ định danh/y tế của từng ngựa | **R / A** | C *(tải hộ giấy cơ quan cấp)* | - | - |
| 8 | Thẩm định hồ sơ (`approved`/`rejected`/`expired`) & log cơ quan chức năng | I | **R / A** | - | - |
| 9 | Quản lý đội xe, stalls, master stops & khởi tạo `road_trip` | - | **R / A** | - | - |
| 10 | Lập khung chiến lược, dựng chặng/điểm dừng, nhập booking bay & duyệt kế hoạch | - | **R / A** | - | - |
| 11 | Phân công nhân sự & điều phối xác nhận nhận chuyến | I *(sau Confirmed)* | **R / A** | - | **R** *(Confirm/Decline)* |
| 12 | Thanh toán hóa đơn chính thức qua SePay | **R / A** | I | I | - |
| 13 | Cập nhật mốc hành trình (Flow 4) | I | **A** *(Giám sát/Override)* | - | **R** *(Check-in thực địa)* |
| 14 | Ghi nhận nhật ký sức khỏe, sinh hiệu ngựa (Flow 4) | I | I | - | **R / A** *(ưu tiên `escort`)* |
| 15 | Báo cáo doanh thu, chi phí, OTD & xác nhận `excused_delay` | - | **R / A** | C *(đối soát hoàn tiền)* | - |
| 16 | *(Optional — Flow 5)* Báo cáo sự cố, đề xuất & duyệt đổi lộ trình/chi phí | I | **R / A** | I | **R** *(Phát hiện/Báo)* |
| 17 | *(Optional — Flow 6)* Bàn giao tại điểm đích & ký xác nhận nghiệm thu | **R / A** *(Ký nhận/Tranh chấp)* | I | - | **R** *(Trình diện & Bàn giao)* |
| 18 | *(Optional — Flow 6)* Giải quyết tranh chấp bàn giao | C | **R / A** | C *(nếu bồi thường)* | C |
