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
- Phê duyệt nội bộ chỉ thực hiện qua màn thẩm định có checklist 4 tiêu chí (microchip, hộ chiếu, ngày cấp, hạn dùng) và ngày hết hạn đúng như in trên giấy. Không có duyệt nhanh/duyệt hàng loạt, và hệ thống không tự sinh ngày hết hạn.
- Kết quả cơ quan chức năng (`POST /documents/:id/authority-approval`) là tầng thứ 2, được ghi riêng và không thay thế bước thẩm định nội bộ:
  - `approved` chỉ được ghi khi tài liệu đã `approved` nội bộ; nếu chưa thì trả `409`. Ghi nhận này không đổi trạng thái tài liệu.
  - `rejected` chuyển tài liệu sang `rejected`, lưu người ghi nhận và review log.
  - `pending` (đã nộp cơ quan) được ghi khi tài liệu còn `submitted` hoặc `approved`.
  - Tài liệu đã bị thay thế, `rejected` hoặc `expired` không nhận thêm kết quả nào (`409`); khách phải tải bản mới.
  - Frontend không tự sinh bản ghi cơ quan chức năng; chỉ ghi khi người dùng nhập tên cơ quan.
- Trang giấy tờ của khách hiển thị riêng trạng thái `expired` (bộ lọc, cảnh báo, nút "Nộp lại tệp").

### Kho giấy tờ của ngựa (Step 2, review 11/2026)

- Giấy tờ **thuộc về con ngựa** và dùng lại cho nhiều đơn. Khách tải hộ chiếu một lần trên trang hồ sơ ngựa (`/customer/horses/[id]`); không cần tải lại cho từng đơn.
- Mỗi giấy tờ có **loại chuẩn hóa** từ danh mục `document_type` (hộ chiếu, vi mạch, quyền sở hữu, tiêm cúm, tiêm uốn ván, EIA/Coggins, sức khỏe, kiểm dịch xuất khẩu, giấy phép nhập khẩu...). Giấy tờ chung có `regulation_id = NULL`.
- Bỏ trống ngày hết hạn thì hệ thống tính bằng ngày cấp cộng thời hạn mặc định của loại giấy tờ. Ngày hết hạn trước ngày cấp bị từ chối.
- **Trạng thái hạn tính khi đọc**: `valid` (xanh), `expiring_soon` (vàng, còn dưới 30 ngày), `expired` (đỏ), `no_expiry`. Ngày hết hạn vẫn còn hiệu lực trọn ngày đó.
- **Append-only**: tải bản mới cùng loại thì bản cũ được lưu trữ (`is_archived`) và trỏ `superseded_by_document_id` sang bản mới. Lịch sử phiên bản luôn xem lại được.
- Bản mới có trạng thái `submitted`; Logistics Manager duyệt hoặc từ chối (bắt buộc lý do) như giấy tờ theo đơn.
- Quyền: Customer chỉ xem và tải giấy tờ ngựa của mình (`403` nếu khác chủ); Manager/Admin xem mọi ngựa; Driver/Escort không truy cập kho này.
- Giới hạn của Step 2: checklist đơn hàng vẫn đối chiếu theo `regulation_id`. Việc dùng lại giấy tờ chung còn hạn theo `document_type_code` khi tạo đơn được làm ở Step 8.

## Outputs

Document checklist, authority approval status, missing-document notifications, and a compliance readiness result.

**Owner:** `backend/src/modules/documents`  
**Supporting module:** `backend/src/modules/auth`  
**Primary UI:** `frontend/src/app/specialist`, `frontend/src/app/customer`, `frontend/src/app/manager`

## Payment and departure

Document completion is a departure requirement, not the payment trigger. A confirmed Flow 3 plan opens payment independently of Flow 2 completion. Reviewing or replacing documents refreshes departure readiness; approved documents must remain valid. Missing/invalid compliance prevents departure even after payment.

## Đơn giản hóa Kiểm duyệt theo Cách A (Cập nhật 11/2026)

- **Bỏ phân tách Tầng A / Tầng B trên nghiệp vụ & giao diện:** Hệ thống gộp toàn bộ danh mục giấy tờ của quốc gia đích thành **1 danh sách thống nhất** (cột `regulation.doc_tier` vẫn giữ nguyên trong CSDL để bảo toàn `schema-parity`, mặc định `'A'`).
- **Không chặn ngày khởi hành theo `lead_time_days` hay báo lỗi "cấp quá sớm" (`issued_too_early`):** Khách hàng có thể đặt đơn và tải hồ sơ lên ngay hoặc chọn **"Nộp sau"** rồi bổ sung trước giờ xuất phát.
- **Quyết định duyệt thuộc về Logistics Manager:** Khi khách tải tệp lên, Logistics Manager trực tiếp mở hồ sơ, tự đối chiếu 4 tiêu chí (microchip, hộ chiếu, ngày cấp, thời hạn sử dụng) và bấm **Phê duyệt** hoặc **Từ chối**. Một khi Manager đã **Phê duyệt (`approved`)**, hệ thống ghi nhận hồ sơ đạt chuẩn tuân thủ (không tự động từ chối ngược vì biên an toàn `+24h/+48h` hay cảnh báo Tầng B).

