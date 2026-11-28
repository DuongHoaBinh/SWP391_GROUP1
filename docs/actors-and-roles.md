# Actors and Roles

> **Thay đổi sau review hội đồng (11/2026):** ba actor nội bộ Logistics Manager, Transport Specialist và Fleet & Route Coordinator được **gộp thành một actor duy nhất: Logistics Manager (hiển thị: "Quản lý vận hành")**. Mã role giữ nguyên `LOGISTICS_MANAGER`. Xem `docs/dinh-huong-phat-trien-sau-review.md` (Step 1).

| Actor | Main responsibilities | Allowed actions |
|---|---|---|
| **Logistics Manager** (Quản lý vận hành) | Owns all operational workflows: approval, legal/quarantine readiness, route planning, fleet/staff management, refunds, tracking settings and performance oversight | Review/approve/reject/cancel orders; manage country/gate regulations and review horse documents; track authority approvals; request missing documents; build route legs/stops, manage vehicles, depots and stalls; provision operational staff (`Logistics Manager` & `Driver/Escort`); assign staff & confirm/decline on behalf; configure GPS/Geofence/Vitals/`simulationEnabled` settings; monitor trips and override check-ins; handle incidents and approve emergency route/extra-cost changes; resolve handover disputes; **single-step approve AND transfer refunds/claims** (after customer submits bank info); view revenue, cost and on-time reports |
| **Vehicle Driver / Escort** | Executes the assigned trip and observes horse welfare (`driver`: VN road legs; `escort`: air/sea, customs, overseas partner legs & vitals) | View assigned trips/horses/stops; update milestones within role scope (domestic cross-check-in backup allowed with `updated_by_role` audit; VN-only `driver` blocked from air/sea/overseas partner legs); add text/photo health logs; report incidents on active trips; record handover |
| **Customer** | Requests service, supplies horse information and submits beneficiary bank details for refunds | Create own requests; upload own horse documents; pay via SePay VietQR; submit beneficiary bank account for any `cash_refund` (`/customer/requests/:id/refund`); view own order/document/tracking status; confirm or dispute handover; submit insurance claims; receive notifications |
| **Admin** | Technical Superuser (DB/system fallback; not shown in operational UI) | Superuser fallback for all endpoints & seed/system administration; operational duties are fully owned by `Logistics Manager` |

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

## Segregation of Duties (SoD) & Quyền Vận hành Hợp nhất (Cập nhật 11/2026)

- **Gộp toàn bộ quyền vận hành về `Logistics Manager`:**
  - **Không áp dụng SoD vận hành / tài chính với Admin:** Một `Logistics Manager` có toàn quyền phê duyệt hoàn tiền/bồi thường (`pending_approval` → `approved_for_transfer`, **1 bước duyệt — không yêu cầu Dual-Approval**) **và** trực tiếp thực thi chuyển khoản + tải ủy nhiệm chi (`POST /orders/refunds/:refundId/transfer`).
  - **Bắt buộc Khách hàng cung cấp STK thụ hưởng (Cách 1):** Mọi khoản `cash_refund` (`amount > 0`) ở cả 4 luồng (`company_cannot_fulfil`, `insurance_claim`, `cancelled_operational`, `cancelReturnLeg`) đều yêu cầu Customer nộp form STK (`POST /orders/refunds/:refundId/bank-info` hoặc `POST /orders/:id/refund-form`) trước khi Manager có thể giải ngân (`409 Conflict` nếu chưa nộp).
  - **Cấu hình nhân sự & hệ thống:** `Logistics Manager` có quyền cấp tài khoản nhân sự (`roleId = 2` Logistics Manager, `roleId = 5` Driver / Escort; loại bỏ role cũ `3/4`), hủy đơn trước duyệt, xác nhận/từ chối hộ tài xế, và cấu hình đầy đủ GPS / Geofence / Vitals / `simulationEnabled` tại `PATCH /system-settings/tracking`. `ADMIN` chỉ còn vai trò Technical Superuser dự phòng trong DB.
