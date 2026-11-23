# Requirements

> **Cập nhật sau review 11/2026:** Transport Specialist và Fleet & Route Coordinator đã gộp vào **Logistics Manager** (xem `docs/actors-and-roles.md`). Trong tài liệu này, mọi chỗ ghi Specialist/Coordinator được hiểu là Logistics Manager; role `TRANSPORT_SPECIALIST`/`FLEET_ROUTE_COORDINATOR` chỉ còn để tương thích dữ liệu cũ.

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
| **DEC-09** | Báo giá tự động, Định mức khoảng cách & Đường thủy (Step 4) | Tính giá tự động theo bậc khoảng cách (tiered km), bảng giá có version (`pricing_tariff`), khóa giá 30m trong `pricing_snapshot`; cấm Manager ghi đè khi có `quote_id`; hỗ trợ đường thủy 2 dạng (`ferry` <= 12h, `vessel` kết nối cảng <= 400km kèm cảnh báo sức khỏe). | **Approved** |

### 7. Báo giá tự động, Định mức khoảng cách & Đường thủy (`DEC-09` — Step 4)

1. **Báo giá tự động theo Bảng giá có phiên bản:**
   - Hệ thống cho phép khách hàng nhận báo giá chính thức ngay khi nhập điểm đón, điểm giao, ngày khởi hành và chọn ngựa.
   - Bảng giá cước (`pricing_tariff`) được phiên bản hóa, tách theo từng phương thức (`road`, `air`, `sea`).
   - Báo giá có hiệu lực trong 30 phút (`expires_at`), ghi nhận snapshot đầy đủ phương án xe và chi tiết bảo hiểm.
   - Khi tạo đơn kèm `quote_id`, giá cước được khóa bất biến. Manager không thể ghi đè thủ công khi phê duyệt.

2. **Dịch vụ Tính khoảng cách (`DistanceService`):**
   - Kết nối ORS (OpenRouteService) với thời gian chờ 5s và bộ đệm 24h (tối đa 5.000 điểm).
   - Tự động fallback sang công thức Haversine nhân hệ số uốn lượn 1.25 khi ORS timeout hoặc lỗi kết nối.

3. **Vận tải Đường thủy Đa phương thức:**
   - Hỗ trợ `ferry` (xe tải lên phà, giới hạn thời gian trên biển `<= 12` giờ).
   - Hỗ trợ `vessel` (ô chuồng cố định trên tàu biển chuyên dụng, khoảng cách đường bộ ra vào cảng `<= 400` km mỗi chặng).
   - Hiển thị khuyến cáo an toàn sinh học và sức khỏe cho ngựa đua khi chọn tàu biển chuyên dụng.


## 9. Yêu cầu Vận chuyển Khứ hồi và Chính sách No-Show (Step 5 — Review 11/2026)

- **Hỗ trợ đơn vận chuyển khứ hồi:** Cho phép khách hàng chọn hình thức "Khứ hồi" (`trip_type = 'round_trip'`) khi tạo đơn. Hệ thống tự động tính toán chặng về đảo chiều với chiết khấu **-10%** cước vận chuyển và **-10%** phí bảo hiểm.
- **Cam kết chính sách bắt buộc:** Khách hàng phải xác nhận đồng ý chính sách hủy chặng về và thời gian chờ no-show (`acceptReturnPolicy = true`) trước khi gửi đơn.
- **Thời gian chờ và xử lý No-show:**
  - Tài xế chặng về phải chờ tối thiểu 120 phút tại điểm đón chặng về.
  - Sau thời gian chờ quy định, nếu khách hàng không giao ngựa, tài xế chụp ảnh làm bằng chứng và thực hiện báo cáo no-show trên ứng dụng (`POST /tracking/shipments/:id/return/no-show`).
  - Hệ thống đóng chuyến đi với trạng thái hoàn thành (`completed`), ghi nhận `return_no_show = true`, không phát sinh hoàn tiền cước chặng về cho khách hàng.
- **Quy định hủy và đổi ngày chặng về:**
  - Hủy trước ≥ 168 giờ: hoàn 80% cước chặng về.
  - Hủy từ 72h đến 168h: hoàn 50% cước chặng về.
  - Hủy dưới 72h: hoàn 0% cước chặng về.
  - Công ty chủ động hủy: hoàn 100% cước và bảo hiểm chặng về.
  - Đổi ngày đón chặng về trước ≥ 168 giờ: miễn phí. Đổi dưới 168 giờ: phụ thu 10% cước chặng về.


## 10. Chính sách Bảo hiểm v2 và Bồi thường theo Mức độ Sự cố M1–M4 (Step 6 — Review 11/2026)

