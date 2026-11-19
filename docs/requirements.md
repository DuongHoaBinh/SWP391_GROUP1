# Requirements

## System

**Cross-Border Racehorse Transport System** manages domestic and international racehorse transportation from the initial service request through route execution, customs/quarantine milestones, and safe handover.

The system must preserve an auditable history of approvals, documents, route changes, costs, trip events, horse health observations, and notifications.

## Actors and scope

### Logistics Manager

- Receive and approve domestic and international transport orders.
- Create the overall transport plan, including vehicle, airline, route, and transfer points.
- Assign work to the Transport Specialist, Fleet & Route Coordinator, and Driver / Escort.
- Approve route changes and additional costs during emergencies.
- View revenue, operating cost, and on-time delivery performance reports.

### Transport Specialist

- Maintain medical, quarantine, and customs rules by country and border gate.
- Create and store a digital transport file for each horse, including vaccination certificates, horse passports, and import/export permits.
- Track approval progress with agricultural authorities, customs, and quarantine agencies.
- Notify customers about missing documents and submission deadlines.

### Fleet & Route Coordinator

- Manage specialized vehicles, aircraft cargo capacity, and horse stalls.
- Build routes with rest stops, quarantine stations, fuel stations, transfer points, and border gates.
- Update trip progress by leg: departed, arrived at stop, customs cleared, and delivered.
- Adjust schedules and issue alerts for traffic, weather, or border congestion.

### Vehicle Driver / Escort

- View assigned schedules, horses, and rest stops.
- Submit milestone updates during the trip.
- Record horse health observations in text and images.
- Report vehicle, traffic, and horse medical emergencies to the operations center.

### Customer (club / horse owner)

- Create a transport request with origin, destination, dates, number of horses, and special requirements.
- Upload horse identity and medical documents.
- Track trip location and leg status.
- Receive notifications when customs is completed or the horse reaches the safe handover location.

## Mandatory flows

1. **Flow 1 - Create and approve transport request:** customer submission, manager review, approval/rejection, and assignment preparation.
2. **Flow 2 - Legal, quarantine, and customs documents:** rules by country/gate, horse document sets, review status, missing-document notifications, and authority approval tracking.
3. **Flow 3 - Route planning and fleet coordination:** vehicle/airline/stall selection, route legs and stops, staff assignment, schedule, and operational readiness.
4. **Flow 4 - Status updates and route log:** driver/coordinator milestone updates, live/current status, route event history, and customer notifications.

## Optional flows

5. **Flow 5 - Incident handling and emergency route changes:** incident reporting, escalation, revised route/cost approval, and resolution history.
6. **Flow 6 - Handover and trip acceptance:** receiving confirmation, horse/document checklist, evidence, and trip closure.

## Core business rules

- A transport order cannot be scheduled until it is approved and has passed the required document checks.
- A trip must have an assigned route, transport capacity, and responsible staff before departure.
- Every status, document review, route change, cost approval, and incident update must record actor, timestamp, and reason where applicable.
- Customers can access only their own horses, orders, documents, notifications, and tracking information.
- Operational staff permissions are separated by responsibility; server-side authorization is mandatory.
- Flow 5 and Flow 6 are optional features and must not block the four mandatory flows.
- Horse reservation lifecycle: creating an order atomically sets selected `active` horses to `horse.status = 'in_transit'`, meaning the horse is currently held/reserved by a non-terminal order (`requested` through `in_transit`); horses return to `'active'` when removed in `change_requested` or when the order ends (`cancelled`, `rejected`, `cancelled_operational`, `completed`), and `'delivered'` is not used.

## Working rule

Each flow owns its business rules and API contract. Cross-flow changes must be recorded in the relevant flow document and database design before implementation.


## Equine value and transport insurance

- Each selected shipment horse records its declared value and a package: `basic` (default), `standard` or `premium`. A row's value and premium are **per horse**; the selected quantity multiplies the row premium.
- Basic has zero added premium and a transport compensation cap of 50,000,000 VND per horse. Standard costs 1.5% of declared value and has an 80% compensation limit for loss/permanent injury. Premium costs 3% and covers 100% of declared value plus actual emergency veterinary expenses during transport.
- VND is always supported. USD declarations require a configured `INSURANCE_USD_TO_VND`; the server snapshots this rate and the resulting VND valuation at declaration time. No browser-provided rate or fee is trusted.
- The Manager quotes **base transport freight**, separately from insurance. Once quoted, `totalCost = transportCost + insuranceFee`. Before a quote exists, base freight is pending and the API keeps `totalCost = 0`, returning the known insurance premium separately.
- Insurance values, premiums, compensation limits and the policy version belong to the shipment horse, not the reusable My Horses profile. Changing a later request never modifies a prior trip's policy.

