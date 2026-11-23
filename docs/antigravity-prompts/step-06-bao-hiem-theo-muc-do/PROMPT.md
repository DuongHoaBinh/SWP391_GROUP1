# PROMPT STEP 6: Bảo hiểm theo % giá trị và bồi thường theo mức độ sự cố M1–M4

## 0. Vai trò và mục tiêu

Bạn là kỹ sư full-stack trong repo EquiTransit. Nhiệm vụ: triển khai **Step 6** của `docs/dinh-huong-phat-trien-sau-review.md`.

Góp ý hội đồng (G6): *"Mua bảo hiểm theo %; làm rõ từng gói thu bao nhiêu, đền bù bao nhiêu theo mức độ sự cố."*

Kết quả cuối:
- 3 gói **Cơ bản / Tiêu chuẩn / Toàn diện** với phí theo % giá trị khai báo (có mức tối thiểu).
- Bảng **mức độ sự cố M1–M4** và **quy tắc đền bù cấu hình được** (không hard-code).
- Khách thấy **bảng so sánh bằng tiền thật** cho chính con ngựa của mình: "Ngựa 2 tỷ, gói Tiêu chuẩn: phí 30 triệu; M3 đền 1 tỷ; M4 đền 1,6 tỷ".
- Khách gửi **yêu cầu bồi thường** (claim) trong 72 giờ sau bàn giao; Manager xử lý với số tiền **hệ thống gợi ý**; khoản ≥ 20 triệu duyệt kép, Admin chuyển khoản (SoD).

## 1. Bắt buộc đọc trước

1. `docs/antigravity-prompts/_COMMON.md`.
2. `AGENTS.md`.
3. File định hướng: **B7**, **C4** (C4.1 mức độ, C4.2 bảng gói, C4.3 quy tắc), **STEP 6**, ghi chú mâu thuẫn tài liệu ở cuối **Phần A**.
4. `docs/equine-insurance-delivery.md`, `docs/requirements.md` (phần bảo hiểm), `docs/flows/flow-6-*` (bàn giao/tranh chấp) nếu có.
5. Code:
   - `backend/src/modules/orders/insurance-policy.ts` (toàn bộ), nơi gọi `calculateInsurance`, `totalInsuranceFee`, `insurancePolicy` (tìm trong `backend/src`).
   - `backend/src/modules/orders/orders.controller.ts` (`GET /orders/insurance-policy`), `orders.store.ts` (insert `shipment_horse` với các cột bảo hiểm), migration `017_*` (cột bảo hiểm).
   - `backend/src/modules/orders/refund-policy.ts`, `orders-ops.service.ts` (`approveRefund`, `transferRefund`, ràng buộc SoD, duyệt kép), `orders-ops.controller.ts`.
   - `backend/src/modules/tracking/handover.service.ts`, `handover.store.ts` (bàn giao, `horse_condition_at_handover`, cửa sổ tranh chấp 24 giờ).
   - Frontend: `frontend/src/features/orders/insurance-policy.ts`, `features/orders/components/InsuranceSelection.tsx`, `InsuranceSummary.tsx`, `InsuranceAmendmentForm.tsx`; `app/customer/requests/new/page.tsx`, `app/customer/requests/[id]/page.tsx`.
   - Step 5 (nếu đã làm): quy tắc bảo hiểm khứ hồi × 2 × 0,9.

## 2. Điều kiện tiên quyết

- Không bắt buộc Step 5 (Step 5 và 6 làm song song được). Nếu Step 5 đã có công thức khứ hồi thì **giữ nguyên** công thức đó.
- Có bảng `shipment_refund_record` và luồng duyệt/chuyển khoản hoàn tiền (đã có từ trước).

## 3. Phạm vi

**Làm:** 6.1 viết lại phí → 6.2 bảng quy tắc đền bù → 6.3 bảng claim → 6.4 API claim + gợi ý tiền + duyệt kép + Admin chuyển → 6.5 UI bảng so sánh + form claim + màn Manager → 6.6 docs.

**Không làm:** đổi tên mã gói (giữ `basic`, `standard`, `premium`); tính lại phí cho đơn cũ; thay đổi luồng thanh toán (Step 7).

## 4. Quy tắc phí mới (C4.2)

| Mã | Tên hiển thị | Phí mỗi chuyến trên giá trị khai báo (VND) | Tối thiểu | Ghi chú |
|---|---|---|---|---|
| `basic` | Cơ bản | 0% | 0 | Mặc định; không cần khai báo giá trị |
| `standard` | Tiêu chuẩn | 1,5% (150 bps) | **1.000.000** | Bắt buộc giá trị > 0 |
| `premium` | Toàn diện | 3% (300 bps) | **2.000.000** | Bắt buộc giá trị > 0 |

