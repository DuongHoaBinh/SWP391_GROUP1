# Flow 1: Create and Approve Transport Request (Required)

> **Cập nhật sau review 11/2026 (Step 7 - Prepaid Flow):** Hệ thống chuyển sang luồng **Trả trước (Prepaid Flow)** làm luồng vận hành chuẩn:
> 1. Customer tạo báo giá (quote) tự động có hiệu lực 24h.
> 2. Customer đặt đơn từ báo giá → đơn khởi tạo ở trạng thái `awaiting_payment` (`payment_flow = 'prepaid'`), kèm hóa đơn sơ bộ (`shipment_invoice`, `route_id = NULL`) và mã SePay VietQR.
> 3. Customer thanh toán ngay trong 24h → SePay webhook chuyển đơn sang `paid_pending_review`. (Nếu quá 24h không thanh toán → SLA sweep tự hủy đơn `cancelled`, void hóa đơn, giải phóng ngựa).
> 4. Logistics Manager thẩm định khả năng vận hành (`PATCH /orders/:id/feasibility`):
>    - **Duyệt khả thi (`approve`):** Đơn chuyển sang `planning` (hoặc `approved`) để Coordinator lập lộ trình và phân xe. Không cần thu tiền lần 2 ở Gate 2.
>    - **Không thể đáp ứng (`cannot_fulfil`):** Manager chọn mã lý do và ghi chú giải trình ≥ 10 ký tự → Đơn chuyển sang `refund_requested`. Customer truy cập trang `/customer/requests/:id/refund` điền form STK nhận hoàn tiền 100% trong 3-5 ngày làm việc.
> *Ghi chú:* Luồng trả sau (Legacy Postpaid Flow `requested` → `approved` → `planning` → `confirmed` → SePay Gate 2) vẫn được giữ cho các đơn cũ.

## Actors

Customer, Logistics Manager, Admin/Finance

## Main path (Prepaid Flow - Step 7)

1. **Tạo Báo Giá & Khóa Giá (Quote Snapshot):** Khách hàng chọn tuyến đường, phương thức vận chuyển (đường bộ/hàng không/thủy), gói bảo hiểm theo từng ngựa và nhận báo giá tự động có mã `quoteId` (hiệu lực 24 giờ).
2. **Khởi Tạo Đơn & Phát Hành Hóa Đơn Sơ Bộ:** Khách hàng bấm "Đặt đơn từ báo giá" → hệ thống tạo đơn với `payment_flow = 'prepaid'`, trạng thái `awaiting_payment`, `payment_due_at = now + 24h`. Đồng thời, hệ thống tạo hóa đơn sơ bộ `primary` (`shipment_invoice.route_id = NULL`) và mã VietQR SePay. Báo giá chuyển sang `status = 'used'`.
3. **Thanh Toán Ngay & Hóa Đơn Điện Tử A4:** Khách hàng thanh toán qua SePay VietQR hoặc xem/in hóa đơn điện tử A4 chuẩn (`GET /orders/:id/invoice`, `numberToVietnameseWords`, mã tra cứu SePay).
4. **Đối Soát & Chuyển Trạng Thái:** SePay webhook xác thực thanh toán thành công → chuyển trạng thái đơn sang `paid_pending_review` qua state machine atomic guard (`transitionShipment`), ghi lịch sử vào `shipment_status_history` và gửi email/thông báo cho Customer và Manager.
5. **Thẩm Định Khả Thi (Feasibility Review):** Logistics Manager kiểm tra năng lực xe/chuồng/trạm kiểm dịch trên trang `/manager/requests/:id`:
   - **Trường hợp A (Duyệt khả thi):** Gọi `PATCH /orders/:id/feasibility` với `{ decision: 'approve' }` → Đơn chuyển sang `planning`. Đội điều phối lập tuyến chi tiết. Khi chuyến xe được xác nhận (`confirmed`), hệ thống tự liên kết `route_id` vào hóa đơn hiện có mà không sinh thêm hóa đơn mới hay yêu cầu thanh toán lần 2.
   - **Trường hợp B (Không thể đáp ứng):** Gọi `PATCH /orders/:id/feasibility` với `{ decision: 'cannot_fulfil', reasonCode, note }` → Đơn chuyển sang `refund_requested`.
