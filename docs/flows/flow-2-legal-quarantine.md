# Flow 2: Legal, Quarantine, and Customs Documents (Required)

> **Cập nhật sau review 11/2026:** Transport Specialist và Fleet & Route Coordinator đã gộp vào **Logistics Manager** (xem `docs/actors-and-roles.md`). Trong tài liệu này, mọi chỗ ghi Specialist/Coordinator được hiểu là Logistics Manager; role `TRANSPORT_SPECIALIST`/`FLEET_ROUTE_COORDINATOR` chỉ còn để tương thích dữ liệu cũ.

## Actors

Transport Specialist, Customer, Logistics Manager, external authorities

## Main path

1. The system identifies required documents from origin, destination country, border gate, transport mode, and horse profile.
2. Transport Specialist maintains the applicable medical, quarantine, customs, and permit requirements.
3. Customer uploads a digital file for each horse, such as vaccination certificate, horse passport, and import/export permit.
4. Specialist reviews each document as `PENDING`, `ACCEPTED`, `REJECTED`, or `EXPIRED`, with reason and expiry date.
5. Specialist records authority submission and approval progress for agriculture, customs, and quarantine agencies.
6. The system notifies the customer about missing, rejected, or soon-to-expire documents before departure.

## Key rules

- Requirements are evaluated per horse and per transport order.
- A document cannot be marked accepted without type, owner horse, issue/expiry information where applicable, and review history.
- The trip cannot reach `READY_TO_DEPART` while mandatory documents are missing, rejected, or expired.
- Customers can upload and replace their own documents; only the Transport Specialist can accept them.

## Outputs

Document checklist, authority approval status, missing-document notifications, and a compliance readiness result.

**Owner:** `backend/src/modules/documents`  
**Supporting module:** `backend/src/modules/auth`  
**Primary UI:** `frontend/src/app/specialist`, `frontend/src/app/customer`, `frontend/src/app/manager`

## Payment and departure

Document completion is a departure requirement, not the payment trigger. A confirmed Flow 3 plan opens payment independently of Flow 2 completion. Reviewing or replacing documents refreshes departure readiness; approved documents must remain valid. Missing/invalid compliance prevents departure even after payment.

## Chuẩn hóa Tuân thủ Đa chiều, 2 Tầng Hồ sơ & Runtime Expiry (`DEC-03` Approved — `Target Spec v3.1 (Planned)`)

> [!IMPORTANT]
> Phân quyền thao tác tuân thủ Ma trận RACI tại [actors-and-roles.md](file:///f:/SWP/Project/SWP391_GROUP1/docs/actors-and-roles.md).

### Quy tắc Nghiệp vụ Chi tiết (`BR-F2-01` → `BR-F2-06`)

- **`BR-F2-01` (Ma trận Quy định Đa chiều & `lead_time_days` Động — Gap G2):** Bảng `regulation` mở rộng bộ khóa `(country, border_gate, transport_mode, document_type, doc_tier [A|B], lead_time_days, requires_authority_approval, min_validity_buffer_hours)`. Checklist tự động lọc theo quốc gia, cửa khẩu/sân bay và phương thức vận tải của chuyến.
- **`BR-F2-02` (Hiệu lực Xuyên suốt Hành trình + Biên An toàn):** Mọi hồ sơ bắt buộc thỏa `expiry_datetime >= expected_arrival_datetime + safety_buffer` (`24h` nội địa / `48h` quốc tế, hoặc `min_validity_buffer_hours` cấu hình trên quy định). Giấy Tầng B ngắn hạn (48–72h nội địa) chỉ được cấp từ `D - 1` (`T - 24h` → `T - 6h`); giấy Tầng B quốc tế (7–10 ngày) cấp trong `D - 2` → `D - 1`.
- **`BR-F2-03` (Đánh giá Tuân thủ 2 Tầng):**
  - Quy định `requires_authority_approval = false`: đạt khi `transport_document.status = approved`.
  - Quy định `requires_authority_approval = true` (Giấy phép xuất/nhập khẩu, Kiểm dịch động vật): **chỉ đạt** khi cả `transport_document.status = approved` **VÀ** có `document_approval.status = approved` từ cơ quan chức năng tương ứng.
- **`BR-F2-04` (Đánh giá Cấp Cá thể & Bảo toàn Lịch sử):** `isFullyCompliant = true` chỉ khi 100% ngựa trong đơn đạt 100% quy định bắt buộc; tải bản thay thế giữ nguyên bản cũ (`rejected`/`expired`) để truy vết.
- **`BR-F2-05` (Nhắc Hạn Động Đồng nhất):** Hạn nộp Tầng A tự động tính theo công thức `departure_date - MAX(base_days [2 cho shared / 1 cho charter], MAX(regulation.lead_time_days))`; nhắc Tầng B trước `D - 1` và cảnh báo ngay khi hồ sơ bị từ chối hoặc sắp hết hạn.
- **`BR-F2-06` (Xử lý Hồ sơ Hết hạn khi Đang `in_transit` — Runtime Expiry):** Khi một giấy tờ bị đổi sang `expired` hoặc quá hạn trong lúc chuyến đang `in_transit`:
  1. **Tuyệt đối không rollback** `shipment.status` về `confirmed` hay `ready_to_depart`.
  2. Bật cờ `in_transit_compliance_alert = true` và phát **Red Alert** tới Specialist, Coordinator và Manager.
  3. Chặn check-in `customs_cleared` tại trạm biên giới/kiểm dịch sắp tới (`422 Unprocessable Entity`) cho tới khi Specialist tải lên hồ sơ gia hạn được duyệt hoặc xử lý qua sự cố `border_issue` (Flow 5).

### Acceptance Criteria (BDD — Flow 2)

- **AC-F2-01 (Tuân thủ 2 Tầng & Lead Time Động):** *Given* quy định `import_permit` Singapore có `border_gate = SIN`, `requires_authority_approval = true`, `lead_time_days = 3` (hoặc cấu hình động theo từng quốc gia). *When* đơn khởi hành sau 10 ngày, Specialist duyệt nội bộ nhưng AVS vẫn `pending`. *Then* hạn Tầng A hiển thị `D - 3` (theo `MAX(base_days, lead_time_days)`), `isFullyCompliant = false` và Gate 2 chặn `ready_to_depart`.
- **AC-F2-02 (Hết hạn Trước giờ Chạy):** *Given* đơn `ready_to_depart` đã trả SePay `succeeded`. *When* dời lịch làm `expected_arrival_datetime + 48h` vượt `expiry_datetime` giấy Tầng B (hoặc chuyển giấy tờ sang `expired`). *Then* hạ đơn về `confirmed`, API xuất phát trả `422 Unprocessable Entity` và thông báo Specialist, Coordinator, Customer.
- **AC-F2-03 (Hết hạn khi Đang `in_transit`):** *Given* đơn đang `in_transit` trước trạm `border_check`. *When* giấy Tầng B bị đánh dấu `expired`. *Then* giữ nguyên `in_transit`, bật `in_transit_compliance_alert = true`, bắn Red Alert, và thao tác `customs_cleared` tại trạm biên giới bị chặn với `422 Unprocessable Entity`.
