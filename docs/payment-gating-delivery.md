# Payment Gating & Billing Architecture

> **Cập nhật sau review 11/2026 (Step 7):** Hệ thống hỗ trợ **hai luồng thanh toán song song**:
> 1. **Luồng Trả trước (Prepaid Flow - Mặc định mới):** Khách hàng tạo đơn từ báo giá (`payment_flow = 'prepaid'`). Hóa đơn sơ bộ (`shipment_invoice`, `route_id = NULL`) được phát hành ngay tại thời điểm tạo đơn. Cổng thanh toán SePay mở ngay ở trạng thái `awaiting_payment` trong 24h. Sau khi thanh toán, đơn sang `paid_pending_review` để Manager duyệt khả thi. Khi lộ trình được xác nhận ở Flow 3, hệ thống liên kết `route_id` vào hóa đơn hiện có mà không sinh thêm hóa đơn hay đòi thanh toán lần 2.
> 2. **Luồng Trả sau (Postpaid Legacy Flow - Tương thích đơn cũ):** Cổng thanh toán chỉ mở ở Gate 2 sau khi kế hoạch chi tiết được xác nhận (`confirmed`) và đầy đủ tài xế/escort chấp thuận phân công.

## Hai Luồng Thanh Toán (Dual Payment Flows)

| Tiêu chí | Luồng Trả trước (Prepaid Flow - Step 7) | Luồng Trả sau (Legacy Postpaid Flow) |
|---|---|---|
| **Thời điểm mở cổng** | Ngay khi tạo đơn thành công (`awaiting_payment`) | Sau khi lộ trình Flow 3 được xác nhận (`confirmed`) |
| **Hóa đơn sơ bộ** | `shipment_invoice` có `route_id = NULL` | Không có (chỉ có báo giá dự kiến) |
| **Thời hạn thanh toán** | 24 giờ (`payment_due_at = now + 24h`) | SLA động `payment_due_at = departure_at - 30h` |
| **Xử lý khi quá hạn** | Tự động hủy đơn `cancelled`, void hóa đơn, trả ngựa về `active` | Gắn cờ `payment_overdue`, cho gia hạn 10h hoặc hủy `cancelled_operational` |
| **Khi xác nhận lộ trình (Gate 2)** | Không xuất hóa đơn mới, cập nhật `route_id` vào hóa đơn cũ | Phát hành hóa đơn `primary` và mở cổng thanh toán |
| **Trạng thái khi đã thanh toán** | `paid_pending_review` (chờ Manager duyệt khả thi) | Giữ `confirmed`, mở điều kiện sẵn sàng xuất phát (`ready_to_depart`) |

## Cơ Chế Hoàn Tiền 100% Khi Không Đáp Ứng Được (Company Cannot Fulfil)

1. **Kích hoạt:** Khi Manager bấm "Không đáp ứng được" (`PATCH /orders/:id/feasibility`, `{ decision: 'cannot_fulfil', reasonCode, note }`), đơn chuyển sang `refund_requested`.
2. **Khai báo thông tin thụ hưởng:** Customer điền form tại `/customer/requests/:id/refund` cung cấp Tên ngân hàng, Số tài khoản, Tên chủ tài khoản và xác nhận đúng số tiền 100% đã trả.
3. **SLA xử lý:** `sla_due_at = addBusinessDays(now, 5)` (từ 3 đến 5 ngày làm việc, bỏ qua Thứ Bảy và Chủ Nhật).
4. **Phân tách nhiệm vụ (Segregation of Duties - SoD):**
   - Khoản hoàn ≥ 20.000.000 VND yêu cầu Dual-Approval (Người duyệt 1 và Người duyệt 2 phải khác nhau).
   - Người phê duyệt hoàn tiền (`approved_by_1` / `approved_by_2`) **không được phép** thực hiện lệnh chuyển khoản (`transferred_by != approved_by_1`).
5. **Hoàn tất chuyển khoản:** Khi Admin/Finance xác nhận chuyển khoản thành công (`PATCH /orders/:id/refund/transfer`), hệ thống chuyển đơn sang `refunded` và giải phóng trạng thái ngựa về `active`.

## Các nhóm file thay đổi