6. **Hoàn Tiền 100% Khi Công Ty Không Đáp Ứng:**
   - Khách hàng nhận thông báo và truy cập form `/customer/requests/:id/refund` để xác nhận số tiền hoàn và điền thông tin ngân hàng thụ hưởng (Ngân hàng, STK, Tên chủ TK).
   - Hệ thống tạo `shipment_refund_record` loại `company_cannot_fulfil`, hạn SLA giải quyết `sla_due_at = addBusinessDays(now, 5)` (3-5 ngày làm việc). Khoản hoàn ≥ 20.000.000 VND kích hoạt dual-approval.
   - Admin/Finance thực hiện chuyển khoản ngoài hệ thống và xác nhận `PATCH /orders/:id/refund/transfer`. Kiểm tra SoD nghiêm ngặt (`transferred_by != approved_by_1`). Chuyển khoản thành công chuyển đơn sang `refunded` và giải phóng ngựa về `active`.

## Key rules (Prepaid Flow)

- Khách hàng bắt buộc phải có `quoteId` hợp lệ để tạo đơn vận chuyển mới.
- Hạn thanh toán của đơn trả trước là 24 giờ kể từ thời điểm tạo đơn (`payment_due_at`).
- Cổng thanh toán SePay mở ngay cho đơn `awaiting_payment` khi còn hạn; đóng tự động khi hết hạn.
- Đơn trả trước không cho phép dùng các nút legacy `approve`, `reject`, `request-changes` (trả về 409 Conflict).
- Đơn không đáp ứng được cam kết hoàn tiền 100% không thu bất kỳ chi phí nào; SLA xử lý từ 3 đến 5 ngày làm việc (không tính Thứ Bảy, Chủ Nhật).
- Phân tách nhiệm vụ (SoD): Người duyệt hoàn tiền không được là người bấm xác nhận chuyển tiền.

## Outputs

Approved order, assigned work items, order status history, and customer notification.

**Owner:** `backend/src/modules/orders`  
**Primary UI:** `frontend/src/app/customer`, `frontend/src/app/manager`

- Self-service cancellation is allowed only before approval (`requested` / `change_requested`); retries are idempotent. Approval and cancellation cannot both win concurrently. Approved or invoiced trips require operational handling.
- **Đơn trả trước chưa thanh toán (`awaiting_payment`):** khách được tự hủy (`PATCH /orders/:id/cancel`).
  - Trong một transaction, hệ thống chuyển `awaiting_payment` → `cancelled` qua state machine, ghi `shipment_status_history` (`reason_code = customer_cancelled`) và đặt `cancel_reason_code = 'customer_cancelled'`.
  - Hệ thống `void` hóa đơn, đóng QR SePay `pending` → `cancelled`, nhả xe giữ chỗ và trả ngựa về `active`; Manager nhận thông báo.
  - Nếu đã có giao dịch SePay `succeeded` hoặc `review`, hệ thống trả `409` và khách phải liên hệ vận hành. Webhook SePay khóa cùng dòng shipment, nên hủy và thanh toán không thể cùng thắng.
  - Tiền chuyển vào QR cũ sau khi hủy được đưa sang `review` để đối soát và hoàn thủ công.
  - Từ `paid_pending_review` trở đi, khách không tự hủy được.


## Equine value and insurance

