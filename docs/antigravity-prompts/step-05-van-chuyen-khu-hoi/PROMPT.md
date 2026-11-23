# PROMPT STEP 5: Vận chuyển khứ hồi và chính sách no-show

## 0. Vai trò và mục tiêu

Bạn là kỹ sư full-stack trong repo EquiTransit. Nhiệm vụ: triển khai **Step 5** của `docs/dinh-huong-phat-trien-sau-review.md`.

Góp ý hội đồng (G5): *"Vận chuyển khứ hồi; chặng về khách không về thì mất tiền."*

Kết quả cuối:
- Khách chọn **Khứ hồi** khi báo giá; hệ thống tính giá chặng về (đảo điểm, giảm 10%) và bảo hiểm 2 chặng, thanh toán cùng lúc.
- Khách bắt buộc **tick đồng ý chính sách no-show/hủy chặng về**; chính sách được snapshot vào đơn.
- Hủy chặng về hoàn tiền theo mốc thời gian; công ty không chạy được chặng về thì hoàn 100%.
- Tài xế đánh dấu **no-show** khi chờ quá thời gian tối đa ở điểm đón chặng về → đơn đóng, chặng về mất phí.

## 1. Bắt buộc đọc trước

1. `docs/antigravity-prompts/_COMMON.md`.
2. `AGENTS.md`.
3. File định hướng: **C2** (state machine, có `return_pending`), **C3.5** (khứ hồi −10%), **C4.2** (bảo hiểm khứ hồi tính 2 lần × 0,9), **C5** (bảng chính sách), **STEP 5**.
4. `docs/flows/flow-1-request-approval.md`, `flow-3-route-planning.md`, `flow-4-status-tracking.md`, `flow-6-*` (nếu có).
5. Code Step 4 vừa làm: `backend/src/modules/orders/pricing-policy.ts`, `quotes.controller.ts` (hoặc tên tương đương), bảng `shipment_quote`, `pricing_tariff`.
6. `backend/src/modules/orders/refund-policy.ts`, `orders-ops.service.ts` (`operationalCancel`, `approveRefund`, `transferRefund`), `orders-ops.store.ts`, bảng `shipment_refund_record`, `shipment_invoice` (`invoice_type 'supplemental'`).
7. `backend/src/modules/routes/routes.store.ts` (lưu `route_leg`, `route_stop`), `backend/src/modules/tracking/tracking.service.ts` + `tracking.store.ts` (bắt đầu/kết thúc chặng, cập nhật mốc, `trip_status_log`), `handover.service.ts`.
8. Mọi chỗ liệt kê trạng thái đơn "đang hoạt động": tìm `'in_transit'` trong `backend/src` (ví dụ giữ ngựa `horse.status`, truy vấn xe đang bận trong `fleet.store.ts`, `reports-calculator.ts`, `payment-gate.ts`, `sla-monitor.service.ts`).

## 2. Điều kiện tiên quyết

- Step 4 xong: có `POST /quotes`, `shipment_quote`, `pricing-policy.ts` với `calculateFreight`, tạo đơn từ `quoteId`.
- Nếu Step 4 chưa có → **dừng và báo**.

## 3. Phạm vi

**Làm:** 5.1 dữ liệu → 5.2 báo giá khứ hồi → 5.3 tuyến 2 chiều → 5.4 `return-policy.ts` → 5.5 no-show → 5.6 UI → 5.7 docs. Thêm trạng thái đơn `return_pending`.

**Không làm:** bảo hiểm mới theo M1–M4 (Step 6, nhưng **công thức khứ hồi × 2 × 0,9 áp dụng ngay từ Step 5** trên phí bảo hiểm hiện có); thanh toán trước/state machine tổng (Step 7); GPS bắt buộc khi no-show (Step 10; ở Step 5 dùng ảnh bằng chứng).

## 4. Dữ liệu (migration kế tiếp, dự kiến `032_round_trip.sql`)