## Shared stall and dedicated charter booking

- Customer chooses `shared_stall` (default) or `dedicated_charter`, independently of domestic/international scope and road/air mode. Recommend shared for 1–2 horses and dedicated for 3+ or special-care horses, but neither threshold restricts the choice.
- Shared purchases one slot per horse on a fixed corridor; freight equals the Manager's unit stall price multiplied by the total selected horse quantity. Dedicated purchases a private vehicle/charter service with one flat freight price for the entire group, flexible requested departure and priority for direct routing.
- The Manager sees the customer's choice before quoting. The backend computes freight, then adds the saved aggregate insurance once. Quotes, invoices and bank amounts use the same combined total.
- Customer can change the choice only in `change_requested`; preserve the old choice in an append-only booking revision and clear the old quote for Manager review. Approval validates the quoted booking/count against the locked order.
- Coordinator uses the selected service when arranging shared capacity on compatible corridors or a private trip. Actual flight/stall booking remains operational work as in Flow 3; this requirement does not introduce airline reservation integration or automatic cross-customer trip matching.
- Approved road scope: manual shared-trip selection, one stall per horse, aggregate capacity checked under vehicle locks, dedicated vehicle exclusivity during the booked interval, and customer data isolation. Coordinator assesses compatibility; no automatic route/time tolerance is imposed. Operational air sharing/chartering remains an open decision.
- New Manager approvals require explicit positive base freight. Omitted amendment fields preserve existing policy and quantity. MoMo sandbox never supplies real payment status or operational readiness.

## BA Specification v3.1 — Scope, Control Gates, Reporting & NFRs

> [!NOTE]
> Phần này đồng bộ Senior BA Specification v3.1 vào tài liệu yêu cầu chính thức. Các mục liên quan đến bảng/cột CSDL chưa có migration thực tế trong `database/migrations/` được đánh dấu là **`Target Spec v3.1 (Planned)`**.

### 1. Phân tầng Phạm vi Phát hành (`DEC-01`)

- **Release 1 — Core Required Scope (Ưu tiên cao nhất):** Flow 1, Flow 2 (+ **G2**: Compliance đa chiều theo cửa khẩu, phương thức, `lead_time_days` động & duyệt Tầng 2), Flow 3, Flow 4, Hai Cổng kiểm soát (Gate 1 & Gate 2), Luồng `cancelled_operational` / `payment_overdue` / `shipment_refund_record`, và **Báo cáo KPI & Đối soát Tài chính thực cho Manager (G1)**.
- **Release 2 — Optional Extension Scope (Design-Ready):** Flow 5 (Xử lý sự cố & phê duyệt thay đổi khẩn cấp) và Flow 6 (Bàn giao & nghiệm thu chuyến đi). Các luồng tùy chọn phải cách ly hoàn toàn, không làm chậm hoặc chặn Flow 1–4.

### 2. Quy ước Mã lỗi HTTP chuẩn (API Contract Baseline)

- `400 Bad Request`: Sai định dạng đầu vào, thiếu trường bắt buộc, giá trị âm/0 không hợp lệ.
- `403 Forbidden`: Vi phạm phân quyền RBAC, truy cập tài nguyên ngoài phạm vi sở hữu/phân công, hoặc vi phạm tách nhiệm vụ SoD (`transferred_by == approved_by`).
- `409 Conflict`: Xung đột trạng thái, race condition (Duyệt vs Hủy), stale view khi duyệt, overbooking/trùng lịch xe, gia hạn quá số lần cho phép, hoặc thao tác bị cấm ở trạng thái hiện tại (ví dụ hủy vận hành khi đang `in_transit`).
- `422 Unprocessable Entity`: Chưa đạt điều kiện cổng nghiệp vụ (Gate 1 chưa mở thanh toán, Gate 2 thiếu hồ sơ/thanh toán, hoặc khóa `customs_cleared` do hết hạn hồ sơ khi đang `in_transit`).

### 3. Hai Cổng Kiểm soát & Runtime Compliance

