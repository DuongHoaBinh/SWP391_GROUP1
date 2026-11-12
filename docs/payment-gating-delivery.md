# Payment gating sau Flow 3

Nhánh: `codex/payment-after-route-confirmed`, từ `origin/dev` (`c3b2e23`).

## Hành vi

1. Duyệt yêu cầu chỉ tạo báo giá dự kiến; chưa có hóa đơn hay QR thanh toán.
2. Manager duyệt kế hoạch chi tiết. Khi toàn bộ Driver/Escort xác nhận, hệ thống lưu hóa đơn cước vận chuyển và gửi thông báo yêu cầu thanh toán trong cùng transaction.
3. Customer thấy hóa đơn (in/lưu PDF) và cổng SePay. Chưa xong hồ sơ vẫn thanh toán được khi Flow 3 đã xác nhận.
4. Chỉ SePay đã nhận đủ tiền thật, lộ trình đã xác nhận và hồ sơ đạt 100% mới mở xuất phát. Thay đổi hồ sơ hoặc webhook đều cập nhật lại readiness. Mốc khởi hành Flow 4 kiểm tra lại điều kiện, kể cả khi trước đó đã hiển thị Ready.
5. Phiếu thanh toán lịch sử được giữ. Không coi MoMo sandbox hoặc giá 0 là đã thanh toán thực.

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
