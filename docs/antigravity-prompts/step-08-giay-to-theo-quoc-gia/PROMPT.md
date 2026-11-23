# PROMPT STEP 8: Giấy tờ theo quốc gia ngay khi tạo đơn, dùng lại giấy còn hạn, Manager duyệt, job hết hạn

## 0. Vai trò và mục tiêu

Bạn là kỹ sư full-stack trong repo EquiTransit. Nhiệm vụ: triển khai **Step 8** của `docs/dinh-huong-phat-trien-sau-review.md`.

Góp ý hội đồng (G4c): *"Chọn nước đến thì hiện giấy tờ cần nộp; cấu hình sẵn theo quốc gia; Manager duyệt, kiểm tra thời hạn."*

Kết quả cuối:
- Khi khách chọn **quốc gia đến + phương thức**, hệ thống hiện ngay danh sách giấy tờ cần có **cho từng ngựa**, đánh dấu cái nào **dùng lại được** (đã có trên hồ sơ ngựa, còn hạn đến hết chuyến + biên an toàn), cái nào **sắp hết hạn / hết hạn / thiếu**, kèm hạn nộp.
- Khách tải giấy thiếu ngay trong luồng tạo đơn (vào kho giấy tờ của ngựa từ Step 2). Cho phép **nộp sau** với giấy còn trong thời hạn chuẩn bị.
- Chặn đặt ngày đi quá gần (không kịp chuẩn bị giấy tờ).
- Checklist của đơn **công nhận giấy chung của ngựa** (khớp theo `document_type_code`), không bắt nộp lại.
- Manager duyệt từng giấy (đối chiếu microchip, số hộ chiếu, ngày cấp, hạn), từ chối bắt buộc lý do, có lịch sử duyệt.
- Job hằng ngày: đánh dấu hết hạn, nhắc trước 30/7/1 ngày, đơn `ready_to_depart` có giấy Tier A hết hạn quay về `planning`.

## 1. Bắt buộc đọc trước

1. `docs/antigravity-prompts/_COMMON.md`.
2. `AGENTS.md`.
3. File định hướng: **C6** (sơ đồ luồng giấy tờ), **STEP 8**, **B1** (thời gian chuẩn bị quốc tế), mục về Thông tư 25/2016/TT-BNNPTNT (cần kiểm tra hiệu lực, có thể đã thay bằng 01/2026/TT-BNNMT).
4. `docs/flows/flow-2-legal-quarantine.md` (toàn bộ, gồm `BR-F2-01` → `BR-F2-06`, 2 tầng hồ sơ Tier A/B, runtime expiry), `docs/requirements.md`.
5. Code `backend/src/modules/documents/` **toàn bộ**: `documents.service.ts` (`getOrderComplianceChecklist`, `computeOrderCutoffPolicy`, `evaluateDocumentExpiry`, `isDocumentApprovedForCompliance`, `reviewDocument`, `recordAuthorityApproval`, `flagInTransitComplianceAlert`, `checkAndNotifyManagerWhenFlow2Completed`, `detectDestinationCountry`), `documents.store.ts`, `documents.types.ts`, `constants/regulation-presets.constant.ts` (`seedInitialRegulations`), `horse-documents.controller.ts`, `document-validity.policy.ts` (Step 2).
6. `backend/src/modules/orders/orders.service.ts` (`assertValidRequestedDate`, cutoff), service báo giá (Step 4), luồng tạo đơn `prepaid` (Step 7).
7. `backend/src/modules/routes/routes.service.ts` (`evaluateReadyToDepartGate`), `orders/sla-monitor.service.ts` (mẫu job `setInterval`).
8. Frontend: `app/customer/requests/new/page.tsx`, `features/documents/components/HorseDocumentVault.tsx` + `DocumentUploadModal.tsx`, `app/manager/compliance/*` (các trang duyệt giấy tờ), `features/documents/components/DocumentReviewModal.tsx`.