1. In the horse-selection step, the customer enters a value per horse and chooses Basic, Standard or Premium. Standard/Premium require a positive declared value; Basic defaults to zero premium and permits an undeclared value for backward compatibility.
2. The backend validates owned, available horses (`horse.status = 'active'`), quantities, currency and package. A create transaction either reserves every selected horse by setting `horse.status = 'in_transit'` and stores all policies or rolls back entirely. In this domain model, `horse.status = 'in_transit'` means the horse is currently held/reserved by a non-terminal shipment (`requested` through `in_transit`) to prevent double-booking rather than strictly indicating physical movement; it returns to `'active'` when removed in `change_requested` or when the shipment ends (`cancelled`, `rejected`, `cancelled_operational`, or `completed`), and `'delivered'` is not a `horse.status` value. No orphan order is left on an invalid policy/horse.
3. Declared values have at most two decimal places. USD uses the configured server rate (up to six decimal places); converted VND value is rounded to two decimal places. The per-horse premium is rounded half up to one whole VND, then multiplied by quantity. Maximum stored values follow `DECIMAL(15,2)`.
4. Before approval, the UI shows insurance fees and pending freight. Manager approval requires explicit positive whole-VND base freight; missing, null, empty, zero, negative and invalid prices are rejected by the backend. Existing zero quotes are not rewritten. The server adds the aggregate premium once. Both Manager approval surfaces show the breakdown. Legacy `totalCost` approval input is treated as base freight; new clients use `transportCost`.
5. A change-request resubmission can update a policy only while the order is `change_requested`. The customer detail modal allows editing values/packages and adding notes without replacing the original route requirements. The existing horse identity is preserved; removed horses are released. The former policy rows are appended to `shipment_insurance_revision` before replacement. Unchanged declarations keep their stored exchange rate and premium, even when the configured rate changes or USD is no longer enabled. A substantive value/currency/package change uses the current server rate. The old quote is cleared until the Manager approves again. Concurrent approval, cancellation and change requests cannot reopen a finalized decision.
6. Approval locks the customer's policy. The quotation, confirmed-route invoice and bank QR use the same combined total. Invoice snapshots include the saved per-horse policies and separate freight/insurance amounts. The Flow 3 payment gate remains in force.

This implements policy selection, premium and coverage recording; it does not add an insurance-claim adjudication or external insurer settlement system.

Requested corrections merge omitted policy fields and quantities with the existing shipment-horse record. A changed declaration recalculates using the current server policy; an unchanged declaration keeps its saved rate and fee. Selecting road/air during approval never overwrites Domestic/International scope. Printable quotations escape customer text, and API failures show errors instead of demo orders or invented prices.

## Shared stall / dedicated charter

1. At horse selection, Customer chooses shared stalls (default) or a dedicated charter. Show both cards with price-basis explanations and recommendations for 1–2 vs 3+ horses; do not automatically switch or prohibit either option. Both are available for road and air transport.
2. Shared quote: Manager enters **unit price per stall/horse** in whole VND. Backend multiplies the sum of selected quantities, rather than the number of horse-profile rows. Dedicated quote: Manager enters **flat trip freight** once, regardless of horse count.
3. Add saved insurance after computing freight. Customer and Manager see the booking type, unit × quantity when recorded, freight, insurance and combined total. Both Manager approval surfaces, printable quotations and the Flow 3 invoice retain this information.
4. New approval clients send the booking type and horse count they reviewed. Validate against the locked order to reject stale views after Customer corrections. A stall quote cannot be used for a dedicated trip; unit and total price fields cannot be mixed.
5. For compatibility, existing `transportCost`/`totalCost` approval fields still mean total freight. Never reinterpret a legacy total as a unit rate or multiply an old quote again. These historical/legacy quotes have `stallUnitPrice = null`; no invented unit price appears in the saved summary.
6. Requested corrections can change booking type through the Customer detail modal. Save old/new choices and actor in `shipment_booking_revision`, preserve the horse insurance unless explicitly changed, clear freight/unit price, and return to Manager review. Changes after approval are rejected.