- **3 Gói Bảo hiểm Chuẩn hóa theo % và Mức tối thiểu (C4.2):**
  - **Cơ bản (`basic`):** Phí 0 VNĐ, đã bao gồm trong cước. Bồi thường M1: chi phí thú y thực tế ≤ 5.000.000 VNĐ; M2: chi phí thú y thực tế ≤ 10.000.000 VNĐ; M3: 20% giá trị khai báo (tối đa 50.000.000 VNĐ); M4: 100% giá trị khai báo (tối đa 50.000.000 VNĐ). Không hỗ trợ thú y khẩn cấp trên đường.
  - **Tiêu chuẩn (`standard`):** Phí 1,5% giá trị khai báo, mức tối thiểu 1.000.000 VNĐ. Bồi thường M1: chi phí thú y thực tế ≤ 1% giá trị khai báo; M2: 15% giá trị; M3: 50% giá trị; M4: 80% giá trị. Thú y khẩn cấp trên đường tối đa 20.000.000 VNĐ.
  - **Toàn diện (`premium`):** Phí 3,0% giá trị khai báo, mức tối thiểu 2.000.000 VNĐ. Bồi thường M1: chi phí thú y thực tế ≤ 2% giá trị khai báo; M2: 30% giá trị; M3: 80% giá trị; M4: 100% giá trị. Thú y khẩn cấp trên đường: toàn bộ chi phí thực tế.
- **Phân loại Mức độ Sự cố M1–M4:**
  - **M1 (Nhẹ):** Trầy xước, mất nước, căng thẳng nhẹ; hồi phục < 7 ngày; không ảnh hưởng thi đấu. Bằng chứng: ảnh chụp bàn giao và nhật ký sinh hiệu.
  - **M2 (Trung bình):** Chấn thương/bệnh cần điều trị 7–30 ngày; tạm nghỉ thi đấu. Bằng chứng: giấy khám thú y và hóa đơn điều trị.
  - **M3 (Nặng / Loss of Use):** Điều trị > 30 ngày hoặc mất khả năng thi đấu vĩnh viễn. Bằng chứng: kết luận bác sĩ thú y độc lập.
  - **M4 (Tử vong / An tử):** Tử vong hoặc an tử nhân đạo theo chỉ định thú y trong lúc vận chuyển hoặc trong vòng 72 giờ sau bàn giao. Bằng chứng: biên bản hiện trường và kết luận giám định thú y.
- **Quy trình Quản lý Yêu cầu Bồi thường (Claims):**
  - Khách hàng nộp yêu cầu trong vòng 72 giờ sau khi hoàn tất bàn giao ngựa (riêng M4 được nộp ngay trong lúc vận chuyển).
  - Hệ thống tự động tính toán số tiền gợi ý (`suggested_amount`) theo quy tắc cấu hình trong cơ sở dữ liệu (`insurance_payout_rule`).
  - Quản lý vận tải (Logistics Manager) thẩm định hồ sơ: duyệt trong hạn mức quy định (nếu khác số tiền gợi ý bắt buộc có lý do) hoặc từ chối (bắt buộc chọn mã lý do hợp lệ).
  - Khi phê duyệt, hệ thống tự động khởi tạo hồ sơ hoàn tiền (`shipment_refund_record`) với phân loại `insurance_claim`.
  - Khoản bồi thường ≥ 20.000.000 VNĐ bắt buộc trải qua cơ chế phê duyệt kép (Dual-Approval) và lệnh giải ngân chuyển khoản do System Administrator thực hiện (tuân thủ nguyên tắc Tách biệt Trách nhiệm - SoD).

## 11. Phân bổ nhiều xe, trạm gần nhất, giờ cấm xe tải đô thị, ETA có nghỉ (Step 9 — Review 11/2026)

- **FR-S9-01**: Báo giá trả tối đa 3 phương án xe (Rẻ nhất · Ít xe nhất · Đến sớm nhất), có phương án chia nhiều ngày hoặc ghép xe 2 trạm khi thiếu xe; mỗi phương án có giá riêng. Không có phương án → gợi ý 3 ngày gần nhất có đủ xe (tìm trong 14 ngày).
- **FR-S9-02**: Xe được giữ chỗ khi tạo đơn, khóa theo `vehicle_id ASC`; hai khách không thể giữ cùng một xe trong khung giờ trùng nhau (`409`). Xe được nhả khi đơn hủy / hết hạn thanh toán / không đáp ứng / hoàn tiền / hủy vận hành.
- **FR-S9-03**: Chặng đón dùng trạm `own` gần điểm đón nhất; chặng giao ở nước ngoài dùng trạm `partner` gần điểm giao nhất (≤ 300 km) với bảng giá `PARTNER`.
- **FR-S9-04**: Giờ cấm xe tải nặng nội đô HN, HCM lưu dạng cấu hình (vùng tròn, khung giờ, ngày trong tuần, căn cứ pháp lý, ngoại lệ ngày lễ); điểm đón/giao trong giờ cấm → tự dời giờ, cộng phụ phí đêm khi buộc phải chạy đêm. Giao diện cấu hình luôn hiện cảnh báo "Dữ liệu demo — cần đối chiếu văn bản gốc".
- **FR-S9-05**: ETA chèn điểm nghỉ theo tham số B4 cấu hình được (`journey.rules`).
- **FR-S9-06**: Manager đổi xe/trạm đã giữ phải nhập lý do; hệ thống lưu lịch sử.
- **FR-S9-07**: Chặng bay tính số jet stall = ngựa chuồng riêng + ⌈ngựa thường / 3⌉; tàu gia súc 1 ô/ngựa.