- `fee = max(round(valueVnd × bps / 10000), minimum)` cho gói có phí. Giữ cách tính bằng `BigInt` như code hiện tại.
- Version mới: `INSURANCE_VERSION = 'equine-v2'`. Đơn cũ giữ snapshot `equine-v1`, **không tính lại**.
- Khứ hồi: `phí × 2 × 0,9` (như Step 5).
- Giữ các field trả về hiện có (`insuranceFee`, `maxCompensation`, `emergencyVetCovered`, `insurancePolicyVersion`...) để không vỡ frontend; `maxCompensation` = số tiền đền **M4** của gói.
- `GET /orders/insurance-policy` trả thêm: `minimumFeeVnd` mỗi gói, `payoutRules` (từ bảng 6.2), `severities` (M1–M4 với định nghĩa và bằng chứng), `claimWindowHours`.

## 5. Dữ liệu (migration kế tiếp, dự kiến `033_insurance_payout_claims.sql`)

### 5.1 Quy tắc đền bù

```sql
CREATE TABLE IF NOT EXISTS insurance_payout_rule (
  rule_id INT AUTO_INCREMENT PRIMARY KEY,
  policy_version VARCHAR(20) NOT NULL,
  package_code ENUM('basic','standard','premium') NOT NULL,
  severity ENUM('M1','M2','M3','M4') NOT NULL,
  payout_type ENUM('percent_of_value','vet_cost_capped') NOT NULL,
  percent_bps INT NULL,
  cap_vnd BIGINT NULL,
  UNIQUE KEY uq_payout_rule (policy_version, package_code, severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Ý nghĩa:
- `percent_of_value`: đền `min(value × percent_bps/10000, cap_vnd ?? ∞)`.
- `vet_cost_capped`: đền `min(chi_phí_thú_y_thực_tế, trần)`, với `trần = cap_vnd` nếu có, ngược lại `value × percent_bps/10000`.

Seed `policy_version = 'equine-v2'` (đúng bảng C4.2):

| Gói | M1 | M2 | M3 | M4 |
|---|---|---|---|---|
| basic | vet_cost_capped, cap 5.000.000 | vet_cost_capped, cap 10.000.000 | percent 2000 bps, cap 50.000.000 | percent 10000 bps, cap 50.000.000 |
| standard | vet_cost_capped, percent 100 bps (1% giá trị), cap NULL | percent 1500 bps | percent 5000 bps | percent 8000 bps |
| premium | vet_cost_capped, percent 200 bps (2%), cap NULL | percent 3000 bps | percent 8000 bps | percent 10000 bps |

Chi phí thú y khẩn cấp trên đường (thêm bảng nhỏ hoặc cột trong `insurance_package_config`):
- basic: không; standard: tối đa 20.000.000; premium: toàn bộ chi phí thực tế.
Khuyến nghị: bảng `insurance_package_config(policy_version, package_code, fee_bps, minimum_fee_vnd, emergency_vet_cap_vnd NULL, emergency_vet_covered BOOLEAN, display_name_vi, display_name_en)` để `insurance-policy.ts` đọc cấu hình từ DB qua service (có cache), **và** giữ hằng số mặc định trong code làm dự phòng khi DB chưa migrate (để test đơn vị chạy không cần DB).

### 5.2 Yêu cầu bồi thường

```sql
CREATE TABLE IF NOT EXISTS insurance_claim (
  claim_id INT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  shipment_horse_id INT NOT NULL,
  customer_id INT NOT NULL,
  severity ENUM('M1','M2','M3','M4') NOT NULL,
  description TEXT NOT NULL,
  vet_cost_vnd BIGINT NULL,
  evidence_json JSON NULL,
  vet_report_document_id INT NULL,
  requested_amount BIGINT NOT NULL,
  suggested_amount BIGINT NOT NULL,
  approved_amount BIGINT NULL,
  policy_version VARCHAR(20) NOT NULL,
  package_code ENUM('basic','standard','premium') NOT NULL,
  declared_value_vnd BIGINT NOT NULL,
  status ENUM('submitted','under_review','approved','rejected','paid') NOT NULL DEFAULT 'submitted',
  rejection_reason_code VARCHAR(50) NULL,
  decision_reason TEXT NULL,
  decided_by INT NULL,
  decided_at DATETIME NULL,
  refund_record_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_claim_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_claim_customer FOREIGN KEY (customer_id) REFERENCES `user`(user_id),
  CONSTRAINT fk_claim_doc FOREIGN KEY (vet_report_document_id) REFERENCES transport_document(document_id),
  CONSTRAINT fk_claim_refund FOREIGN KEY (refund_record_id) REFERENCES shipment_refund_record(refund_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS insurance_claim_event (
  event_id INT AUTO_INCREMENT PRIMARY KEY,
  claim_id INT NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NOT NULL,
  actor_id INT NOT NULL,
  note TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_claim_event_claim FOREIGN KEY (claim_id) REFERENCES insurance_claim(claim_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- Kiểm tra tên khóa chính của `shipment_horse` và `transport_document` trước khi viết FK (có thể `shipment_horse_id`). Không thêm FK nếu cột đích không phải khóa.
- `insurance_claim_event` là **append-only** (lịch sử xử lý).
- Một `shipment_horse` chỉ có **một claim đang mở** (`submitted`/`under_review`) tại một thời điểm.

## 6. Hàm thuần (`backend/src/modules/orders/insurance-policy.ts`)

```ts
export type Severity = 'M1' | 'M2' | 'M3' | 'M4';
export interface PayoutRule { packageCode: InsurancePackage; severity: Severity; payoutType: 'percent_of_value' | 'vet_cost_capped'; percentBps: number | null; capVnd: number | null; }
export function calculateInsurance(...)   // giữ chữ ký cũ, tính theo cấu hình v2 + minimum
export function suggestPayout(input: { rule: PayoutRule; declaredValueVnd: number; vetCostVnd?: number | null }): { amount: number; explanation: string }
export function payoutTable(input: { packageCode: InsurancePackage; declaredValueVnd: number; rules: PayoutRule[] }): Record<Severity, { amount: number | null; label: string }>
export const DEFAULT_PAYOUT_RULES_V2: PayoutRule[]   // trùng bảng seed, dùng làm dự phòng và cho test
export const SEVERITY_DEFINITIONS: Record<Severity, { nameVi: string; nameEn: string; definitionVi: string; requiredEvidenceVi: string }>
```

- `vet_cost_capped` với `vetCostVnd` thiếu → `amount` = trần, `explanation` ghi "tối đa ..., cần hóa đơn thú y" (dùng cho bảng so sánh).
- `payoutTable` trả số tiền thật cho từng mức (bảng so sánh ở UI), với M1 hiển thị dạng "Chi phí thú y thực tế, tối đa X".
- Đặt `SEVERITY_DEFINITIONS` đúng nội dung C4.1 (định nghĩa + bằng chứng bắt buộc).

## 7. API claim

Tham số cấu hình: `.env.example` thêm `INSURANCE_CLAIM_WINDOW_HOURS=72` (mặc định 72). **Không đổi** cửa sổ tranh chấp bàn giao 24 giờ của Flow 6 (nếu đang hard-code, đưa thành hằng số có tên, giá trị vẫn 24).

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/orders/:id/insurance/payout-table` | Customer chủ đơn, Manager, Admin | Bảng đền bù bằng tiền cho từng ngựa của đơn theo snapshot gói và giá trị khai báo |
| POST | `/orders/:id/horses/:shipmentHorseId/claims` | Customer chủ đơn | multipart: `severity`, `description` (≥ 20 ký tự), `vetCostVnd?`, `requestedAmount`, `files[]` (ảnh/PDF ≤ 10MB mỗi file, tối đa 10 file, kiểm tra magic bytes bằng `verifyUploadedFileMagicBytes`, lưu `uploads/claims/`). Điều kiện: đơn đã bàn giao ngựa đó (có `delivery_handover` cho ngựa/đơn) hoặc đơn `completed`; thời điểm hiện tại ≤ thời điểm bàn giao + `INSURANCE_CLAIM_WINDOW_HOURS` (quá hạn → `409` "Đã quá 72 giờ kể từ bàn giao"); M4 cho phép trong lúc vận chuyển (sự cố tử vong) ngay cả khi chưa bàn giao. `suggested_amount` = `suggestPayout` theo rule của **policy_version trong snapshot** ngựa đó. Ghi event `submitted`. Thông báo Manager |
| GET | `/orders/:id/claims` | Customer chủ đơn, Manager, Admin | Danh sách claim của đơn |
| GET | `/insurance/claims?status=` | Manager, Admin | Danh sách toàn hệ thống |
| GET | `/insurance/claims/:claimId` | Chủ claim, Manager, Admin | Chi tiết + lịch sử event + tệp bằng chứng (stream có kiểm tra quyền, không public) |
| PATCH | `/insurance/claims/:claimId/review` | Manager, Admin | Body `{ decision: 'start_review' \| 'approve' \| 'reject', approvedAmount?, rejectionReasonCode?, reason }`. `reject` bắt buộc `rejectionReasonCode` ∈ {`pre_existing_condition`, `false_declaration`, `customer_caused`, `leg_not_operated_by_company`, `insufficient_evidence`, `out_of_window`, `other`} + `reason`. `approve`: `approvedAmount` ≤ trần theo rule (vượt → `400`); nếu `approvedAmount ≠ suggested_amount` thì `reason` bắt buộc. Khi duyệt: tạo **`shipment_refund_record`** (`cancellation_category = 'insurance_claim'`, `amount = approvedAmount`, `requires_dual_approval = approvedAmount ≥ 20.000.000`, trạng thái ban đầu theo đúng luồng hiện có) và gắn `refund_record_id`. Từ đây **tái sử dụng** `PATCH /orders/refunds/:refundId/approve` (duyệt kép) và `POST /orders/refunds/:refundId/transfer` (Admin, SoD `transferred_by != approved_by`). Khi refund `transferred` → claim `paid` (cập nhật trong cùng transaction của `transferRefund`, hoặc bằng hàm đồng bộ gọi sau khi chuyển; ghi event) |

- Trạng thái claim chỉ đi theo: `submitted → under_review → approved/rejected`, `approved → paid`. Sai → `409`.
- Kiểm tra quyền server-side: Customer khác chủ → `403`; Driver → `403`.
- Đọc `approveRefund`/`transferRefund` để chắc chắn chúng chấp nhận category mới mà không làm sai số liệu báo cáo hoàn tiền vận chuyển; nếu `reports-calculator.ts` cộng mọi refund vào "hoàn cước", tách riêng category `insurance_claim` thành dòng "Chi bồi thường bảo hiểm".

### Khóa đổi gói

- Không cho đổi gói/giá trị khai báo khi đơn đã `in_transit` (và `return_pending` nếu có Step 5) → `409`. Kiểm tra code hiện có đã chặn chưa; nếu chưa thì thêm.

## 8. Frontend

### 8.1 Bảng so sánh gói (`frontend/src/features/orders/components/InsuranceComparison.tsx`)

- Dùng trong bước chọn bảo hiểm của `customer/requests/new` (bên trong hoặc thay thế phần chọn gói hiện tại của `InsuranceSelection.tsx`; giữ nguyên dữ liệu gửi lên).
- Với **mỗi ngựa**, sau khi khách nhập giá trị khai báo: bảng 3 cột (Cơ bản / Tiêu chuẩn / Toàn diện) × các dòng:
  - Phí chuyến này (đã áp mức tối thiểu; khứ hồi thì ghi "× 2 × 0,9").
  - M1 Nhẹ: "Chi phí thú y thực tế, tối đa X đ".
  - M2 Trung bình, M3 Nặng / mất khả năng thi đấu, M4 Tử vong: số tiền đền bằng VND.
  - Thú y khẩn cấp trên đường: Không / tối đa 20.000.000 / Toàn bộ.
- Dòng tóm tắt dễ đọc kiểu: *"Ngựa Thunder (2.000.000.000 đ) · Gói Tiêu chuẩn: phí 30.000.000 đ; M3 đền 1.000.000.000 đ; M4 đền 1.600.000.000 đ."*
- Tooltip/khối giải thích M1–M4 lấy từ `severities` của API (định nghĩa + bằng chứng cần nộp), và các **loại trừ** C4.3.
- Số liệu lấy từ API (`/orders/insurance-policy` hoặc tính bằng `features/orders/insurance-policy.ts` cập nhật cho khớp v2). **Server vẫn là nguồn chính khi tạo đơn.**
- Responsive: trên điện thoại, mỗi gói là một thẻ xếp dọc thay vì bảng ngang.

### 8.2 Claim cho Customer

- `customer/requests/[id]`: sau bàn giao, mỗi ngựa có nút **"Yêu cầu bồi thường"** (ẩn khi quá hạn, hiện "Hết hạn yêu cầu lúc HH:mm dd/mm"). Modal: chọn mức M1–M4 (kèm định nghĩa), mô tả, chi phí thú y (nếu M1/M2), số tiền đề nghị (gợi ý sẵn bằng bảng đền bù), tải tệp bằng chứng. Sau gửi: hiện trạng thái claim và lịch sử.

### 8.3 Màn Manager `frontend/src/app/manager/insurance/claims/page.tsx`

- Danh sách lọc theo trạng thái; chi tiết claim: ngựa, gói, giá trị khai báo, mức độ, bằng chứng (mở tệp có xác thực), **số tiền gợi ý + giải thích**, ô số tiền duyệt, lý do; nút Bắt đầu xem xét / Duyệt / Từ chối (chọn mã lý do). Hiện cảnh báo "≥ 20 triệu cần duyệt kép và Admin chuyển khoản".
- Thêm menu "Bồi thường bảo hiểm" trong `navGroups` + CommandPalette + i18n.

## 9. Test bắt buộc (`backend/test/insurance-v2.test.cjs`, đăng ký `npm test`)

1. Phí: Tiêu chuẩn 2 tỷ → **30.000.000**; Tiêu chuẩn 50 triệu → 750.000 → áp tối thiểu **1.000.000**; Toàn diện 50 triệu → 1.500.000 → tối thiểu **2.000.000**; Cơ bản → 0; Tiêu chuẩn với giá trị 0 → lỗi.
2. `suggestPayout` / `payoutTable` với 2 tỷ: Tiêu chuẩn M3 = **1.000.000.000**, M4 = **1.600.000.000**; Toàn diện M4 = **2.000.000.000**; Cơ bản M4 = **50.000.000** (trần), Cơ bản M3 = min(20% × 2 tỷ, 50 triệu) = **50.000.000**; Tiêu chuẩn M1 với chi phí thú y 30 triệu → min(30 triệu, 1% × 2 tỷ = 20 triệu) = **20.000.000**; Cơ bản M1 chi phí 3 triệu → 3.000.000.
3. Khứ hồi: phí × 2 × 0,9.
4. Claim quá 72 giờ → `ConflictException`; khách khác chủ → `ForbiddenException`; claim thứ hai khi claim đầu đang mở → `ConflictException`.
5. Duyệt vượt trần → `BadRequestException`; duyệt khác gợi ý mà không có lý do → `BadRequestException`; từ chối thiếu mã lý do → `BadRequestException`.
6. Duyệt ≥ 20 triệu tạo refund record `requires_dual_approval = true`.
7. Chuyển trạng thái sai (vd `submitted → paid`) → `ConflictException`.
8. Đơn cũ snapshot `equine-v1` không bị tính lại phí.

## 10. Tài liệu

- `docs/equine-insurance-delivery.md`: viết lại theo v2 (bảng phí, M1–M4, quy tắc đền, claim, SoD).
- `docs/requirements.md`: **xóa mâu thuẫn** (bỏ con số 0,5% / 1,2% / 2,5% nếu còn), chỉ giữ một nguồn sự thật là bảng C4.2.
- `filethongtin.md` mục 5.1: file này là **file người dùng chưa commit**. Chỉ sửa đúng mục 5.1 cho khớp v2, không đụng phần khác, và **ghi rõ trong báo cáo** để người dùng tự xem lại.
- `docs/flows/flow-6-*` (nếu có): phân biệt cửa sổ tranh chấp bàn giao 24 giờ và cửa sổ claim bảo hiểm 72 giờ.
- `docs/api-documentation.md`, `docs/erd.md`, `docs/actors-and-roles.md` (thêm dòng RACI "Xử lý claim bảo hiểm": Customer R gửi, Manager R/A duyệt, Admin R chuyển khoản), `.env.example`, file định hướng (trạng thái Step 6).

## 11. Tiêu chí hoàn thành

- [ ] Khách thấy rõ phí và số tiền đền M1–M4 bằng VND cho từng ngựa trước khi đặt.
- [ ] Manager xử lý một claim từ đầu đến cuối; số tiền gợi ý đúng rule; ≥ 20 triệu duyệt kép; Admin chuyển, người chuyển trùng người duyệt bị 403; claim chuyển `paid`.
- [ ] Quy tắc đền bù nằm trong DB, đổi được mà không sửa code.
- [ ] Đơn cũ không đổi phí; test cũ vẫn pass.
- [ ] Mọi lệnh kiểm tra đạt; báo cáo theo mẫu.

## 12. Bẫy thường gặp

- `calculateInsurance` đang được gọi ở nhiều nơi (tạo đơn, sửa đơn, báo giá Step 4). Giữ chữ ký, chỉ đổi phần tính phí.
- Áp mức tối thiểu cho từng **ngựa (đơn vị)** trước khi nhân `quantity`.
- Không áp mức tối thiểu cho gói Cơ bản.
- Báo cáo doanh thu không được tính phí bảo hiểm thành cước vận chuyển và không được tính chi bồi thường thành hoàn cước.
