# PROMPT STEP 7: Báo giá → thanh toán ngay → hóa đơn PDF → Manager duyệt khả thi → hoàn tiền khi không đáp ứng

## 0. Vai trò và mục tiêu

Bạn là kỹ sư full-stack trong repo EquiTransit. Nhiệm vụ: triển khai **Step 7** của `docs/dinh-huong-phat-trien-sau-review.md`. Đây là **thay đổi luồng lớn nhất**; làm theo 5 giai đoạn 7.1 → 7.5, **chạy kiểm tra sau mỗi giai đoạn** trước khi sang giai đoạn sau.

Góp ý hội đồng (G4, G4a, G4b): *"Báo giá và thanh toán luôn"*, *"Thanh toán xong thì có hóa đơn dạng PDF"*, *"Thanh toán xong mà không đáp ứng được thì gửi form để hoàn tiền."*

Luồng mới (đơn tạo từ báo giá, gọi là **luồng trả trước / `prepaid`**):

```
Báo giá (Step 4) → Khách xác nhận → đơn awaiting_payment + hóa đơn phát hành ngay + VietQR SePay
  → webhook đủ tiền → paid_pending_review
  → Manager duyệt khả thi → approved → planning → ready_to_depart → in_transit → (return_pending) → completed
  → hoặc Manager "Không đáp ứng được" → refund_requested → khách điền form ngân hàng
       → Manager duyệt → Admin chuyển khoản (SoD) → refunded
  → hết hạn thanh toán → cancelled (lý do payment_expired), nhả ngựa
```

**Đơn cũ (luồng trả sau / `postpaid_legacy`) phải tiếp tục chạy như hiện tại**: duyệt → nhập giá → lập tuyến → xác nhận → hóa đơn → thanh toán.

## 1. Bắt buộc đọc trước

1. `docs/antigravity-prompts/_COMMON.md`.
2. `AGENTS.md`.
3. File định hướng: **C2** (state machine + 4 nguyên tắc), **STEP 7**, **Phần F** (rủi ro đổi state machine).
4. `docs/payment-gating-delivery.md`, `docs/sepay-local.md`, `docs/sepay-review.md`, `docs/flows/flow-1-request-approval.md`, `docs/flows/flow-3-route-planning.md` (mục 6 cổng thanh toán), `docs/actors-and-roles.md` (SoD).
5. Code backend `orders` **toàn bộ**, đặc biệt:
   - `payment-gate.ts` (`paymentGate`, `CONFIRMED_PLAN_STATUSES`, `WAITING_FOR_PLAN`).
   - `sepay-payment.service.ts`, `sepay-payment.store.ts`, `sepay-payment.controller.ts` (tạo VietQR, webhook, đối soát số tiền, chống webhook trùng).
   - `orders.store.ts` (tạo đơn, giữ ngựa `horse.status`, phát hành hóa đơn khi xác nhận kế hoạch), `orders.service.ts`, `orders-ops.service.ts` (`operationalCancel`, `approveRefund`, `transferRefund`), `refund-policy.ts`, `sla-monitor.service.ts` (mẫu `setInterval`), `sla-timeline.policy.ts`.
   - Bảng `shipment_invoice` (route_id NOT NULL, `active_primary_route_id`), `shipment_sepay_payment`, `sepay_webhook_receipt`, `shipment_refund_record`, migration `016_*`, `018_*`, `026_*`.
6. `backend/src/modules/routes/routes.store.ts` (chỗ phát hành hóa đơn khi kế hoạch được xác nhận), `reports/reports-calculator.ts`, `notifications/notifications.service.ts`, `auth/mail.service.ts`.
7. Frontend: `app/customer/requests/new/page.tsx`, `app/customer/requests/[id]/page.tsx`, `app/customer/requests/page.tsx`, `features/orders/components/InvoiceSummary.tsx`, `features/orders/quotation-html.ts`, các component thanh toán SePay hiện có (tìm `payments/sepay`), `app/manager/requests/page.tsx` + `[id]/page.tsx`, trang hoàn tiền của Admin/Manager hiện có (tìm `refunds`).
8. Các Step trước: Step 4 (`shipment_quote`, tạo đơn từ `quoteId`), Step 5 (`return_pending`, khứ hồi), Step 6 (bảo hiểm v2) nếu đã làm.

## 2. Điều kiện tiên quyết