- **Phân tách `driver` vs `escort` trong `DRIVER_ESCORT` (`DEC-07` + Option A):**
  - `driver` (Tài xế xe chuyên dụng VN) chỉ check-in mốc và gửi GPS trên các chặng đường bộ nội địa/VN (`vehicle_id IS NOT NULL`). Bị chặn (`403 Forbidden`) khi check-in/gửi GPS trên chặng `flight`, `sea`, chặng đường bộ đối tác nước ngoài (`vehicle_id IS NULL`), hoặc tạo biên bản bàn giao đích quốc tế (`flight`/`sea`).
  - `escort` (Bác sĩ thú y áp tải) phụ trách xuyên suốt chặng bay/biển, kiểm dịch, thông quan, bàn giao đối tác nước ngoài và nhật ký sinh hiệu ngựa.
  - Trên các chặng đường bộ nội địa, `driver` và `escort` trên cùng chuyến vẫn được phép check-in chéo dự phòng với khóa nguyên tử (`expectedStatuses` chống trùng log) và **bắt buộc** lưu `updated_by_role`.
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
| 19 | Xử lý claim bồi thường bảo hiểm (Step 6) | **R** *(Gửi claim & bằng chứng)* | **R / A** *(Thẩm định & duyệt claim)* | **R** *(SoD chuyển khoản bồi thường)* | - |
| 20 | Duyệt khả thi đơn trả trước (`PATCH /orders/:id/feasibility`) | I | **R / A** | - | - |
| 21 | Gửi thông tin tài khoản nhận hoàn tiền 100% (`/refund`) | **R / A** | I | I | - |
| 22 | Phê duyệt hoàn tiền do công ty không đáp ứng | I | **R / A** | C *(Dual-approval nếu ≥ 20tr)* | - |
| 23 | Thực thi chuyển khoản hoàn tiền 100% (SoD `transferred_by != approved_by`) | I | I | **R / A** | - |

## Bổ sung quyền Step 8 (Review 11/2026)

- **Logistics Manager / Admin**: Kiểm duyệt hồ sơ với danh mục 4 điểm (`microchipMatches`, `passportMatches`, `issueDateOk`, `expiryOk`), từ chối bắt buộc lý do (tối thiểu 10 ký tự); kích hoạt thủ công job quét hết hạn và cảnh báo (`POST /compliance/run-expiry-sweep`); quản trị quy định giấy tờ theo quốc gia, cửa khẩu, phương thức.
- **Customer**: Tự động nhận diện và tái sử dụng giấy tờ trong kho ngựa cá nhân theo `document_type_code`; chỉ tra cứu được danh mục yêu cầu giấy tờ đối với ngựa thuộc sở hữu của mình (`GET /compliance/requirements`, trả `403 Forbidden` nếu truy cập ngựa khác).

## Bổ sung quyền Step 9 (Review 11/2026)

- **Logistics Manager / Admin**: cấu hình giờ cấm xe tải nội đô và ngoại lệ ngày lễ (`/fleet/city-restrictions`), tham số nghỉ dọc đường (`PATCH /system-settings/journey-rules`), đổi xe đã giữ chỗ của đơn (bắt buộc lý do, `POST /fleet/shipments/:id/reservations/swap`).
- **Mọi user đã đăng nhập**: xem khung giờ được phép của một điểm (`GET /fleet/city-restrictions/check`) và tham số nghỉ.
- **Customer**: chọn phương án xe khi báo giá; xem phương án/xe đã giữ của **đơn của mình** (`GET /fleet/shipments/:id/reservations`, đơn khác trả `403`).

## Bổ sung quyền Step 10 & 11 (Review 11/2026)

- **Admin**: Độc quyền cấu hình hệ thống giám sát và bật/tắt chế độ giả lập GPS (`PATCH /system-settings/tracking`).
- **Driver / Escort**: Gửi vị trí GPS và check-in mốc thực địa kèm định vị (`POST /tracking/shipments/:id/pings`, `POST /tracking/shipments/:id/milestones/:type/check-in`). Bác sĩ thú y (Escort) ghi nhận nhật ký sinh hiệu ngựa.
- **Logistics Manager**: Giám sát toàn bộ chuyến đi trên bản đồ `live-overview`, ghi đè mốc hành trình hoặc sinh hiệu khi có sự cố.
- **Customer**: Xem live tracking và Timeline dọc tiến độ đơn hàng của mình (`GET /tracking/shipments/:id/timeline`), tự động che giấu thông tin nhân sự nội bộ và trạm kỹ thuật trung gian. Khách hàng khác truy cập bị từ chối `403 Forbidden`.

## Bổ sung quyền Step 12 (Review 11/2026)

- **Admin / Finance**: Thực thi giải ngân chuyển khoản tiền hoàn hoặc bồi thường bảo hiểm, tuân thủ nghiêm ngặt nguyên tắc Tách biệt nhiệm vụ SoD (`transferred_by != approved_by` và `transferred_by != second_approved_by`).
- **Tất cả các bên**: Dữ liệu demo và kịch bản thử nghiệm được khởi tạo chuẩn hóa qua `npm run seed:demo` để phục vụ đánh giá và bảo vệ đồ án.
