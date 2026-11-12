# Ghép Stall / Bao chuyến

> Cập nhật Phase 2 ngày 12/11/2026: đã bổ sung ghép thủ công và giữ chỗ độc quyền đường bộ theo phê duyệt, migration 019/020, UI Coordinator và các sửa lỗi audit. Kết quả kiểm thử trước đó ở tài liệu này là lịch sử. Xem [báo cáo kiểm chứng hiện tại](controlled-fixes-audit.md); MySQL/HTTP/browser vẫn BLOCKED cho đến khi Docker được xác nhận hoạt động và test chạy thành công. Mô hình vận hành hàng không vẫn chờ phê duyệt.

## Hành vi

- Tại bước chọn ngựa, Customer chọn Ghép ô chuồng (`shared_stall`, mặc định) hoặc Bao nguyên xe/Bao chuyến (`dedicated_charter`). Cả hai áp dụng cho nội địa/quốc tế và đường bộ/hàng không.
- Hiển thị gợi ý Ghép Stall cho 1–2 ngựa, Bao chuyến cho từ 3 ngựa hoặc ngựa đặc biệt. Không ép chuyển lựa chọn khi đổi số lượng.
- Hồ sơ nhiều ngựa có ô chọn số lượng trong giới hạn hồ sơ. Giữ nguyên lựa chọn, số lượng và gói bảo hiểm khi tải lại danh sách/chuyển bước. Tổng ô và thống kê giống dùng số ngựa thực, không đếm số dòng hồ sơ.
- Manager thấy hình thức ngay trong danh sách và trong chi tiết. Ghép Stall nhập đơn giá mỗi ô/ngựa; Bao chuyến nhập giá trọn gói. Cả hai màn duyệt đều có tóm tắt cước, bảo hiểm và tổng; backend tính lại theo dữ liệu khóa trong transaction.
- Customer chỉ đổi lựa chọn khi Manager yêu cầu chỉnh sửa. Lưu lịch sử lựa chọn, giữ bảo hiểm không thay đổi, xóa báo giá cũ cho Manager xét lại. Không cho đổi sau phê duyệt.
- Báo giá in/PDF và hóa đơn lưu hình thức, đơn giá khi có, số ngựa, cước và bảo hiểm. Cổng thanh toán vẫn đợi Flow 3 xác nhận; QR thu tổng hóa đơn, không nhân lại lần nữa.

Ví dụ:

| Lựa chọn | Nhập giá | Số ngựa | Cước cơ bản | Bảo hiểm | Tổng |
|---|---:|---:|---:|---:|---:|
| Ghép Stall | 2.000.000 VNĐ/ô | 2 | 4.000.000 | 3.000.000 | 7.000.000 |
| Bao chuyến | 9.000.000 VNĐ/chuyến | 3 | 9.000.000 | 0 (Basic) | 9.000.000 |

Phần này là lựa chọn dịch vụ và báo giá. Coordinator dùng lựa chọn để sắp xếp chuyến/booking thực tế, ưu tiên lịch riêng cho Bao chuyến hoặc mua số ô cần thiết trên hành lang chung. Không có thuật toán tự gom các đơn của nhiều chủ hay tích hợp đặt chỗ hãng bay thật.

## Dữ liệu và tương thích

Migration 018 thêm `shipment.booking_type` (ENUM, mặc định shared), `shipment.stall_unit_price` (nullable) và bảng lịch sử `shipment_booking_revision`. Migration chạy lặp được, không đổi tổng tiền cũ.

Client mới duyệt Shared bằng `stallUnitPrice`, `bookingType`, `quotedHorseCount`; server xác nhận hình thức/số ngựa khớp đơn hiện tại và tự nhân giá. Dedicated gửi `transportCost` trọn gói cùng hình thức/số ngựa đang xét. Không cho trộn đơn giá và tổng giá, dùng đơn giá cho charter, số lượng cũ, số âm/lẻ VNĐ hoặc vượt giới hạn tiền.

Client cũ gửi `transportCost`/`totalCost` vẫn có nghĩa là tổng cước. Không diễn giải lại thành đơn giá, không nhân thêm. Đơn cũ hoặc báo giá theo contract cũ giữ `stallUnitPrice = null`; tóm tắt không bịa ra đơn giá.

## Cài đặt

Từ thư mục `backend`, sau các migration trước đó:

```powershell
npm run migrate:payment-gate
npm run migrate:insurance
npm run migrate:booking
npm run start:dev
```

Nếu 016/017 đã áp dụng thì chỉ cần `npm run migrate:booking`. Frontend: `npm run dev` từ `frontend` (3001); backend dùng 5000. Không thêm biến môi trường. Migration database ứng dụng chưa được thực hiện trong lần triển khai này.

## File và lý do

- `backend/src/modules/orders/booking-policy.ts`, DTO/service/store/types: lựa chọn, kiểm tra giá, tính cước, lịch sử thay đổi và response.
- `frontend/src/features/orders/booking-policy.ts`, `components/BookingChoice.tsx`, `BookingSummary.tsx`: logic hiển thị/báo giá và thành phần dùng chung.
- Customer new/detail/amendment: chọn, sửa và xem lựa chọn đã lưu; sửa vòng tải lại/reset lựa chọn để không sai số ngựa khi báo giá stall.
- Manager list/detail: nhãn hình thức, đơn giá hoặc giá trọn gói, thống nhất payload và tóm tắt. Customer/Manager quotation và InvoiceSummary: ghi rõ hình thức/công thức cước.
- `backend/src/modules/routes/routes.store.ts`: lưu lựa chọn/đơn giá vào snapshot hóa đơn tại xác nhận Flow 3. Đây là thay đổi ngoài orders cần thiết để hóa đơn khớp báo giá.
- `database/schema.mysql.sql`, `migrations/018_booking_type.sql`, `apply-booking-migration.cjs`: schema và nâng cấp. Các package script/test runner bổ sung lệnh kiểm thử/migration; không thêm thư viện.
- Requirements, API, ERD, Flow 1/3: cập nhật nghiệp vụ và contract.

## Kiểm chứng ngày 12/11/2026

- Backend `npm run test:booking`: 47/47 qua, gồm nghiệp vụ mới và hồi quy bảo hiểm/payment gating/SePay. Dùng MySQL 8 + Nest API thật trong môi trường riêng; kiểm tra migration nâng cấp, chạy lặp, quyền sở hữu, công thức, dữ liệu cũ, sửa lựa chọn, snapshot và số tiền QR. Không sửa DB ứng dụng.
- Frontend: booking 4/4, insurance 5/5, SePay 7/7 qua; typecheck và production build thành công.
- Trình duyệt với Next/Nest/MySQL thật: tạo Shared 2 ngựa trong một hồ sơ, chọn Standard 100 triệu/ngựa, kiểm tra giữ số lượng qua chuyển bước; Manager duyệt từ màn chi tiết với đơn giá 2 triệu và tổng 7 triệu. Tạo Dedicated 3 ngựa, chọn Basic; Manager duyệt từ danh sách với giá 9 triệu, tổng vẫn 9 triệu.
- Môi trường thử đã được dọn. Không thực hiện thanh toán ngân hàng thật.

Phần Yêu cầu 2 được triển khai tiếp trên nhánh `codex/equine-insurance-and-payment-gate`; chưa commit/push thay đổi mới.