7. **Quy chuẩn thời gian ghép chuồng (Consolidation SLA & Dynamic Lead Time — Hòa giải Spec v3.1, `DEC-03` & `DEC-05` Approved):**
   - **Lead Time Động cho Hồ sơ Tầng A (`Target Spec v3.1 (Planned)`):**
     - `Tier_A_Deadline = departure_date - MAX(base_days, MAX(regulation.lead_time_days))` với `base_days = 2` ngày cho `shared_stall` và `base_days = 1` ngày cho `dedicated_charter`.
     - `Order_Cutoff = departure_date - MAX(3 ngày [shared] hoặc 2 ngày [charter], MaxLeadTime + 2 ngày)` (mặc định quốc tế `lead_time_days = 3` -> `5` ngày trước khởi hành; nội địa `2–3` ngày; quốc gia áp quy chế riêng dài hơn tự động tăng theo `lead_time_days + 2`).
     - *Ghi chú hòa giải:* Thay cho mốc cứng `D - 5` đối với các tuyến quốc tế có giấy phép nhập khẩu cần `14–30` ngày, đồng thời chỉ áp dụng mốc sớm cho **Tầng A** (hộ chiếu, tiêm phòng, xét nghiệm máu dài hạn). Giấy kiểm dịch **Tầng B** ngắn hạn (48–72h) chỉ cấp từ `D - 1` (`T - 24h` → `T - 6h`) để đảm bảo hiệu lực vượt qua thời điểm thông quan/đến nơi.
   - **Mốc Chốt sổ ghép tuyến (`D - 3` / `T - 72h`) vs Phát hành Hóa đơn (`≤ T - 58h`, Hard Cap `T - 52h`):**
     - Đúng `T - 72h`, đóng nhận đơn ghép mới. Coordinator chốt lộ trình Multi-stop + vị trí ô chuồng và phân công nhân sự chậm nhất `T - 70h`.
     - Driver/Escort chính xác nhận theo **SLA 4 giờ làm việc (`08:00–18:00`) hoặc tối đa 12 giờ đồng hồ liên tục** (mục tiêu phát hành hóa đơn chậm nhất **`T - 58h`**). Quá SLA → chuyển Backup Pool (**Backup SLA 4 giờ đồng hồ**, trần cứng hóa đơn **`T - 52h`**). Quá `T - 52h` kích hoạt xử lý ngoại lệ của Manager (`BR-F3-06`).
   - **Cửa sổ Thanh toán Động & Tự hủy khi Hết Gia hạn (`Target Spec v3.1 (Planned)`):**
     - Hạn thanh toán chuẩn neo theo thời điểm xuất hóa đơn thực tế: `payment_due_at = MIN(invoice_issued_at + 24h, departure_at - 30h)` (nhắc trước hạn 6h).
     - Quá `payment_due_at` gắn cờ `payment_overdue`: Manager giải phóng chuồng (`cancelled_operational`) trước `T - 28h` hoặc gia hạn **1 lần duy nhất** tới `grace_due_at = MIN(grace_granted_at + 10h, departure_at - 24h)`. Quá `grace_due_at` tự động chuyển `cancelled_operational` (`payment_overdue_expired`).
   - **Chính sách không đủ số lượng ghép tại `D - 3`:** Khách chọn (1) Dời sang chuyến ghép tiếp theo miễn phí; hoặc (2) Nâng cấp `dedicated_charter` bù chênh lệch cước:
     - *Chưa có SePay `succeeded`:* Đánh dấu hóa đơn cũ `void`, ghi `shipment_booking_revision`, xuất hóa đơn thay thế theo giá charter và đóng QR cũ.
     - *Đã có SePay `succeeded`:* Giữ nguyên hóa đơn & giao dịch SePay gốc, ghi `shipment_booking_revision`, và phát hành **`supplemental_invoice`** đúng bằng `charter_freight - shared_freight`.

Role notifications use existing active accounts with the requested role. If no account matches, no recipient is invented; approval still succeeds. This prevents false approval errors and notifications sent to unrelated users on databases without all staff accounts.

## Hủy vận hành (`cancelled_operational`), Hoàn tiền Thủ công & SoD (`DEC-04` — Ready for Finance/Legal Sign-off, `Target Spec v3.1 (Planned)`)