## 2. Điều kiện tiên quyết

- Step 2 (kho giấy tờ của ngựa, `document_type`, `transport_document.document_type_code`).
- Step 7 (luồng `prepaid`, trạng thái mới) — **khuyến nghị**. Nếu Step 7 chưa có, vẫn làm được phần yêu cầu giấy tờ và duyệt; phần "cảnh báo trước khi thanh toán" chuyển thành "cảnh báo trước khi gửi đơn". Ghi rõ.
- Step 4 đã thêm mode `sea` vào `regulation.transport_mode`. Nếu chưa, thêm trong migration của Step này.

## 3. Phạm vi

**Làm:** 8.1 → 8.7 như dưới. **Không làm:** tích hợp cơ quan nhà nước thật; OCR giấy tờ.

## 4. Dữ liệu (migration kế tiếp, dự kiến `035_country_document_requirements.sql`)

### 4.1 `regulation`

Thêm (idempotent):
- `document_type_code VARCHAR(50) NULL` + FK tới `document_type(code)`.
- `max_issue_age_days INT NULL` — giấy phải được cấp **không sớm hơn** N ngày trước ngày khởi hành (vd giấy chứng nhận sức khỏe: 10 ngày).
- `is_active BOOLEAN NOT NULL DEFAULT TRUE` (nếu chưa có).
- `legal_reference VARCHAR(255) NULL`, `is_demo_data BOOLEAN NOT NULL DEFAULT TRUE`.
- `transport_mode` có `'sea'` (nếu Step 4 chưa thêm).
- Backfill `document_type_code` cho dòng cũ: `UPDATE regulation r JOIN document_type t ON t.code = r.document_type SET r.document_type_code = t.code WHERE r.document_type_code IS NULL`.

### 4.2 Seed yêu cầu demo (7 quốc gia × phương thức)

Viết dạng `INSERT ... SELECT ... WHERE NOT EXISTS` (khóa logic: `country + transport_mode + document_type_code + COALESCE(border_gate,'')`), `is_demo_data = TRUE`, `legal_reference` ghi nguồn tham khảo hoặc "Dữ liệu demo — cần đối chiếu cơ quan thú y". Đồng thời cập nhật `constants/regulation-presets.constant.ts` để `seedInitialRegulations` (chạy lúc khởi động) **không tạo trùng** và có `documentTypeCode`, `maxIssueAgeDays`.

Bảng seed gợi ý (giá trị demo hợp lý, chỉnh nếu code hiện có đã có preset tốt hơn; giữ nguyên tắc):

| Quốc gia | Mode | Giấy tờ (`document_type_code`) | Tier | lead_time_days | max_issue_age_days | requires_authority_approval |
|---|---|---|---|---|---|---|
| Vietnam (nội địa) | road | horse_passport | A | 2 | — | no |
| Vietnam (nội địa) | road | health_certificate | B | 1 | 3 | no |
| Vietnam (nội địa) | sea | horse_passport, health_certificate (như road) | A/B | 2/1 | —/3 | no |
| Cambodia, Laos, Thailand | road, both | horse_passport | A | 7 | — | no |
| Cambodia, Laos, Thailand | road, both | vaccination_influenza | A | 7 | — | no |
| Cambodia, Laos, Thailand | road, both | eia_coggins_test | A | 10 | 90 | no |
| Cambodia, Laos, Thailand | road, both | export_quarantine_certificate | B | 7 | 10 | yes |
| Cambodia, Laos, Thailand | road, both | import_permit | A | 14 | — | yes |
| Singapore, Malaysia, Hong Kong | air, sea | horse_passport | A | 14 | — | no |
| Singapore, Malaysia, Hong Kong | air, sea | microchip_certificate | A | 14 | — | no |
| Singapore, Malaysia, Hong Kong | air, sea | vaccination_influenza | A | 14 | — | no |
| Singapore, Malaysia, Hong Kong | air, sea | eia_coggins_test | A | 21 | 60 | no |
| Singapore, Malaysia, Hong Kong | air, sea | health_certificate | B | 3 | 10 | no |
| Singapore, Malaysia, Hong Kong | air, sea | export_quarantine_certificate | B | 7 | 10 | yes |
| Singapore, Malaysia, Hong Kong | air, sea | import_permit | A | 21 | — | yes |