| Nhóm | File | Lý do |
|---|---|---|
| Billing | `backend/src/modules/orders/payment-gate.ts`, `sepay-payment.{store,service,types}.ts`, `momo-payment.store.ts` | Một điều kiện mở thanh toán dùng route thực, nhân sự và hóa đơn; kiểm tra cả QR cũ và webhook |
| Báo giá/đơn | `backend/src/modules/orders/orders.{service,store}.ts`, `dto/approve-order.dto.ts` | Thông báo báo giá sơ bộ, giá nguyên VND; ngăn hủy đơn đã duyệt/thanh toán và duyệt đè đơn đã hủy khi thao tác đồng thời |
| Lộ trình | `backend/src/modules/routes/routes.{store,service,controller}.ts` | Xác nhận + hóa đơn + thông báo không sinh trùng; readiness đủ ba điều kiện; chặn đường xuất bản bỏ qua readiness |
| Hồ sơ | `backend/src/modules/documents/documents.{service,store}.ts` | Đánh giá lại readiness sau duyệt/từ chối/thay/xóa hồ sơ; giữ đơn confirmed trong danh sách chuyên viên; thông báo Flow 2 không yêu cầu trả tiền sớm |
| Khởi hành | `backend/src/modules/tracking/tracking.{service,module}.ts` | Mốc khởi hành dùng chung readiness để chặn trạng thái Ready đã cũ |
| Dùng chung | `backend/src/common/shipment-lifecycle.ts`, `backend/src/app.module.ts` | Nối các thay đổi sau commit về domain lộ trình, tránh phụ thuộc vòng giữa orders/documents/routes |
| Xác thực | `backend/src/common/guards/jwt-auth.guard.ts` | Loại bỏ token giả có thể mạo danh người trả tiền hoặc tài xế; dùng JWT đăng nhập thật |
| Customer | `frontend/src/app/customer/requests/page.tsx`, `[id]/page.tsx`, `[id]/payment/page.tsx`, `frontend/src/features/orders/components/{SepayPayment,InvoiceSummary}.tsx` | Ghi rõ báo giá dự kiến; điều kiện backend là nguồn mở cổng; hiện hóa đơn và lời nhắn chờ lịch trình |
| Database | `database/migrations/016_route_payment_gate.sql`, `database/schema.mysql.sql`, `database/apply-payment-gate-migration.cjs` | Bảng invoice riêng, unique route, giá và snapshot bất biến lúc phát hành |
| Kiểm thử | `backend/scripts/test-payment-gate.cjs`, `backend/test/{payment-gating.test,sepay.integration}.cjs`, `backend/package.json`, `frontend/test/sepay-payment.test.cjs` | Kiểm thử HTTP/MySQL cô lập, quyền truy cập, đồng thời, webhook, readiness và UI |
| Môi trường | `.env.example` | Giải thích cờ nội bộ `PAYMENT_GATE_ISOLATED`; không thêm cấu hình bắt buộc cho ứng dụng |
| Tài liệu | `docs/api-documentation.md`, `docs/erd.md`, `docs/actors-and-roles.md`, `docs/flows/flow-{1,2,3}-*.md` | Cập nhật contract, quan hệ dữ liệu, quyền và luồng |

Các thay đổi ngoài orders cần thiết để Flow 2/3/4 cùng thực thi điều kiện xuất phát, thay vì chỉ ẩn nút ở frontend.

## Triển khai local

Sau khi có MySQL và đã áp dụng các migration cũ đến 015, chạy trong `backend`:

```powershell
npm run migrate:payment-gate
npm run start:dev
```

Khởi động frontend trong terminal khác bằng `npm run dev` từ `frontend` (cổng 3001).

Migration không tạo hóa đơn giả cho các chuyến cũ. Kế hoạch cũ chưa khởi hành, chưa có hóa đơn cần Driver/Escort hoặc Admin xác nhận lại phân công để phát hành hóa đơn. Tiền đã nhận vẫn được giữ, không yêu cầu trả lần hai. Hóa đơn cước trong ứng dụng hỗ trợ in/lưu PDF bằng trình duyệt, không tích hợp hóa đơn thuế điện tử.

## Kết quả kiểm tra ngày 11/11/2026

- `backend`: `npm run test:payment-gate`: **21/21 qua**, gồm các test nhóm. Runner dùng MySQL 8.0.46 trong container riêng, khởi động Nest API thật, gửi request HTTP/JWT và webhook ký HMAC, rồi dọn container. Không dùng hay sửa database trong `.env`.
- `frontend`: `npm run test:sepay`: **7/7 qua**.
- `frontend`: `npm run build`: thành công, bao gồm compile, lint và typecheck.
- `backend`: build thành công trong lệnh kiểm thử; `git diff --check` qua.
- Ở lần kiểm tra đầu, schema thiếu các cột profile ngựa `color`, `weight`, `medical_status`, `special_requirements`. Bản bảo hiểm bổ sung sau đó đã sửa schema và migration 017 để cung cấp các cột này; runner hiện kiểm tra nâng cấp thật, không còn vá riêng database test. Xem `docs/equine-insurance-delivery.md` cho kết quả mới.
- MySQL ứng dụng local hiện không kết nối được (`ECONNREFUSED`), nên migration 016 chưa áp dụng vào database ứng dụng thật.

Chưa commit/push/merge. Cần xác nhận diff trước khi push theo `AGENTS.md`.