- **Gate 1 — Payment Unlock Gate:** Chỉ mở cổng tạo/xem QR SePay khi kế hoạch lộ trình mới nhất đạt `confirmed` (Manager đã duyệt, toàn bộ Driver/Escort xác nhận, đủ xe/chuyến bay/giờ và có cước dương) **VÀ** đã phát hành duy nhất 1 `shipment_invoice` (snapshot bất biến). Duyệt Flow 1 chỉ khóa và trả payload báo giá (JSON) để frontend in/lưu PDF phía client (không có endpoint xuất PDF phía backend); hoàn tất Flow 2 cũng không tự mở thanh toán.
- **Gate 2 — 3-Way Departure Convergence Gate (`ready_to_depart`):** Bắt buộc đồng thời:
  1. `route.plan_status = confirmed` (Flow 3 hoàn tất, sức chứa và lịch xe hợp lệ).
  2. `isFullyCompliant = true` (100% ngựa đủ Tầng A + Tầng B còn hiệu lực đến ít nhất `expected_arrival_datetime + safety_buffer` và đạt duyệt Tầng 2 nếu quy định yêu cầu).
  3. `shipment_sepay_payment.status = succeeded` khớp chính xác `shipment_invoice.amount` (MoMo sandbox tuyệt đối không được tính).
- **Trước giờ xuất phát:** Biến động thanh toán hoặc hết hạn hồ sơ tự động đánh giá lại Gate 2; hết hạn hồ sơ kéo trạng thái từ `ready_to_depart` về `confirmed` dù khách đã thanh toán.
- **Khi đang `in_transit` (Runtime Expiry — `BR-F2-06`):** Tuyệt đối không rollback `shipment.status` về `confirmed`; gắn cờ `in_transit_compliance_alert = true`, phát **Red Alert** tới Specialist/Coordinator/Manager và chặn check-in `customs_cleared` (`422`) tại cửa khẩu tiếp theo cho tới khi có hồ sơ gia hạn được duyệt hoặc xử lý sự cố `border_issue` (Flow 5).

### 4. Báo cáo KPI & Đối soát Tài chính Quản lý (`DEC-02` / `G1` — `Target Spec v3.1 (Planned)`)

Toàn bộ KPI của Logistics Manager phải tính trực tiếp từ dữ liệu thực trong MySQL (cấm hardcode hằng số):

- **`quotedActiveRevenue`:** `SUM(shipment.total_cost)` với `status IN ('ready_to_depart', 'in_transit', 'completed')`, tách riêng `transport_cost` và `insurance_fee`.
- **`retainedCancellationRevenue`:** Tổng phần cước giữ lại trên các đơn `cancelled_operational` đã quyết toán hoàn tiền: `SUM(sepay.succeeded_amount - refund.transferred_amount - refund.credit_amount - verified_disbursement_offset)`.
- **`creditLiabilityBalance`:** `SUM(shipment_refund_record.amount)` ở trạng thái `converted_to_credit` (bảo lưu còn hạn 30 ngày) — hạch toán là công nợ/doanh thu nhận trước, không tính vào thực thu thuần.
- **`netRealizedCashRevenue`:** `SUM(shipment_sepay_payment.amount WHERE status = 'succeeded') - SUM(refund.amount WHERE status = 'transferred') - creditLiabilityBalance`.
- **`operatingCost` & Lợi nhuận gộp:** `SUM(shipment_operating_cost.amount)` theo hạng mục (`fuel`, `toll_border`, `airline_freight`, `quarantine_fee`, `staff_allowance`, `incident_absorbed`, `disbursement_absorbed_on_company_fault`); `grossProfit = (quotedActiveRevenue + retainedCancellationRevenue) - operatingCost`.
- **On-Time Delivery (OTD %):**
  - *Gross OTD:* `COUNT(completed WHERE actual_arrival_date <= expected_arrival_date + tolerance) / COUNT(completed)` với dung sai **`≤ 60 phút`** (đường bộ nội địa) và **`≤ 120 phút`** (quốc tế & hàng không).
  - *Adjusted OTD:* Loại trừ chuyến có `excused_delay = true`. Duy nhất **`LOGISTICS_MANAGER`** (hoặc `ADMIN`) được xác nhận `excused_delay` kèm bằng chứng trong tối đa **48 giờ** sau `actual_arrival_date`; quá 48 giờ trạng thái OTD bị khóa bất biến (`409 Conflict`).
- **Quarantine First-Pass Rate (%):** `COUNT(documents approved chưa từng bị rejected/expired) / COUNT(required documents) * 100%`.

### 5. Yêu cầu Phi Chức Năng Định lượng (Quantitative NFRs)