- **Bắt buộc** Step 4 xong. Step 5 và 6 nên xong (nếu chưa, luồng vẫn làm được; ghi rõ phần nào chưa áp dụng).
- Nếu thiếu Step 4 → dừng và báo.

## 3. Quyết định thiết kế (đã chốt, làm đúng như sau)

1. **Phân luồng bằng cột** `shipment.payment_flow ENUM('postpaid_legacy','prepaid') NOT NULL DEFAULT 'postpaid_legacy'`. Đơn tạo từ `quoteId` → `prepaid`. Mọi logic mới **rẽ nhánh theo cột này**; luồng cũ giữ nguyên.
2. **Không thêm trạng thái `quoted` cho `shipment`**: trạng thái báo giá nằm ở `shipment_quote.status`. Đơn `prepaid` bắt đầu ở `awaiting_payment`. Ghi quyết định này vào docs (khác sơ đồ C2).
3. Thêm vào `shipment.status`: `awaiting_payment`, `paid_pending_review`, `refund_requested`, `refunded` (và `return_pending` nếu Step 5 chưa thêm). Giữ nguyên mọi giá trị cũ.
4. **Giữ chỗ ngựa ngay khi tạo đơn `awaiting_payment`** (không đợi thanh toán) để tránh đặt trùng ngựa; nhả khi hết hạn thanh toán, hủy, hoặc `refunded`. Ghi quyết định vào docs (khác câu "webhook xong mới giữ chỗ" trong kế hoạch).
5. **Hết hạn thanh toán** → `cancelled` với lý do `payment_expired` (khách báo giá lại để đặt tiếp), hóa đơn `void`, nhả ngựa. Mặc định: QR SePay theo cấu hình hiện có; hạn thanh toán đơn `ORDER_PAYMENT_WINDOW_MINUTES=1440` (24 giờ).
6. **Đơn `prepaid` mới bắt buộc tạo từ `quoteId`.** `POST /orders` không có `quoteId` từ Customer → `400` "Vui lòng tạo báo giá trước" (Manager/Admin tạo đơn hộ cũng phải qua báo giá). Cập nhật test cũ nào tạo đơn không có báo giá: chuyển sang tạo qua quote hoặc gắn cờ rõ ràng đây là dữ liệu legacy được seed trực tiếp vào store giả. Ghi danh sách test đã sửa.
7. Hóa đơn `prepaid` phát hành **khi tạo đơn**, chưa có tuyến → cho phép `shipment_invoice.route_id` **NULL** (xem 7.2).
8. **PDF**: dùng trang in + `window.print()` với CSS `@media print` (đúng quyết định hiện có: không xuất PDF ở backend). Không cài thư viện PDF.
9. **Hoàn tiền khi công ty không đáp ứng = 100% số đã thanh toán (cước + bảo hiểm)**, tái sử dụng `shipment_refund_record` + duyệt + chuyển khoản SoD.

## 4. Giai đoạn 7.1 — State machine dùng chung

### 4.1 Migration (dự kiến `034_prepaid_flow.sql`; kiểm tra số kế tiếp)

- Mở rộng `shipment.status` (MODIFY với **toàn bộ** giá trị cũ + mới).
- `shipment.payment_flow` (như 3.1), `shipment.payment_due_at DATETIME NULL`, `shipment.cancel_reason_code VARCHAR(50) NULL`, `shipment.feasibility_decided_by INT NULL`, `shipment.feasibility_decided_at DATETIME NULL`, `shipment.feasibility_reason_code VARCHAR(50) NULL`, `shipment.feasibility_note TEXT NULL`.
- Bảng lịch sử trạng thái (append-only):

```sql
CREATE TABLE IF NOT EXISTS shipment_status_history (
  history_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  from_status VARCHAR(40) NULL,
  to_status VARCHAR(40) NOT NULL,
  actor_id INT NULL,            -- NULL = hệ thống (webhook, job hết hạn)
  actor_role VARCHAR(40) NOT NULL,
  reason_code VARCHAR(50) NULL,
  note TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_ssh_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  INDEX idx_ssh_shipment (shipment_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.2 `backend/src/modules/orders/order-state-machine.ts`

```ts
export type ShipmentStatusValue = 'requested' | 'change_requested' | 'approved' | 'rejected' | 'planning' | 'confirmed'
  | 'ready_to_depart' | 'in_transit' | 'return_pending' | 'completed' | 'cancelled' | 'cancelled_operational'
  | 'awaiting_payment' | 'paid_pending_review' | 'refund_requested' | 'refunded';