Thêm vào `shipment` (idempotent, kiểm tra từng cột):

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `trip_type` | `ENUM('one_way','round_trip') NOT NULL DEFAULT 'one_way'` | |
| `return_departure_at` | `DATETIME NULL` | Giờ hẹn đón chặng về (UTC) |
| `return_wait_minutes` | `INT NOT NULL DEFAULT 120` | Thời gian chờ tối đa tại điểm đón chặng về trước khi được đánh no-show |
| `return_status` | `ENUM('not_applicable','scheduled','in_progress','cancelled','no_show','completed') NOT NULL DEFAULT 'not_applicable'` | |
| `return_no_show` | `BOOLEAN NOT NULL DEFAULT FALSE` | |
| `return_freight` | `BIGINT NOT NULL DEFAULT 0` | Cước chặng về đã snapshot |
| `return_insurance_fee` | `BIGINT NOT NULL DEFAULT 0` | Phí bảo hiểm phần chặng về |
| `return_policy_snapshot` | `JSON NULL` | Bản chính sách khách đã đồng ý (các mốc %, thời gian chờ, phí đổi ngày) |
| `return_policy_accepted_at` | `DATETIME NULL` | |
| `return_cancelled_at` | `DATETIME NULL` | |
| `return_cancel_reason` | `VARCHAR(255) NULL` | |

- `shipment.status`: mở rộng ENUM thêm **`return_pending`** (giữ toàn bộ giá trị cũ). Nếu Step 7 đã thêm trước thì giữ nguyên.
- `route_leg`: thêm `direction ENUM('outbound','return') NOT NULL DEFAULT 'outbound'`.
- `route_stop`: thêm `direction ENUM('outbound','return') NOT NULL DEFAULT 'outbound'`.
- `shipment_quote`: không cần cột mới (dữ liệu khứ hồi nằm trong `input_json`/`result_json`), nhưng thêm `trip_type ENUM('one_way','round_trip') NOT NULL DEFAULT 'one_way'` để truy vấn.
- Bảng giá: thêm vào `params` của mỗi mode khóa `"returnDiscountPercent": 10` bằng cách **tạo version mới** của tariff trong migration (version hiện tại + 1, copy params cũ + khóa mới, bật version mới, tắt bản cũ). Nếu khó làm bằng SQL thuần, cho `pricing-policy.ts` đọc `params.returnDiscountPercent ?? 10` và ghi chú; **không UPDATE params của version cũ**.
- Cập nhật `database/schema.mysql.sql`, `docs/erd.md`.

## 5. Quy tắc nghiệp vụ

### 5.1 Báo giá khứ hồi (sửa `pricing-policy.ts` + service báo giá Step 4)

- Input `POST /quotes` thêm: `tripType: 'one_way' | 'round_trip'`, `returnDepartureAt` (ISO datetime, bắt buộc khi khứ hồi).
- Ràng buộc: `returnDepartureAt ≥ departureDate + thời gian đi ước tính + 12 giờ` (đủ thời gian giao và nghỉ). Sai → `400` kèm thời điểm sớm nhất cho phép.
- Giá chặng về = `calculateFreight` cho **cùng phương án xe** với điểm đầu và điểm cuối **đảo ngược** (deadhead tính từ trạm gần **điểm giao** của chặng đi), rồi giảm `returnDiscountPercent` (10%). Làm tròn lên 1.000 sau khi giảm.
- Bảo hiểm khứ hồi: `insurance_total = round(phí_một_chiều × 2 × 0,9)` cho từng ngựa (theo C4.2). `return_insurance_fee = insurance_total − phí_một_chiều`.
- Response báo giá có 2 khối `outbound` và `return`, mỗi khối có `legs`, `freight` breakdown; `total = outbound.freight.total + return.freight.total + insurance_total`.
- Bỏ chặn `round_trip = 400` mà Step 4 đặt tạm.

### 5.2 Tạo đơn khứ hồi

- Từ quote khứ hồi: ghi `trip_type`, `return_departure_at`, `return_freight`, `return_insurance_fee`, `return_status = 'scheduled'`, `transport_cost` = cước 2 chiều, `total_cost` = tổng quote.
- Bắt buộc `acceptReturnPolicy: true` trong body tạo đơn khi khứ hồi; thiếu → `400`. Ghi `return_policy_snapshot` (lấy từ hàm `currentReturnPolicy()` trong `return-policy.ts`) và `return_policy_accepted_at = NOW()`.