> [!IMPORTANT]
> Phân quyền thực hiện tuân thủ Ma trận RACI tại [actors-and-roles.md](file:///f:/SWP/Project/SWP391_GROUP1/docs/actors-and-roles.md). Quy tắc ma trận hoàn tiền dưới đây đang ở trạng thái **Ready for Finance/Legal Sign-off** trước khi Go-Live thương mại.

### Quy tắc Nghiệp vụ Bổ sung (`BR-F1-07` → `BR-F1-09`)

- **`BR-F1-07` (Luật Chuyển trạng thái `cancelled_operational`):**
  - Chỉ cho phép từ `approved`, `planning`, `confirmed`, `ready_to_depart` bởi `LOGISTICS_MANAGER` / `ADMIN` (hoặc tự động khi `grace_expired`), bắt buộc có `cancellation_reason` và `cancellation_category` (`company_fault` | `vet_unfit_certified` | `vet_unfit_uncertified` | `payment_overdue` | `payment_overdue_expired` | `customer_request_post_approval` | `force_majeure`).
  - **Cấm tuyệt đối** từ `in_transit` (`409 Conflict` — phải xử lý bằng Flow 5) hoặc trạng thái kết thúc (`completed`, `rejected`, `cancelled`, `cancelled_operational`).
  - Trong 1 transaction: trả `horse.status = active`, giải phóng slot `road_trip`, vô hiệu hóa QR `pending`, giữ nguyên `shipment_invoice` và `shipment_sepay_payment` gốc.
- **`BR-F1-08` (Hoàn tiền Thủ công qua `shipment_refund_record` & Tách nhiệm vụ SoD):**
  - SePay chỉ đối soát VietQR (`sepay-payment.service.ts`), không có API hoàn tiền tự động. Mọi khoản hoàn sau khi đã có SePay `succeeded` đi qua `shipment_refund_record`: `pending_approval` → `approved_for_transfer` *(Manager duyệt)* → `transferred` *(`ADMIN`/`FINANCE` chuyển khoản thủ công ngoài hệ thống kèm STK, mã giao dịch ngân hàng, ảnh ủy nhiệm chi)* hoặc `converted_to_credit` *(bảo lưu 30 ngày)*.
  - Ràng buộc SoD cứng: **`transferred_by != approved_by`** (trùng trả `403 Forbidden`); khoản `>= 20,000,000 VND` yêu cầu Dual-Approval.
- **`BR-F1-09` (Kế toán Phí Cơ quan Chức năng — `shipment_disbursement`):**
  - Lệ phí cơ quan nhà nước (kiểm dịch, XNK, hải quan) không nằm trong `shipment_invoice` gốc mà theo dõi qua khoản ứng trước có biên lai (`authority_receipt_url`).
  - Đơn hủy (trừ `company_fault`): khoản đã ứng trước có biên lai được khấu trừ minh bạch: `refund_amount = MAX(0, refundable_freight + insurance_fee - verified_advanced_disbursement)`. Nếu `company_fault`, công ty chịu 100%.
- **Ma trận Hoàn tiền Cấu phần `transport_cost` (Bảo hiểm luôn hoàn 100% khi chưa chạy):**
  - `company_fault`: Hoàn **100%**.
  - `vet_unfit_certified` *(có giấy cơ quan thú y/bác sĩ chỉ định, bất kỳ lúc nào trước `in_transit` kể cả `< 24h`)*: Ưu tiên **Bảo lưu 100% / 30 ngày** hoặc **Hoàn 80%** (trừ vé bay không hoàn có chứng từ).
  - `vet_unfit_uncertified` *(báo `< 24h` không giấy thú y)*: **Bảo lưu 80% / 30 ngày** hoặc **Hoàn 50%**.
  - `customer_request_post_approval`: `>= 72h` *(chỉ áp dụng `dedicated_charter` / hóa đơn thu sớm; `shared_stall` trước `T-72h` chưa thu tiền)* → **90%**; `24h–<72h` → **50%**; `< 24h`/no-show → **0%**.
  - `force_majeure`: Hoàn **100%** phần chưa chi bên thứ 3.

### Acceptance Criteria (BDD — Flow 1)

- **AC-F1-01 (Tính giá, Báo giá JSON & Bảo hiểm):** *Given* 2 ngựa `active`, `shared_stall`, `standard` giá trị 100,000,000 VND/ngựa. *When* Manager duyệt `stallUnitPrice = 2,000,000`, `transportMode = road`. *Then* response duyệt và `GET /orders/:id` trả đầy đủ payload báo giá ước tính (`bookingType = shared_stall`, `stallUnitPrice = 2,000,000`, `transportMode = road`, `requestedHorseCount = 2`, `insuranceFee = 3,000,000`, `transportCost = 4,000,000`, `totalCost = 7,000,000`, cùng chi tiết bảo hiểm từng ngựa trong `horses[]`) để frontend xuất bản in/PDF phía client (không có endpoint sinh file PDF phía backend), và `paymentUnlocked = false`.
- **AC-F1-02 (Race Condition Duyệt vs Hủy):** *Given* đơn `requested`. *When* hủy và duyệt đồng thời. *Then* chỉ 1 giao dịch thành công; giao dịch còn lại trả `409 Conflict`.
- **AC-F1-03 (Stale View khi Duyệt):** *Given* Manager gửi payload duyệt cũ (`shared_stall`, 1 ngựa) sau khi đơn đổi sang `dedicated_charter`, 2 ngựa. *Then* trả `409 Conflict`.
- **AC-F1-04 (Cấm Hủy khi `in_transit`):** *Given* đơn đang `in_transit`. *When* Manager gọi `cancelled_operational`. *Then* trả `409 Conflict`.
- **AC-F1-05 (Hủy `vet_unfit_certified` ở `T - 12h` & Khấu trừ Phí Ứng trước):** *Given* đơn `ready_to_depart` đã trả SePay `7,000,000 VND` (`4,000,000` cước + `3,000,000` bảo hiểm), trượt kiểm dịch tại `T - 12h` có biên bản thú y, phí ứng nộp biên lai `500,000 VND`. *When* chuyển `cancelled_operational` và khách rút tiền mặt. *Then* SePay/Invoice gốc giữ nguyên; sinh `shipment_refund_record` ở `pending_approval` với `refund_amount = 5,700,000 VND` (`6,200,000` nếu không có biên lai ứng trước).
- **AC-F1-06 (Thực thi Hoàn tiền Thủ công & SoD):** *Given* Manager A duyệt `approved_for_transfer`. *When* Manager A tự gọi `transferred`, sau đó Admin/Finance B gọi `transferred` kèm STK, mã giao dịch, ủy nhiệm chi. *Then* Manager A bị từ chối `403 Forbidden`; Admin/Finance B thành công.
- **AC-F1-07 (Nâng cấp `shared_stall` → `dedicated_charter` tại `D - 3`):** *Given* đơn `shared_stall` tổng `7,000,000`, nâng cấp charter `9,000,000` (chênh `+5,000,000`). *When* chưa trả tiền vs đã trả SePay `7,000,000`. *Then* chưa trả → `void` hóa đơn cũ & xuất hóa đơn `12,000,000 VND`; đã trả → giữ hóa đơn gốc & xuất `supplemental_invoice` `5,000,000 VND`.

---

## Báo giá tự động & Khóa giá theo Bảng giá (Step 4 — Review 11/2026)

### 1. Cơ chế Báo giá Tự động (`POST /quotes`)
1. **Tính toán khoảng cách chính xác:** Gọi ORS (OpenRouteService) qua `DistanceService` với HTTP timeout 5s, bộ nhớ đệm 24h (tối đa 5.000 cặp tọa độ). Nếu ORS gặp sự cố hoặc timeout, tự động fallback sang công thức Haversine nhân hệ số đường quanh co 1.25.
2. **Bảng giá có phiên bản (`pricing_tariff`):** Lưu trữ cấu hình giá cước tách biệt cho 3 phương thức:
   - **Đường bộ (`road`):** Bậc khoảng cách lũy tiến (`minKm`-`maxKm`, `pricePerKmPerVehicle`), cước tối thiểu mở cửa (`minChargePerTrip`), phụ thu deadhead khi xe rỗng về trạm, hệ số theo kích cỡ xe (`truck_1`, `truck_2`, `truck_4`, `truck_6`).
   - **Hàng không (`air`):** Cước mở chuồng bay theo cá thể (`baseFeePerHorse`), đơn giá theo km bay (`pricePerKmPerHorse`), phụ phí phục vụ mặt đất/sân bay (`airportHandlingPerHorse`). Ngựa cần chuồng riêng (`requiresPrivateStall`) phụ thu +50% trên phần cước bay.
   - **Đường thủy (`sea`):** Gồm 2 hình thức:
     - `ferry`: Ngựa ở trên xe chuyên dụng đưa lên phà (tối đa 12 giờ biển), gồm cước đường bộ suốt tuyến cộng vé phà theo xe.
     - `vessel`: Ngựa vào chuồng cố định trên tàu biển chuyên dụng, gồm cước 2 chặng bộ kết nối cảng (mỗi chặng ≤ 400km) cộng cước đường biển theo hải lý/ngựa.
3. **Thời hạn báo giá & Khóa giá:**
   - Mỗi báo giá sinh ra tồn tại trong 30 phút (`expires_at = NOW() + 30m`), trạng thái `active`.
   - Lưu toàn bộ chi tiết tính toán vào `pricing_snapshot` (các chặng leg, bậc giá áp dụng, phiên bản bảng giá, chi tiết bảo hiểm, tổng cước).
4. **Tạo đơn từ Báo giá:**
   - Khi khách hàng gửi yêu cầu tạo đơn có kèm `quote_id`, hệ thống kiểm tra hiệu lực báo giá (quá 30 phút trả `410 Gone`, báo giá đã dùng trả `409 Conflict`, sai tài khoản trả `403 Forbidden`).
   - Đơn hàng lưu vĩnh viễn `quote_id`, `pricing_snapshot`, `transport_cost`, `insurance_fee`, `total_cost`. Báo giá chuyển trạng thái `used`.
   - **Quy tắc bất biến (Immutability):** Logistics Manager khi duyệt đơn (`PATCH /orders/:id/approve`) không được chỉnh sửa đè giá thủ công nếu đơn đã có `quote_id`; hệ thống tự động giữ nguyên mức giá đã khóa trong snapshot.


---

## Khứ hồi và Chính sách No-Show (Step 5 — Review 11/2026)

### 1. Báo giá & Chiết khấu Khứ hồi
1. **Chặng về:** Tự động tính chặng đảo chiều (origin <-> destination), áp dụng chiết khấu **-10%** trên cước vận chuyển chặng về (`discountedReturnFreight = Math.ceil(returnFreight * 0.9 / 1000) * 1000`).
2. **Bảo hiểm khứ hồi:** Tính phí 2 chặng nhân ưu đãi 0.9: `insuranceTotal = Math.round(oneWayInsurance * 2 * 0.9)`. Phí bảo hiểm chặng về: `returnInsuranceFee = insuranceTotal - oneWayInsurance`.
3. **Thời điểm hẹn đón chặng về (`returnDepartureAt`):** Phải sau thời điểm xuất phát tối thiểu `thời gian di chuyển chặng đi + 12 giờ nghỉ ngơi` (`returnDepartureAt >= departureDate + estimatedHours + 12h`). Nếu sớm hơn, server trả `400 Bad Request`.

### 2. Cam kết Chính sách & Tạo đơn Khứ hồi
- Bắt buộc khách hàng tích chọn xác nhận đã đọc và đồng ý chính sách hủy/no-show (`acceptReturnPolicy = true`).
- Nếu `trip_type = 'round_trip'` mà thiếu `acceptReturnPolicy`, server từ chối tạo đơn với lỗi `400 Bad Request`.
- Khi tạo đơn thành công, hệ thống lưu snapshot chính sách hiện hành (`currentReturnPolicy()`) vào `shipment.return_policy_snapshot` để đảm bảo việc thay đổi chính sách trong tương lai không ảnh hưởng đến đơn đã cam kết.

### 3. Chính sách Hủy & Đổi ngày Chặng về
- **Bảng hoàn tiền hủy chặng về (theo thời gian còn lại trước giờ đón chặng về):**
  - Trước ≥ 168 giờ (7 ngày): Hoàn **80%** cước chặng về.
  - Từ 72 giờ đến < 168 giờ (3 - 7 ngày): Hoàn **50%** cước chặng về.
  - Dưới 72 giờ: Hoàn **0%** cước chặng về.
  - Công ty chủ động hủy (`return_leg_company_cancel`): Hoàn **100%** cước chặng về.
  - Phí bảo hiểm chặng về: Hoàn **100%** nếu hủy trước khi chặng về xuất phát.
  - Khoản tiền hoàn ≥ 20.000.000 VND tuân thủ cơ chế duyệt 2 cấp (SoD: Manager duyệt, Admin chuyển khoản).
- **Đổi ngày đón chặng về (`POST /orders/:id/return/reschedule`):**
  - Đổi trước ≥ 168 giờ: **Miễn phí hoàn toàn**.
  - Đổi trong vòng < 168 giờ: Thu phí đổi ngày trễ **10%** cước chặng về, làm tròn lên 1.000 VND (`return_reschedule_fee`). Lưu lịch sử thay đổi vào bảng `shipment_return_change`.
- **Khách không giao ngựa (No-Show chặng về):**
  - Tài xế phải chờ tối thiểu 120 phút (`return_wait_minutes`) tại điểm đón chặng về.
  - Trước khi đủ thời gian chờ, tài xế không được đánh dấu no-show (`409 Conflict` kèm thời điểm `allowedAt`).
  - Sau thời gian chờ, tài xế gọi `POST /tracking/shipments/:id/return/no-show` kèm ghi chú và ảnh bằng chứng.
  - Hệ thống đóng đơn với trạng thái `completed`, ghi nhận `return_no_show = true`, `return_status = 'no_show'`, nhả ngựa và phương tiện về trạng thái sẵn sàng, ghi `trip_status_log`. **Khách hàng mất 100% cước chặng về, không phát sinh hoàn tiền.**

## Báo giá nhiều phương án xe, giờ cấm đô thị và ETA có nghỉ (Step 9 — Review 11/2026)

- Khách chọn **ngày + giờ đón** (`pickupAt`, giờ Việt Nam). Thiếu giờ thì mặc định 08:00 của `departureDate`.
- `POST /quotes` trả tối đa **3 phương án xe** (`options[]`: Rẻ nhất · Ít xe nhất · Đến sớm nhất · Chia nhiều ngày · Ghép xe 2 trạm), mỗi phương án có danh sách xe (loại × số lượng, trạm, km chạy rỗng), breakdown cước riêng, giờ đón đã dời, ETA, số điểm nghỉ. Phương án khuyến nghị = Rẻ nhất. Khách gửi `optionCode` khi tạo đơn; tổng tiền đơn lấy theo phương án đã chọn.
- **Giờ cấm xe tải nặng nội đô** (bảng `city_truck_restriction`, vùng tròn quanh trung tâm; ngoại lệ ngày lễ `city_restriction_exception` thay thế khung thường ngày đó): nếu phương án có xe tải nặng và điểm đón/giao nằm trong vùng cấm vào giờ dự kiến → **tự dời** sang khung hợp lệ gần nhất (`warnings: PICKUP_SHIFTED_CITY_BAN` / `DELIVERY_SHIFTED_CITY_BAN`). Khi quy định buộc xe đón/giao trong khung đêm (mặc định 22:00–06:00) → cộng **phụ phí đêm** mỗi xe. Phương án chỉ dùng xe không nặng có thể không phải dời giờ.
- Ô chọn giờ đón hiện các **khung giờ được phép** từ `GET /fleet/city-restrictions/check`.
- **ETA** = thời gian lái + điểm nghỉ theo tham số B4 (`system_setting 'journey.rules'`: nghỉ `restMinutes` sau mỗi `maxDriveHoursBeforeRest` giờ lái; vượt `maxJourneyHours` thì nghỉ bắt buộc `mandatoryRestHours`) + thời gian bay/biển.
- **Không đủ xe**: `200` với `options: []`, `quoteId: null`, `shortage: { slots, suggestedDates }`; giao diện hiện "Chưa đủ xe ngày này" và nút chọn nhanh ngày gợi ý. Không lưu báo giá trong trường hợp này.
- Tạo đơn mà xe vừa bị khách khác giữ → `409`, giao diện tự báo giá lại.
- Dữ liệu giờ cấm và bảng giá đối tác là **dữ liệu demo**, phải đối chiếu văn bản gốc của UBND/Sở GTVT trước khi dùng thật.