export const PREPAID_TRANSITIONS: Record<string, ShipmentStatusValue[]>;   // chỉ cho payment_flow = prepaid
export const LEGACY_TRANSITIONS: Record<string, ShipmentStatusValue[]>;    // mô tả đúng luồng cũ đang chạy (đọc code để liệt kê)
export function canTransition(flow: 'prepaid' | 'postpaid_legacy', from: string, to: string): boolean;
export function assertTransition(flow, from, to): void;   // sai → ConflictException (409) với thông báo "Không thể chuyển từ X sang Y"
export async function transitionShipment(db: PoolConnection, input: {
  shipmentId: number; to: ShipmentStatusValue; actorId: number | null; actorRole: string; reasonCode?: string; note?: string;
  expectedFrom?: ShipmentStatusValue[];   // mặc định = các trạng thái được phép chuyển sang `to`
}): Promise<{ from: string; to: string }>;
```

`PREPAID_TRANSITIONS` (đúng C2, bỏ `quoted`):

| Từ | Được sang |
|---|---|
| `awaiting_payment` | `paid_pending_review`, `cancelled` |
| `paid_pending_review` | `approved`, `refund_requested` |
| `approved` | `planning`, `cancelled_operational` |
| `planning` | `confirmed`, `ready_to_depart`, `cancelled_operational` (giữ `confirmed` nếu luồng kế hoạch hiện tại dùng) |
| `confirmed` | `ready_to_depart`, `planning`, `cancelled_operational` |
| `ready_to_depart` | `in_transit`, `planning`, `cancelled_operational` |
| `in_transit` | `return_pending`, `completed` |
| `return_pending` | `in_transit`, `completed` |
| `refund_requested` | `refunded` |

- `transitionShipment` dùng `UPDATE shipment SET status = ? WHERE shipment_id = ? AND status IN (...)` (cập nhật có điều kiện) và kiểm tra `affectedRows = 1`; không khớp → đọc lại trạng thái hiện tại và ném `409`. Sau đó insert `shipment_status_history`. Chạy **trong transaction của caller**.
- **Mọi chuyển trạng thái mới của Step 7** đi qua `transitionShipment`. Với các chỗ cũ đang `UPDATE shipment SET status` trực tiếp: liệt kê chúng (grep) trong báo cáo; chuyển những chỗ nằm trên luồng `prepaid` sang dùng hàm này; chỗ chỉ thuộc luồng cũ có thể giữ nguyên nhưng phải ghi lịch sử nếu dễ làm.
- Unit test bảng chuyển trạng thái (mục 9).

## 5. Giai đoạn 7.2 — Thanh toán ngay sau báo giá

### 5.1 Hóa đơn không cần tuyến

- Migration: `shipment_invoice.route_id` → `NULL` được. Kiểm tra index/unique đang dựa trên `active_primary_route_id`: với hóa đơn `route_id IS NULL` cột sinh này là NULL nên không chặn trùng. Thêm cột sinh mới `active_primary_shipment_key` = `CASE WHEN invoice_type = 'primary' AND status <> 'void' AND route_id IS NULL THEN shipment_id ELSE NULL END` + `UNIQUE` để mỗi đơn `prepaid` chỉ có **một hóa đơn chính đang hiệu lực**. Đọc migration 016/018/026 và **giữ nguyên ràng buộc cũ** cho đơn legacy. Thêm FK, CHECK nào thì phải idempotent.
- Snapshot hóa đơn `prepaid` (JSON) gồm: thông tin khách, liên hệ, điểm đón/giao, ngày đi (và chặng về nếu khứ hồi), phương thức, danh sách ngựa (tên, microchip, gói bảo hiểm, giá trị khai báo, phí), **breakdown cước từ báo giá**, tổng bảo hiểm, tổng, `tariffVersions`, `quoteId`, chính sách hủy/khứ hồi đã đồng ý, mã hóa đơn hiển thị (vd `INV-2026-000123`), `issuedAt`.

### 5.2 Tạo đơn `prepaid`

`POST /orders` với `quoteId` (transaction):
1. Kiểm tra quote như Step 4 (chủ, còn hạn, chưa dùng).
2. Kiểm tra ngựa còn rảnh (không thuộc đơn đang hoạt động), khóa dòng ngựa.
3. Tạo `shipment` với `payment_flow = 'prepaid'`, `status = 'awaiting_payment'`, `payment_due_at = NOW() + ORDER_PAYMENT_WINDOW_MINUTES`, giá từ quote.
4. Giữ ngựa (`horse.status = 'in_transit'` như quy tắc hiện tại).
5. Phát hành hóa đơn chính (`route_id = NULL`, `payment_due_at` = hạn đơn).
6. Ghi `shipment_status_history` (`null → awaiting_payment`, actor = khách).
7. Đánh dấu quote `used`.

Response trả `orderId`, `invoice`, `paymentDueAt`. Frontend gọi tiếp `POST /orders/:id/payments/sepay` để lấy VietQR (endpoint sẵn có).

### 5.3 Cổng thanh toán

- `payment-gate.ts`: với `payment_flow = 'prepaid'`: cho phép thanh toán khi `status = 'awaiting_payment'`, hóa đơn chính hợp lệ, `amount = total_cost`, chưa quá `payment_due_at`. Không yêu cầu kế hoạch xác nhận/tài xế xác nhận. Luồng legacy **giữ nguyên điều kiện cũ**.
- Webhook SePay đủ tiền cho đơn `prepaid`: trong transaction hiện có của webhook → hóa đơn `paid` → `transitionShipment(awaiting_payment → paid_pending_review, actorId = null, actorRole = 'SYSTEM', reasonCode = 'payment_received')` → thông báo khách ("Đã nhận thanh toán, đang chờ xác nhận khả năng vận chuyển") và **notifyRole Logistics Manager** ("Đơn REQ-xxx đã thanh toán, cần duyệt khả thi"). Giữ nguyên chống webhook trùng và kiểm tra số tiền.
- Thanh toán thiếu/thừa: giữ hành vi `review` hiện có của SePay; không chuyển trạng thái đơn.

### 5.4 Hết hạn thanh toán

- Trong `sla-monitor.service.ts` (hoặc service job mới cùng mẫu `setInterval`, chu kỳ 5 phút, có cờ tránh chạy chồng): tìm đơn `prepaid` `awaiting_payment` có `payment_due_at < NOW()` và **không có** giao dịch SePay `succeeded`/`review` → transaction: `transitionShipment(→ cancelled, reasonCode 'payment_expired')`, `cancel_reason_code = 'payment_expired'`, hóa đơn `void`, hủy QR `pending`, nhả ngựa (chỉ khi ngựa không thuộc đơn hoạt động khác), thông báo khách.
- Đơn có giao dịch đang `review` → không tự hủy, gửi thông báo Manager kiểm tra.
- `.env.example`: `ORDER_PAYMENT_WINDOW_MINUTES=1440`.

### 5.5 Bỏ nhập giá tay cho đơn mới

- `PATCH /orders/:id/approve` với đơn `prepaid` → `409` "Đơn trả trước dùng nút Duyệt khả thi" (giá đã khóa từ báo giá). Giữ endpoint cho đơn legacy.
- `request-changes`, `reject` (luồng cũ) không áp dụng cho `prepaid` → `409`.
- Frontend Manager: ẩn hoàn toàn ô nhập cước với đơn `prepaid`.

## 6. Giai đoạn 7.3 — Hóa đơn in được / tải PDF

### 6.1 API

- `GET /orders/:id/invoice` — Customer chủ đơn, Manager, Admin. Trả `{ invoiceCode, status, issuedAt, paidAt, amount, currency, snapshot, payment: { method: 'SePay', transactionId, paidAt, bankCode }, supplementalInvoices: [...] }`. **Chỉ đọc từ snapshot** + bản ghi thanh toán; không tính lại giá. Khác chủ → `403`.

### 6.2 Trang `frontend/src/app/customer/requests/[id]/invoice/page.tsx`

- Bố cục hóa đơn A4: tên/logo chữ "EquiTransit", mã hóa đơn, trạng thái (ĐÃ THANH TOÁN / CHƯA THANH TOÁN / ĐÃ HỦY), ngày phát hành và ngày thanh toán (hiển thị theo `Asia/Ho_Chi_Minh`, ghi rõ "(UTC+7)"), thông tin khách và liên hệ, tuyến (điểm đón → giao, phương thức, ngày đi, chặng về nếu có), bảng ngựa, **bảng breakdown cước** từng dòng, dòng bảo hiểm từng ngựa, tổng tiền bằng số và **bằng chữ tiếng Việt** (viết hàm thuần `numberToVietnameseWords` trong `features/orders/`, có test đơn vị nếu frontend có cơ chế test; nếu không, viết hàm cẩn thận và ghi chú), mã giao dịch SePay, chính sách hủy/khứ hồi đã đồng ý, chân trang "Hóa đơn điện tử tạo từ hệ thống, không cần chữ ký".
- Nút **"Tải PDF / In"** gọi `window.print()`; CSS `@media print`: ẩn menu/header/nút, nền trắng, khổ A4, lề 15 mm, không cắt ngang dòng bảng (`break-inside: avoid`).
- Manager xem cùng trang qua đường dẫn của Manager (vd `manager/requests/[id]/invoice` dùng chung component đặt trong `features/orders/components/InvoiceDocument.tsx`).
- Link "Xem hóa đơn" ở chi tiết đơn của Customer và Manager.

## 7. Giai đoạn 7.4 — Manager duyệt khả thi

- `PATCH /orders/:id/feasibility` — Manager, Admin. Body `{ decision: 'approve' | 'cannot_fulfil', reasonCode?, note? }`.
  - Chỉ cho đơn `prepaid` ở `paid_pending_review` (khác → `409`).
  - `approve` → `approved`; ghi `feasibility_*`; thông báo khách.
  - `cannot_fulfil` → bắt buộc `reasonCode` ∈ {`no_vehicle_available`, `route_not_supported`, `destination_not_accepted`, `documents_cannot_be_ready`, `horse_health_risk`, `other`} và `note` (≥ 10 ký tự) → `refund_requested`; thông báo khách kèm đường dẫn form hoàn tiền (giai đoạn 7.5); gửi email nếu SMTP bật (xem 8.3).
- Màn `manager/requests`: thêm bộ lọc **"Đã thanh toán, chờ duyệt"** (`paid_pending_review`) ở đầu; chi tiết đơn hiện tuyến, ngựa, breakdown, trạng thái giấy tờ (nếu Step 8 có), nút **Duyệt** và **Không đáp ứng được** (Modal chọn lý do + ghi chú, cảnh báo "Khách sẽ được hoàn 100%").
- Sau `approved`, luồng lập tuyến hiện có tiếp tục; khi kế hoạch được xác nhận, **không phát hành hóa đơn lần nữa** cho đơn `prepaid` (sửa chỗ phát hành hóa đơn trong `routes.store.ts`/`orders.store.ts` để bỏ qua đơn `prepaid` đã có hóa đơn chính `paid`). Phát sinh chi phí sau đó (đổi tuyến khẩn Flow 5) vẫn dùng hóa đơn bổ sung như cũ.
- Gate xuất phát (`ready_to_depart`) cho đơn `prepaid`: **đủ xe + tài xế xác nhận + giấy tờ Tier A duyệt và còn hạn** (đã thanh toán từ trước). Tìm hàm đánh giá gate hiện có (`evaluateReadyToDepartGate` trong `routes.service.ts`) và rẽ nhánh: đơn `prepaid` không cần điều kiện thanh toán sau xác nhận.

## 8. Giai đoạn 7.5 — Form hoàn tiền

### 8.1 Dữ liệu

- `shipment_refund_record` thêm (idempotent): `recipient_bank_name VARCHAR(150) NULL`, `recipient_account_holder VARCHAR(150) NULL`, `customer_note TEXT NULL`, `form_submitted_at DATETIME NULL`, `sla_due_at DATETIME NULL`. (`recipient_bank_account` đã có.)

### 8.2 API

- `GET /orders/:id/refund-form` — Customer chủ đơn: trả số tiền hoàn (= tổng đã thanh toán thành công, gồm cước + bảo hiểm), lý do Manager đã chọn, trạng thái form, `slaDueAt`.
- `POST /orders/:id/refund-form` — Customer chủ đơn, chỉ khi đơn `refund_requested` và chưa nộp form. Body `{ bankName, accountNumber (6–20 chữ số), accountHolder (chữ in hoa không dấu hoặc có dấu, ≤ 150), confirmAmount, note? }`. `confirmAmount` phải **bằng** số tiền server tính (khác → `409`, tránh nhầm). Tạo `shipment_refund_record`: `cancellation_category = 'company_cannot_fulfil'`, `refund_mode = 'cash_refund'`, `freight_refund_amount`, `insurance_refund_amount`, `amount`, `requires_dual_approval = amount ≥ 20.000.000`, `requested_by = khách`, thông tin ngân hàng, `form_submitted_at`, `sla_due_at = form_submitted_at + REFUND_SLA_BUSINESS_DAYS ngày làm việc` (bỏ thứ 7, chủ nhật; hàm thuần `addBusinessDays` có test). Thông báo Manager.
- Duyệt và chuyển khoản: **tái sử dụng** `PATCH /orders/refunds/:refundId/approve` (Manager; duyệt kép nếu cần) và `POST /orders/refunds/:refundId/transfer` (Admin; `transferred_by != approved_by` → `403`; tải ủy nhiệm chi). Khi refund `transferred` và category `company_cannot_fulfil` → trong cùng transaction: `transitionShipment(refund_requested → refunded, reasonCode 'refund_transferred')`, nhả ngựa, thông báo khách kèm đường dẫn xem chứng từ (endpoint receipt sẵn có).
- `.env.example`: `REFUND_SLA_BUSINESS_DAYS=3`.

### 8.3 Email

- `auth/mail.service.ts` chỉ có hàm OTP. Thêm **một hàm chung** gửi email thông báo (vd `sendNotificationEmail(to, subject, html)`) dùng lại transporter sẵn có, tôn trọng `SMTP_REQUIRED=false` (không có SMTP thì log và bỏ qua, **không** làm lỗi luồng). Đây là sửa ngoài module `orders`: ghi lý do trong báo cáo. Nếu `MailService` không được export khỏi `AuthModule`, export nó (thay đổi tối thiểu).
- Gửi email khi: đơn chuyển `refund_requested` (kèm link form), đơn `refunded`.

### 8.4 Frontend

- `frontend/src/app/customer/requests/[id]/refund/page.tsx`: hiện lý do không đáp ứng, **số tiền hoàn 100%** (chia cước/bảo hiểm), form ngân hàng (tên ngân hàng dạng chọn danh sách phổ biến + nhập khác, số tài khoản, chủ tài khoản), ô xác nhận số tiền (điền sẵn, khách tick "Tôi xác nhận số tiền hoàn"), ghi chú. Sau gửi: trạng thái xử lý theo bước (Đã gửi form → Manager duyệt → Admin chuyển khoản → Hoàn tất) và hạn xử lý `slaDueAt` ("trong 3 ngày làm việc, trước dd/mm").
- Chi tiết đơn Customer: banner nổi bật khi `refund_requested` với nút "Điền form hoàn tiền".
- Màn duyệt/chuyển khoản hoàn tiền hiện có của Manager/Admin: hiện thêm thông tin ngân hàng, category `company_cannot_fulfil`, SLA.

## 9. Test bắt buộc (`backend/test/prepaid-flow.test.cjs`, đăng ký `npm test`)

1. `canTransition` cho toàn bộ bảng `PREPAID_TRANSITIONS`; vài cặp sai (vd `awaiting_payment → approved`, `refund_requested → approved`, `paid_pending_review → planning`) → false; `assertTransition` sai ném `ConflictException`.
2. `transitionShipment` với db giả: `affectedRows = 0` → `ConflictException`; thành công thì có insert `shipment_status_history`.
3. Tạo đơn không có `quoteId` (Customer) → `BadRequestException`; có quote hợp lệ → `awaiting_payment`, `payment_flow = prepaid`, hóa đơn phát hành với `route_id = null`.
4. `paymentGate` đơn `prepaid` `awaiting_payment` → mở; quá `payment_due_at` → đóng; đơn legacy giữ điều kiện cũ (test cũ phải pass).
5. Webhook đủ tiền cho đơn `prepaid` → `paid_pending_review`, thông báo Manager.
6. Job hết hạn: đơn quá hạn không có giao dịch → `cancelled` + `payment_expired` + nhả ngựa; đơn có giao dịch `review` → không hủy.
7. `feasibility`: đơn không ở `paid_pending_review` → 409; `cannot_fulfil` thiếu `reasonCode` → 400; hợp lệ → `refund_requested`.
8. `PATCH /orders/:id/approve` với đơn `prepaid` → 409.
9. Form hoàn tiền: khác chủ → 403; `confirmAmount` sai → 409; nộp 2 lần → 409; số tiền = cước + bảo hiểm đã thanh toán; ≥ 20 triệu → `requires_dual_approval = true`.
10. Chuyển khoản refund `company_cannot_fulfil` → đơn `refunded`; người chuyển trùng người duyệt → 403 (tái sử dụng logic hiện có).
11. `addBusinessDays`: thứ 6 + 3 ngày làm việc = thứ 4 tuần sau.
12. Kế hoạch được xác nhận cho đơn `prepaid` đã thanh toán **không** phát hành hóa đơn chính thứ hai.

Chạy lại **toàn bộ** test cũ; test nào lỗi vì thay đổi có chủ đích (bắt buộc `quoteId`) thì sửa và liệt kê lý do.

## 10. Tài liệu

- `docs/flows/flow-1-request-approval.md`: viết lại phần luồng chính theo luồng `prepaid` (sơ đồ trạng thái mermaid đã bỏ `quoted`, ghi rõ các quyết định ở mục 3), giữ một mục ngắn "Đơn cũ (trả sau)".
- `docs/payment-gating-delivery.md`: cổng thanh toán 2 luồng.
- `docs/flows/flow-3-route-planning.md`: không phát hành hóa đơn lần 2 cho đơn trả trước; gate xuất phát mới.
- `docs/actors-and-roles.md`: RACI "Duyệt khả thi" (Manager R/A), "Form hoàn tiền" (Customer R), giữ SoD.
- `docs/api-documentation.md`, `docs/erd.md`, `docs/requirements.md`, `.env.example`, file định hướng (trạng thái Step 7).
- `reports/reports-calculator.ts`: doanh thu tính khi đã thanh toán (`paid_pending_review` trở đi, trừ `refunded`); hoàn tiền `company_cannot_fulfil` hiển thị riêng. Cập nhật docs báo cáo nếu có.

## 11. Kịch bản thử tay (ghi vào báo cáo cho người dùng)

(a) Customer báo giá → xác nhận → thấy QR → giả lập webhook SePay (theo `docs/sepay-local.md`) → đơn "Đã thanh toán, chờ duyệt" → mở hóa đơn, bấm "Tải PDF" → Manager bấm Duyệt → đơn `approved`.
(b) Thanh toán xong → Manager "Không đáp ứng được" (hết xe) → khách nhận thông báo, điền form ngân hàng → Manager duyệt → Admin chuyển khoản (tài khoản khác Manager) → đơn `refunded`. Thử Admin là cùng người với người duyệt → bị 403.
(c) Tạo đơn rồi không trả tiền, chỉnh `payment_due_at` về quá khứ trong DB → sau chu kỳ job, đơn `cancelled`, ngựa được nhả.

## 12. Tiêu chí hoàn thành

- [ ] Hai kịch bản (a), (b) chạy được; (c) tự hủy đúng.
- [ ] Đơn cũ (trả sau) vẫn đi hết luồng cũ.
- [ ] Mọi chuyển trạng thái mới đi qua `order-state-machine.ts` và có `shipment_status_history`.
- [ ] Hóa đơn chỉ lấy từ snapshot; in ra A4 gọn gàng.
- [ ] SoD giữ nguyên.
- [ ] Mọi lệnh kiểm tra đạt; báo cáo theo mẫu `_COMMON.md`.

## 13. Bẫy thường gặp

- Quên thêm trạng thái mới vào các danh sách "đang hoạt động"/"kết thúc" rải rác (giữ ngựa, xe bận, báo cáo, thông báo SLA, `paymentGate` blockedReason). Grep `'cancelled_operational'` và `'in_transit'` để rà.
- Unique index của `shipment_invoice` theo `route_id` làm hỏng khi `route_id` NULL; kiểm tra kỹ migration 016.
- Webhook chạy trong transaction riêng; chuyển trạng thái phải ở **cùng transaction** với đánh dấu hóa đơn `paid`.
- Job hết hạn chạy song song với webhook: dùng cập nhật có điều kiện (`WHERE status = 'awaiting_payment'`) để không hủy đơn vừa được thanh toán.
- Hiển thị giờ: DB lưu UTC; hóa đơn hiển thị UTC+7.