### 5.3 Tuyến 2 chiều

- Khi Manager dựng kế hoạch chi tiết (`POST /routes/plan/:shipmentId/build-detail`), DTO chặng thêm `direction` (mặc định `outbound`). Đơn khứ hồi phải có ít nhất 1 chặng `return`; đơn một chiều không được có chặng `return` (`400`).
- Kiểm tra xe/thời gian cho chặng về dùng chung cơ chế `prepareLegs` (khóa xe, chống trùng giờ). Chặng về có giờ ≥ `return_departure_at`.
- `GET` kế hoạch trả `direction` cho mỗi chặng và mốc.

### 5.4 Trạng thái khi chạy chuyến

- Chặng đi giao xong (bàn giao chặng đi hoặc hoàn tất chặng `outbound` cuối) với đơn khứ hồi → `shipment.status = 'return_pending'` (thay vì `completed`), ngựa vẫn giữ `horse.status = 'in_transit'`.
- Bắt đầu chặng `return` đầu tiên → `status = 'in_transit'`, `return_status = 'in_progress'`.
- Hoàn tất chặng về → `status = 'completed'`, `return_status = 'completed'`, nhả ngựa về `active`.
- **Mọi nơi coi `in_transit` là "đơn đang hoạt động"** (giữ ngựa, xe bận, báo cáo, SLA, cảnh báo giấy tờ...) phải coi `return_pending` cũng đang hoạt động. Liệt kê các file đã sửa trong báo cáo.
- Ghi `trip_status_log` cho mỗi lần chuyển (append-only).

### 5.5 `backend/src/modules/orders/return-policy.ts` (hàm thuần)

```ts
export const RETURN_POLICY_VERSION = 'return-v1';
export function currentReturnPolicy(): ReturnPolicySnapshot  // { version, tiers: [{minHoursBefore:168, refundPercent:80},{minHoursBefore:72, refundPercent:50},{minHoursBefore:0, refundPercent:0}], waitMinutes:120, rescheduleFreeMinHours:168, rescheduleFeePercent:10 }
export function calculateReturnCancellationRefund(input: {
  returnFreight: number; returnInsuranceFee: number; returnDepartureAt: Date; cancelledAt: Date;
  cause: 'customer' | 'company'; policy: ReturnPolicySnapshot;
}): { refundPercent: number; freightRefund: number; insuranceRefund: number; total: number; tier: string }
export function calculateRescheduleFee(input: { returnFreight: number; returnDepartureAt: Date; requestedAt: Date; policy: ReturnPolicySnapshot }): { fee: number; free: boolean }
export function canMarkNoShow(input: { returnDepartureAt: Date; waitMinutes: number; now: Date }): { allowed: boolean; allowedAt: Date }
```

Quy tắc (theo C5, tính theo **giờ chênh lệch**, không theo ngày lịch):
- `cause = 'company'` → hoàn **100% cước chặng về + 100% bảo hiểm chặng về**.
- Khách hủy: còn **≥ 168 giờ (7 ngày)** trước `returnDepartureAt` → 80% cước chặng về; **≥ 72 giờ và < 168 giờ** → 50%; **< 72 giờ** → 0%. Bảo hiểm chặng về khi khách hủy trước khởi hành chặng về: hoàn 100% (theo quy tắc hiện có "hủy trước khởi hành hoàn 100% phí bảo hiểm").
- Đổi ngày về: còn ≥ 168 giờ → miễn phí (nếu còn xe); < 168 giờ → phí 10% cước chặng về.
- No-show: chỉ được đánh khi `now ≥ returnDepartureAt + waitMinutes`.
- Tiền làm tròn về đồng (`Math.round`), không âm.
- **Dùng policy snapshot của đơn**, không dùng policy hiện tại, để đổi chính sách sau không ảnh hưởng đơn cũ.