| Hạng mục | Chỉ tiêu Định lượng (Target SLA) | Cơ chế đảm bảo |
|---|---|---|
| **Hiệu năng** | P95 `<= 300ms` (API đọc); P95 `<= 800ms` (locking, checklist, tạo đơn); Upload `<= 10MB` hoàn tất `<= 3s`. | Index MySQL tối ưu, connection pooling. |
| **Tải đồng thời** | Tối thiểu **50 chuyến `in_transit` đồng thời** & **200 concurrent users** không deadlock, không overbooking. | Khóa `vehicle_id ASC`, ACID transaction, idempotency key. |
| **Sẵn sàng & Khôi phục** | Uptime **>= 99.5%** (24/7); **RPO <= 15 phút**; **RTO <= 1 giờ**. | MySQL backup + binlog; `/health` probe. |
| **Bảo mật & Tệp tin** | bcrypt/argon2; JWT secret >= 32 ký tự + kiểm tra `active`; SoD `transferred_by != approved_by`; Ảnh `<= 5MB` (tối đa 5 ảnh/log), PDF/hồ sơ `<= 10MB`. | Magic-bytes validation, Authenticated Streaming (`CSP` sandbox), PDF HTML escaping, TLS 1.2+. |
| **Múi giờ** | 100% timestamp lưu DB chuẩn **UTC (ISO-8601)**; UI & PDF luôn hiển thị rõ mã múi giờ địa phương (`UTC+7`, `UTC+8`...). | Tránh lệch giờ Cut-off sân bay & hạn kiểm dịch xuyên quốc gia. |

### 6. Bảng Tổng hợp Quyết định Nghiệp vụ (`DEC-01` → `DEC-08`)

| Mã | Chủ đề | Quyết định Tóm tắt | Trạng thái Governance |
|---|---|---|---|
| **DEC-01** | Phạm vi ưu tiên Release 1 | Ưu tiên **G1** & **G2** ở Release 1; giữ **Flow 5 & 6** ở mức Design-Ready cho Release 2. | **Approved** |
| **DEC-02** | Ngưỡng OTD, `excused_delay`, Chi phí & Đối soát | Dung sai `<= 60p` đường bộ / `<= 120p` quốc tế & hàng không; Manager xác nhận `excused_delay` trong 48h; bổ sung `retainedCancellationRevenue` & `creditLiabilityBalance`. | **Approved** |
| **DEC-03** | Compliance Đa chiều & Lead Time Động | Mở rộng `regulation` (`border_gate`, `transport_mode`, `doc_tier`, `lead_time_days`, `requires_authority_approval`, `min_validity_buffer_hours`); Tầng B cấp từ `D-1`; Runtime Expiry không rollback mà chặn `customs_cleared`. | **Approved** |
| **DEC-04** | Hủy Vận hành, Hoàn tiền Thủ công, Ứng trước & SoD | `cancelled_operational` (cấm khi `in_transit`), ma trận hoàn cước & khấu trừ biên lai ứng trước `shipment_disbursement`, chuyển khoản thủ công qua `shipment_refund_record` có SoD (`transferred_by != approved_by`), nâng cấp `D-3` qua `void`/`supplemental_invoice`. | **Ready for Finance/Legal Sign-off** |
| **DEC-05** | Driver/Backup SLA, Hard Cap `T-52h` & Thanh toán Động | Driver chính `4h làm việc / tối đa 12h`; Backup `4h đồng hồ` (Hard Cap `T-52h`); `payment_due_at = MIN(issued+24h, T-30h)`; gia hạn 1 lần `MIN(grant+10h, T-24h)`; tự hủy khi hết gia hạn. | **Approved** |
| **DEC-06** | Ngưỡng Sinh hiệu 3 Tầng (`equine_vital_config`) | Phân hoạch toán học kín thân nhiệt `t` & nhịp tim `hr`; tách `escalatable_amber` vs `observational_amber`; Red Alert khi `>= 2` mốc `escalatable_amber` liên tiếp trong `<= 6h` trên cùng ngựa. | **Structurally Approved — Pending Vet Calibration** |
| **DEC-07** | Phân tách `driver` vs `escort` | Đường bộ ưu tiên `driver`, chặng bay & sức khỏe ưu tiên `escort`; cho check-in chéo dự phòng nhưng bắt buộc lưu `updated_by_role`. | **Approved** |
| **DEC-08** | Vận hành Đường hàng không | Release 1 giữ quản lý chặng bay qua `airline_id`, `flight_number`, `booking_reference`, `stalls_booked` nhập thủ công. | **Approved** |