## Chuẩn hóa Tuân thủ Đa chiều & Runtime Expiry (Lịch sử Spec v3.1)

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
- **AC-F2-02 (Hết hạn Trước giờ Chạy):** *Given* đơn `ready_to_depart` đã trả SePay `succeeded`. *When* dời lịch làm `expected_arrival_datetime + 48h` vượt `expiry_datetime` giấy Tầng B (hoặc chuyển giấy tờ sang `expired`). *Then* hạ đơn về `planning`/`confirmed`, API xuất phát trả `422 Unprocessable Entity` và thông báo Specialist, Coordinator, Customer.
- **AC-F2-03 (Hết hạn khi Đang `in_transit`):** *Given* đơn đang `in_transit` trước trạm `border_check`. *When* giấy Tầng B bị đánh dấu `expired`. *Then* giữ nguyên `in_transit`, bật `in_transit_compliance_alert = true`, bắn Red Alert, và thao tác `customs_cleared` tại trạm biên giới bị chặn với `422 Unprocessable Entity`.

### Yêu cầu Giấy tờ Động theo Quốc gia, Tái sử dụng & Kiểm duyệt 4 Điểm (Step 8, review 11/2026)

- **Yêu cầu động (`GET /compliance/requirements`):**
  - Tính toán theo bộ ba: quốc gia đến (`destination_country`), phương thức (`road`/`air`/`sea`), danh sách ngựa (`horse_ids`).
  - Phân loại 6 trạng thái yêu cầu cho từng giấy tờ:
    1. `reusable`: Đã có giấy tờ hợp lệ trong kho ngựa, còn hạn đến hết chuyến và đúng ngày cấp. Tự động liên kết không cần nộp lại.
    2. `pending_review`: Đã nộp giấy tờ nhưng đang chờ Logistics Manager duyệt.
    3. `expiring`: Giấy tờ còn hạn nhưng sẽ hết hạn trong vòng 30 ngày hoặc sát mốc an toàn chuyến đi.
    4. `expired`: Giấy tờ đã hết hạn trước khi chuyến đi kết thúc hoặc hết hạn tại thời điểm hiện tại.
    5. `issued_too_early`: Giấy tờ cấp quá sớm so với quy định `max_issue_age_days` (ví dụ giấy kiểm dịch chỉ có giá trị 10 ngày).
    6. `missing`: Chưa nộp hồ sơ.
- **Kiểm soát Lead Time khởi hành (`assertDocumentLeadTime`):**
  - Chặn tạo đơn hoặc báo giá nếu ngày khởi hành sớm hơn `earliestFeasibleDeparture` với lỗi `422 DOCUMENT_LEAD_TIME_VIOLATION`.
  - Hỗ trợ tùy chọn **"Nộp sau" (canSubmitLater)** trong wizard tạo đơn đối với hồ sơ Tầng B và hồ sơ Tầng A khả thi.
- **Quy trình Kiểm duyệt 4 Điểm của Logistics Manager:**
  - Modal kiểm duyệt đối chiếu trực tiếp hồ sơ tải lên với thông tin cá thể ngựa:
    1. `microchipMatches`: Khớp số vi mạch với ngựa.
    2. `passportMatches`: Khớp số hộ chiếu với ngựa.
    3. `issueDateOk`: Ngày cấp không vượt quá `maxIssueAgeDays`.
    4. `expiryOk`: Ngày hết hạn bao trùm toàn bộ hành trình + biên an toàn (`minValidityBufferHours`).
  - Từ chối bắt buộc nhập lý do (tối thiểu 10 ký tự). Hồ sơ đã bị từ chối không thể duyệt đè nếu chưa nộp bản thay thế.
  - Mọi thao tác phê duyệt/từ chối đều ghi nhật ký kiểm toán vào bảng `document_review_log`.
- **Giám sát Hết hạn Tự động (`DocumentExpiryMonitorService`):**
  - Job chạy nền định kỳ:
    - Chuyển trạng thái giấy tờ quá hạn sang `expired`.
    - Gửi thông báo nhắc hạn trước 30 ngày, 7 ngày và 1 ngày (ghi vết `document_expiry_notice` để tránh trùng lặp).
    - Tự động hạ trạng thái các đơn `ready_to_depart` có hồ sơ Tầng A bị hết hạn quay về `planning`. Giữ nguyên trạng thái `in_transit` và kích hoạt cảnh báo đỏ tuân thủ (`in_transit_compliance_alert`).