### 5.6 API

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/orders/:id/return/cancellation-preview` | Customer chủ đơn, Manager, Admin | Trả số tiền hoàn nếu hủy chặng về ngay bây giờ |
| POST | `/orders/:id/return/cancel` | Customer chủ đơn | Body `{ reason }`. Chỉ khi `trip_type = round_trip`, `return_status = 'scheduled'`, chặng về chưa bắt đầu. Ghi `return_status = 'cancelled'`, `return_cancelled_at`, tạo **`shipment_refund_record`** với `cancellation_category = 'return_leg_customer_cancel'`, `freight_refund_amount`, `insurance_refund_amount`, `amount`, `requires_dual_approval` theo ngưỡng 20.000.000 → đi qua luồng duyệt/chuyển khoản sẵn có (SoD). Hoàn 0 đồng vẫn ghi nhận hủy nhưng không tạo refund record |
| POST | `/orders/:id/return/company-cancel` | Manager, Admin | Body `{ reason }` bắt buộc. Hoàn 100% như 5.5, category `return_leg_company_cancel`. Thông báo khách |
| POST | `/orders/:id/return/reschedule` | Customer chủ đơn | Body `{ newReturnDepartureAt }`. Kiểm tra còn xe (dùng cơ chế kiểm tra trùng xe hiện có nếu chặng về đã có xe; nếu chưa lập tuyến chặng về thì chỉ kiểm tra thời gian hợp lệ). Phí > 0 → tạo **hóa đơn bổ sung** (`shipment_invoice.invoice_type = 'supplemental'`; tìm hàm phát hành hóa đơn bổ sung sẵn có và tái sử dụng; nếu chưa có hàm dùng chung thì ghi nhận phí vào `shipment` cột mới `return_reschedule_fee BIGINT DEFAULT 0` và hiển thị, ghi rõ trong báo cáo). Lưu lịch sử đổi ngày (append-only) vào `trip_status_log` hoặc bảng mới `shipment_return_change(id, shipment_id, old_at, new_at, fee, requested_by, created_at)` |
| POST | `/tracking/shipments/:id/return/no-show` | Driver/Escort được phân công chặng `return` | Body `{ notes, evidenceUrls[] }` (ảnh tải bằng endpoint upload ảnh sẵn có của tracking, giữ kiểm tra magic bytes). Kiểm tra `canMarkNoShow` (sớm hơn → `409` kèm `allowedAt`). Kết quả: `return_status = 'no_show'`, `return_no_show = TRUE`, `status = 'completed'`, nhả ngựa và xe, ghi `trip_status_log`, thông báo Customer và Manager. **Không tạo hoàn tiền.** Người không được phân công → `403` |

- Không cho đổi gói bảo hiểm hoặc hủy chặng về khi chặng về đã `in_progress` (`409`).
- Customer khác chủ → `403` ở mọi endpoint.

### 5.7 Frontend

- `customer/requests/new`: công tắc **"Khứ hồi"**; bật thì hiện chọn **ngày giờ đón chặng về** (min = thời điểm sớm nhất server trả hoặc tính tạm phía client, nhưng server là nguồn chính). Thẻ báo giá chia 2 phần "Chặng đi" / "Chặng về (giảm 10%)".
- Hộp **chính sách chặng về** (nội dung lấy từ `currentReturnPolicy()` qua API, vd `GET /orders/return-policy`, hoặc trả kèm trong response báo giá) với checkbox bắt buộc: *"Tôi đã đọc và đồng ý chính sách hủy chặng về và no-show (chờ tối đa 2 giờ, không giao ngựa thì mất 100% cước chặng về)."* Chưa tick thì nút gửi đơn bị khóa.
- `customer/requests/[id]`: khối "Chặng về" (ngày giờ, trạng thái, chính sách đã đồng ý); nút **Xem tiền hoàn & Hủy chặng về** (Modal hiện số tiền từ `cancellation-preview`, yêu cầu nhập lý do), nút **Đổi ngày về** (hiện phí nếu có).
- `manager/requests/[id]`: hiện thông tin chặng về; nút **Công ty hủy chặng về** (bắt buộc lý do).
- Trang lập tuyến Manager (`manager/dispatch/routes`): chặng có nhãn **Chặng đi/Chặng về**, nút "Thêm chặng về" cho đơn khứ hồi.
- `driver/status` (hoặc trang chi tiết chuyến của tài xế): khi đang ở chặng về và đã quá giờ chờ, hiện nút **"Khách không giao ngựa (no-show)"** → Modal tải ảnh bằng chứng + ghi chú; trước giờ cho phép thì nút bị khóa và hiện "Có thể đánh no-show sau HH:mm".
- i18n en + vi cho mọi chuỗi mới. Logic gọi API đặt ở `features/orders` / `features/tracking`.

## 6. Test bắt buộc (`backend/test/round-trip.test.cjs`, đăng ký `npm test`)

1. `calculateReturnCancellationRefund`: đúng 168 giờ → 80%; 167 giờ 59 phút → 50%; đúng 72 giờ → 50%; 71 giờ 59 phút → 0%; `cause = company` → 100% cước + 100% bảo hiểm.
2. `calculateRescheduleFee`: ≥ 168 giờ miễn phí; < 168 giờ = 10% làm tròn.
3. `canMarkNoShow`: trước `returnDepartureAt + 120 phút` → false (kèm `allowedAt`), đúng mốc → true.
4. Báo giá khứ hồi: chặng về = giá chặng đảo chiều × 0,9 làm tròn lên 1.000; bảo hiểm = phí × 2 × 0,9.
5. Tạo đơn khứ hồi thiếu `acceptReturnPolicy` → 400; có → lưu snapshot.
6. Hủy chặng về bởi khách khác chủ → 403; khi `return_status = 'in_progress'` → 409.
7. No-show bởi tài xế không được phân công → 403; quá sớm → 409; hợp lệ → đơn `completed`, `return_no_show = true`, không tạo refund record.
8. Chặng đi xong với đơn khứ hồi → `return_pending`; đơn một chiều → `completed` như cũ.
9. Đơn một chiều có chặng `return` khi lưu kế hoạch → 400.

## 7. Tài liệu

- `docs/flows/flow-1-request-approval.md`: mục **"Khứ hồi và no-show (Step 5)"**: bảng C5, công thức −10%, bảo hiểm × 2 × 0,9, tick đồng ý, snapshot chính sách.
- `docs/flows/flow-4-status-tracking.md`: trạng thái `return_pending`, chuyển trạng thái, no-show.
- `docs/flows/flow-3-route-planning.md`: chặng có `direction`.
- `docs/api-documentation.md`, `docs/erd.md`, `docs/requirements.md` (thêm yêu cầu khứ hồi), file định hướng (trạng thái Step 5).

## 8. Tiêu chí hoàn thành

- [ ] Đơn khứ hồi có giá 2 chiều đúng; tổng = đi + về (−10%) + bảo hiểm × 2 × 0,9.
- [ ] Không tick chính sách thì không tạo được đơn khứ hồi.
- [ ] Hủy chặng về ra đúng % theo mốc; công ty hủy hoàn 100%; khoản hoàn đi qua duyệt + chuyển khoản SoD sẵn có.
- [ ] No-show đóng đơn, không hoàn tiền, có bằng chứng và audit.
- [ ] Đơn một chiều không bị ảnh hưởng (test cũ vẫn pass).
- [ ] Mọi lệnh kiểm tra ở `_COMMON.md` mục 7 đạt; báo cáo theo mục 9.

## 9. Bẫy thường gặp

- Quên thêm `return_pending` vào danh sách trạng thái "đang hoạt động" → ngựa bị nhả sớm, xe bị coi là rảnh khi đang chờ chặng về.
- Tính mốc 7 ngày theo ngày lịch thay vì 168 giờ.
- Lấy chính sách hiện tại thay vì snapshot của đơn khi tính hoàn tiền.
- `shipment_refund_record` có nhiều cột NOT NULL (`cancellation_category`, `requested_by`...): đọc schema và cách `operationalCancel` đang insert để làm giống.