`min_validity_buffer_hours`: quốc tế 48, nội địa 24 (theo quy tắc hiện có).

### 4.3 Lịch sử duyệt giấy tờ (append-only)

```sql
CREATE TABLE IF NOT EXISTS document_review_log (
  review_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  from_status VARCHAR(20) NOT NULL,
  to_status VARCHAR(20) NOT NULL,
  reviewer_id INT NULL,                 -- NULL = job hệ thống (hết hạn)
  reason TEXT NULL,
  checked_fields_json JSON NULL,        -- {"microchipMatches":true,"passportMatches":true,"issueDateOk":true,"expiryOk":true}
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_drl_document FOREIGN KEY (document_id) REFERENCES transport_document(document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS document_expiry_notice (
  notice_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  days_before INT NOT NULL,             -- 30, 7, 1, 0 (= đã hết hạn)
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_doc_notice (document_id, days_before),
  CONSTRAINT fk_den_document FOREIGN KEY (document_id) REFERENCES transport_document(document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- `transport_document` thêm `reviewed_by INT NULL`, `reviewed_at DATETIME NULL` (bản tóm tắt lần duyệt gần nhất; lịch sử đầy đủ ở `document_review_log`).

## 5. Hàm thuần `backend/src/modules/documents/requirement-policy.ts`

```ts
export type RequirementStatus = 'reusable' | 'pending_review' | 'expiring' | 'expired' | 'issued_too_early' | 'missing';
export interface RequirementEvaluationInput {
  requirement: { regulationId: number; documentTypeCode: string; tier: 'A' | 'B'; leadTimeDays: number; maxIssueAgeDays: number | null; minValidityBufferHours: number };
  document: { id: number; status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'expired'; issueDate: string | null; expiryDate: string | null } | null;
  departureAt: Date;
  tripEndAt: Date;          // ngày đến dự kiến; khứ hồi = ngày về dự kiến kết thúc
  now: Date;
}
export interface RequirementEvaluation {
  status: RequirementStatus;
  submitDeadline: string;       // = departureAt − leadTimeDays (ISO date, theo Asia/Ho_Chi_Minh)
  earliestIssueDate: string | null;   // = departureAt − maxIssueAgeDays (nếu có)
  canSubmitLater: boolean;      // true nếu now < submitDeadline
  reasonVi: string;             // câu giải thích ngắn cho UI
}
export function evaluateRequirement(input): RequirementEvaluation;
export function earliestFeasibleDeparture(requirements, now): Date;   // = now + max(leadTimeDays) theo ngày, làm tròn lên đầu ngày
```

Quy tắc (theo thứ tự ưu tiên):
1. Không có giấy (hoặc giấy `rejected`/đã lưu trữ) → `missing`.
2. Có `maxIssueAgeDays` và `issueDate < departureAt − maxIssueAgeDays` → `issued_too_early` (phải xin cấp lại gần ngày đi hơn; `earliestIssueDate` cho biết từ ngày nào).
3. `expiryDate` có và `expiryDate (cuối ngày) < tripEndAt + minValidityBufferHours` → `expired` (không đủ hạn cho chuyến; dùng lại logic `evaluateDocumentExpiry` hiện có nếu phù hợp, tránh viết 2 nơi khác nhau).
4. Giấy `submitted` (chưa duyệt) và đủ hạn → `pending_review`.
5. Giấy `approved`, đủ hạn, nhưng hết hạn trong vòng 30 ngày sau `tripEndAt` → `expiring` (vẫn dùng được, cảnh báo vàng).
6. Còn lại (`approved`, đủ hạn) → `reusable`.

Ghi comment giải thích (logic kiểm dịch nhiều bước — `AGENTS.md` yêu cầu comment cho phần này).

## 6. API

### 6.1 `GET /compliance/requirements`

Đặt trong module `documents` (controller mới `compliance.controller.ts` với `@Controller('compliance')`). Quyền: Customer (chỉ ngựa của mình), Manager, Admin.

Query: `country` (bắt buộc), `mode` (`road|air|sea`), `horseIds` (danh sách, vd `1,2,3`), `departDate` (YYYY-MM-DD), `returnDate?` (khứ hồi), `borderGate?`.

- Áp dụng quy định có `country` khớp (dùng chuẩn hóa tên quốc gia hiện có, vd `detectDestinationCountry`/`normalizeCountryName`) và `transport_mode IN (mode, 'both')`, `is_active = TRUE`. Quốc gia không có cấu hình → dùng bộ **cơ sở toàn cầu** hiện có trong code (nếu có, `isUsingGlobalBaseline`) và trả cờ `usingGlobalBaseline: true`.
- Mỗi ngựa: tìm giấy **đang hiệu lực mới nhất** theo `document_type_code` trên hồ sơ ngựa (cả giấy chung `regulation_id IS NULL` lẫn giấy nộp theo quy định trước đó); đánh giá bằng `evaluateRequirement`.
- Ngựa không thuộc khách → `403`.

Response:

```json
{
  "country": "Singapore", "mode": "air", "usingGlobalBaseline": false,
  "departureDate": "2026-12-20", "tripEndDate": "2026-12-21",
  "earliestFeasibleDeparture": "2026-12-15",
  "isDepartureFeasible": true,
  "horses": [
    { "horseId": 12, "horseName": "Thunder", "microchipNo": "...", "passportNo": "...",
      "requirements": [
        { "regulationId": 40, "documentTypeCode": "horse_passport", "documentTypeName": "Hộ chiếu ngựa", "tier": "A",
          "status": "reusable", "documentId": 88, "expiryDate": "2030-01-01", "submitDeadline": "2026-12-06",
          "earliestIssueDate": null, "canSubmitLater": true, "requiresAuthorityApproval": false, "reasonVi": "Dùng lại hộ chiếu còn hạn đến 01/01/2030" }
      ] }
  ],
  "summary": { "reusable": 3, "pendingReview": 1, "missing": 2, "expired": 0, "blocking": ["..."] }
}
```

### 6.2 Checklist đơn công nhận giấy chung

Sửa `getOrderComplianceChecklist` (hiện chỉ đối chiếu theo `regulation_id`): một quy định được coi là **đã có giấy** nếu tồn tại giấy của ngựa đó với cùng `document_type_code` (kể cả `regulation_id IS NULL`), đánh giá bằng cùng `evaluateRequirement`. Giữ nguyên các field response cũ; thêm `matchedBy: 'regulation' | 'document_type'` cho mỗi giấy. Đảm bảo test cũ của checklist vẫn pass (sửa có chủ đích thì ghi lý do).

### 6.3 Chặn ngày đi quá gần

- Báo giá (Step 4) và tạo đơn: nếu `departDate < earliestFeasibleDeparture` → `422` với `code: 'DOCUMENT_LEAD_TIME_VIOLATION'`, `earliestFeasibleDeparture`, thông báo "Không kịp chuẩn bị giấy tờ cho [quốc gia], chọn ngày từ dd/mm". Kết hợp (lấy max) với chính sách cutoff hiện có (`computeOrderCutoffPolicy`), không tạo hai quy tắc mâu thuẫn.
- Riêng giấy **đã có và dùng lại được** thì không tính vào lead time (chỉ giấy còn thiếu mới cần thời gian chuẩn bị) — `earliestFeasibleDeparture` tính trên các yêu cầu có trạng thái `missing`/`expired`/`issued_too_early`.

### 6.4 Duyệt giấy tờ (Manager)

- `PATCH /documents/:id/review` (đã có): bổ sung body `checkedFields { microchipMatches, passportMatches, issueDateOk, expiryOk }`. `approved` yêu cầu tất cả `true`; nếu có trường `false` thì chỉ được `rejected`. `rejected` bắt buộc `notes` (đã có) — giữ. Ghi `document_review_log`, `reviewed_by`, `reviewed_at`.
- Giữ thứ tự trạng thái: `submitted → approved | rejected`, `approved → expired` (chỉ job), giấy `rejected` không duyệt lại được (khách phải tải bản mới — tạo phiên bản mới như Step 2). Chuyển sai → `409`.
- Thông báo khách khi giấy bị từ chối (kèm lý do) và khi được duyệt.

### 6.5 Job hằng ngày

Service mới `documents/document-expiry-monitor.service.ts` (mẫu `setInterval` như `sla-monitor`), chạy **mỗi giờ**, xử lý idempotent (bảng `document_expiry_notice` chống gửi trùng):
- Giấy `approved` có `expiry_date < hôm nay (Asia/Ho_Chi_Minh)` → `status = 'expired'`, ghi `document_review_log` (reviewer NULL, reason "Hết hạn tự động").
- Nhắc chủ ngựa trước 30, 7, 1 ngày (theo giấy `approved` còn hiệu lực).
- Đơn ở `ready_to_depart` có giấy Tier A bắt buộc không còn hợp lệ cho chuyến → chuyển về `planning` (qua `order-state-machine.ts` của Step 7 nếu có), thông báo Manager và khách. Đơn `in_transit`: **giữ quy tắc runtime hiện có** (`flagInTransitComplianceAlert`), không đổi trạng thái.
- Có endpoint chạy tay cho demo: `POST /compliance/run-expiry-sweep` (Manager, Admin).

## 7. Frontend

### 7.1 Bước "Giấy tờ cần chuẩn bị" trong `customer/requests/new`

- Sau khi chọn điểm đến (quốc gia) + phương thức + ngựa + ngày đi → gọi `GET /compliance/requirements` → hiện **bước/khối mới** trước bước thanh toán/xác nhận.
- Mỗi ngựa là một thẻ; mỗi giấy là một dòng: tên giấy, Tier (A = bắt buộc trước khởi hành; B = cấp sát ngày), trạng thái bằng **badge màu + chữ** (Dùng lại được / Đang chờ duyệt / Sắp hết hạn / Hết hạn / Cấp quá sớm / Thiếu), hạn nộp, "cần cơ quan chức năng duyệt" nếu có.
- Giấy `reusable`: tick sẵn "Dùng lại giấy này" (chỉ hiển thị, không cần thao tác).
- Giấy `missing`/`expired`/`issued_too_early`: nút **"Tải lên"** mở modal tải lên vào kho giấy tờ ngựa (`POST /horses/:id/documents` — tái sử dụng modal của `HorseDocumentVault`, tách ra thành component dùng chung nếu cần); sau tải lên gọi lại API yêu cầu. Nếu `canSubmitLater` → nút phụ **"Nộp sau (trước dd/mm)"** để đi tiếp.
- Ngày đi không khả thi → khối cảnh báo đỏ "Không kịp chuẩn bị giấy tờ cho Singapore, chọn ngày từ 15/12" + nút đổi ngày (đặt sẵn ngày sớm nhất). Khóa nút thanh toán/gửi đơn.
- Logic + type đặt ở `frontend/src/features/documents/` (vd `requirements-api.ts`, `components/RequirementChecklist.tsx`).

### 7.2 Manager duyệt

- `app/manager/compliance/*` + `DocumentReviewModal.tsx`: hiển thị cạnh nhau thông tin trên giấy (số giấy, ngày cấp, hạn, tệp) và thông tin ngựa trong hệ thống (microchip, số hộ chiếu, tên); 4 checkbox đối chiếu; nút Duyệt chỉ bật khi đủ 4 tick; Từ chối bắt buộc lý do; tab **Lịch sử duyệt** (từ `document_review_log`).
- Trang cấu hình quy định (`manager/compliance/regulations`): thêm cột/ô `document_type_code` (chọn từ danh mục), `max_issue_age_days`, `legal_reference`, cờ "Dữ liệu demo"; hiện cảnh báo "Dữ liệu demo, cần đối chiếu với cơ quan thú y/hải quan trước khi dùng thật".

## 8. Test bắt buộc (`backend/test/country-requirements.test.cjs`, đăng ký `npm test`)

1. `evaluateRequirement`: đủ 6 trạng thái, mỗi trạng thái ít nhất một ca; biên `max_issue_age_days` (cấp đúng 10 ngày trước → hợp lệ, 11 ngày → `issued_too_early`); biên hạn = ngày về + 48 giờ.
2. Khứ hồi: giấy hết hạn **sau ngày đến nhưng trước ngày về** → `expired` khi có `returnDate`.
3. `earliestFeasibleDeparture` chỉ tính yêu cầu còn thiếu; giấy dùng lại được không làm lùi ngày.
4. `GET /compliance/requirements` với ngựa của người khác → `ForbiddenException`.
5. Checklist đơn công nhận giấy chung có cùng `document_type_code` (không cần nộp lại).
6. Duyệt `approved` khi có `checkedFields` false → `BadRequestException`; duyệt giấy `rejected` → `ConflictException`; mỗi lần duyệt ghi `document_review_log`.
7. Job: giấy quá hạn → `expired` + log; chạy 2 lần không gửi nhắc trùng; đơn `ready_to_depart` có giấy Tier A hết hạn → `planning`; đơn `in_transit` không đổi trạng thái.
8. Tạo đơn/báo giá với ngày đi quá gần → `UnprocessableEntityException` có `code = 'DOCUMENT_LEAD_TIME_VIOLATION'`.

## 9. Tài liệu

- **Viết lại** `docs/flows/flow-2-legal-quarantine.md` theo luồng mới (C6): yêu cầu theo quốc gia × mode, 6 trạng thái, dùng lại giấy chung, nộp sau, chặn ngày đi, duyệt 4 điểm đối chiếu, lịch sử duyệt, job hết hạn/nhắc. Giữ phần BR/AC cũ còn đúng, đánh dấu phần đã thay thế.
- `docs/api-documentation.md`, `docs/erd.md`, `docs/requirements.md`, `docs/actors-and-roles.md` (nếu thêm quyền), file định hướng (trạng thái Step 8).

## 10. Tiêu chí hoàn thành

- [ ] Chọn "Singapore + air" thì hiện đúng danh sách cho từng ngựa.
- [ ] Ngựa đã có hộ chiếu còn hạn thì không phải nộp lại; checklist đơn công nhận.
- [ ] Giấy hết hạn trước ngày về (khứ hồi) bị đánh `expired`.
- [ ] Ngày đi quá gần bị chặn kèm ngày sớm nhất.
- [ ] Manager duyệt có đối chiếu, từ chối có lý do, có lịch sử.
- [ ] Job hết hạn và nhắc chạy idempotent.
- [ ] Mọi lệnh kiểm tra đạt; báo cáo theo mẫu.

## 11. Bẫy thường gặp

- Tên quốc gia không thống nhất ("Singapore" / "SG" / "Xin-ga-po"): dùng một hàm chuẩn hóa duy nhất.
- So sánh ngày hết hạn: giấy hết hạn **cuối ngày** `expiry_date` (theo `Asia/Ho_Chi_Minh`), không phải 00:00 UTC.
- `seedInitialRegulations` chạy mỗi lần khởi động: đảm bảo không nhân đôi dữ liệu seed của migration.
- Không làm mất giấy tờ cũ gắn `regulation_id`; chỉ mở rộng cách khớp.
