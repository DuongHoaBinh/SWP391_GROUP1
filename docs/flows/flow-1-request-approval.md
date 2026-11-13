# Flow 1: Create and Approve Transport Request (Required)

## Actors

Customer, Logistics Manager

## Main path

1. Customer enters origin, destination, domestic/international scope, requested dates, horse count, horse details, and special requirements.
2. Customer submits the request and uploads available identity/medical documents.
3. The system creates the request as `DRAFT` or `SUBMITTED` and records the customer and timestamp.
4. Logistics Manager reviews feasibility, service scope, dates, and requested requirements.
5. Manager either requests changes, rejects the request with a reason, or approves it for planning. Approval produces an estimated VND quotation (printable PDF), not an invoice or payment request.
6. For an approved request, the manager assigns work to the Transport Specialist, Fleet & Route Coordinator, and Driver / Escort as planning becomes available.

## Key rules

- An order must contain at least one horse, origin, destination, and requested transport date before submission.
- Rejection and change requests require a reason.
- Only the Logistics Manager can approve or reject a submitted order.
- Customer edits after a change request create a new revision and preserve the previous version.
- Payment instructions remain locked until the Flow 3 route is confirmed and its invoice is issued, even when Flow 2 is already complete.
- Approval does not mean the trip can depart; document readiness and operational planning are separate gates.

## Outputs

Approved order, assigned work items, order status history, and customer notification.

**Owner:** `backend/src/modules/orders`  
**Primary UI:** `frontend/src/app/customer`, `frontend/src/app/manager`

- Self-service cancellation is allowed only before approval (`requested` / `change_requested`); retries are idempotent. Approval and cancellation cannot both win concurrently. Approved or invoiced trips require operational handling.


## Equine value and insurance

1. In the horse-selection step, the customer enters a value per horse and chooses Basic, Standard or Premium. Standard/Premium require a positive declared value; Basic defaults to zero premium and permits an undeclared value for backward compatibility.
2. The backend validates owned, available horses, quantities, currency and package. A create transaction either reserves every selected horse and stores all policies or rolls back entirely. No orphan order is left on an invalid policy/horse.
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

7. **Quy chuẩn thời gian ghép chuồng (Consolidation SLA & Lead Time):**
   - **Mốc 1 (Đặt yêu cầu):** Khách hàng tạo đơn đặt chỗ ghép chuồng trước ngày khởi hành dự kiến tối thiểu **7 ngày** ($\ge D - 7$) để hệ thống có thời gian gom đơn cùng hành lang.
   - **Mốc 2 (Hạn nộp hồ sơ thú y):** Khách hàng hoàn tất nộp giấy tờ tiêm phòng và xét nghiệm máu trước ngày khởi hành tối thiểu **5 ngày** ($\ge D - 5$). Chuyên viên Logistics (Specialist) thẩm định và làm thủ tục xin Giấy kiểm dịch động vật liên tỉnh với Chi cục Thú y (thời gian xử lý 24–48h). Nếu nộp trễ hạn, đơn không đủ điều kiện ghép vào chuyến.
   - **Mốc 3 (Chốt sổ ghép tuyến - Cut-off):** Đúng **72 giờ trước giờ chạy** ($D - 3$), hệ thống đóng nhận đơn mới cho chuyến. Điều phối viên (Coordinator) chốt lộ trình multi-stop (thứ tự đón/trả, vị trí ô chuồng trên xe), gán tài xế, nhân viên y tế/chăm sóc và hệ thống phát hành hóa đơn (Invoice).
   - **Mốc 4 (Thanh toán giữ chỗ):** Khách hàng thanh toán qua cổng SePay trong vòng 24 giờ sau khi hóa đơn được phát hành để khóa ô chuồng chắc chắn.
   - **Chính sách không đủ số lượng ghép:** Nếu đến mốc Cut-off ($D - 3$) chưa đủ người ghép trên cùng tuyến, hệ thống thông báo cho khách hàng với 2 phương án: (1) **Lùi ngày khởi hành** sang chuyến ghép tiếp theo (hoàn toàn miễn phí); hoặc (2) **Nâng cấp Bao trọn chuyến (Charter)** bù thêm chi phí chênh lệch để xe xuất phát riêng đúng ngày.

Role notifications use existing active accounts with the requested role. If no account matches, no recipient is invented; approval still succeeds. This prevents false approval errors and notifications sent to unrelated users on databases without all staff accounts.
