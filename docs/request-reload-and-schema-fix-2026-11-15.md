# Sửa mất bản nháp và lỗi tạo đơn local — 15/11/2026

Source: `D:\G4_fow4_pay\SWP391_GROUP1`. Giữ các thay đổi chưa commit trước đó; không commit/push.

## Nguyên nhân xác nhận

- Log Backend tại `.local/sepay/backend-error.log` ghi `Unknown column 'transportation_type' in 'field list'` khi `OrdersStore.createShipment` INSERT. Kiểm tra schema local cổng 3307 xác nhận thiếu cột này. Tạo đơn thất bại trước commit, database vẫn có 4 đơn.
- Có hai migration cùng số 015: file scope `015_add_shipment_transportation_type.sql` và SePay. Lệnh `migrate:order-features` trước đây chỉ gọi SePay và 016–020, nên không bảo đảm cột scope. Bộ test cô lập nhập toàn bộ SQL nên không đại diện đầy đủ cho schema local này.
- Wizard chỉ giữ nội dung bằng React state/react-hook-form, nên reload khởi tạo lại mọi trường và bước.
- `FleetRouteStoreProvider` ở root layout tự gọi `/fleet/staff` cho mọi actor, trong khi API chỉ cho Coordinator/Manager/Admin. HTTP 403 là từ chối quyền đúng; lỗi ở nơi gọi trên Frontend.

## Thay đổi

- Migration 021 thêm `shipment.transportation_type VARCHAR(50) NULL` nếu thiếu. Chạy lặp lại an toàn, không đoán Domestic/International cho dữ liệu cũ. Thêm CLI `npm run migrate:transportation-type` và đưa bước này vào `migrate:order-features`; cập nhật README/API doc.
- Đã sao lưu đầy đủ database local vào `.local/backups/before-scope-column-2026-11-15T03-32-23-215Z.sql` rồi áp dụng 021. So sánh tất cả giá trị trường cũ của cả 4 shipment trước/sau: không đổi. Backup nằm trong thư mục bị git ignore, không đưa vào source.
- Wizard lưu bản nháp trong `sessionStorage`, theo account và tùy chọn horseId đầu vào. Giữ fields, bước, số ngựa, booking, bảo hiểm và route preview. Khôi phục trước khi render wizard; không để auto-select ngựa mặc định ghi đè lựa chọn đã lưu. Khi quay lại bản đồ, giữ mode đường bộ/hàng không đã chọn.
- Lưu nháp không tạo đơn hoặc giữ chỗ. Xác minh lại ngày, hồ sơ và reservation hiện hành trước khi submit. Bản nháp sai cấu trúc/quá hạn bị loại bỏ; lỗi storage hiển thị thông báo. Giới hạn trong cùng phiên/tab, không phải bản nháp lưu trên server.
- API lỗi giữ nháp và hiển thị lỗi trong trang. Chỉ xóa nháp sau khi POST tạo đơn thành công. Ngày không còn hợp lệ đưa người dùng về bước lộ trình để sửa.
- `refreshStaff` không gọi API cho Customer/Driver/Specialist hoặc chưa đăng nhập, và xóa staff cache trong memory khi không có quyền. Role guard Backend giữ nguyên. Không gọi vehicles trước đăng nhập.

## Bằng chứng chạy mới

Thư mục: `C:\Users\tdinh\.codex\verification\insurance-road-20261114`.

| Kiểm tra | Actual result | Trạng thái |
| --- | --- | --- |
| Toàn bộ Frontend regression | 79/79, không skip; gồm account isolation, payload lỗi/đúng, xóa nháp sau thành công, không gọi staff sai role | PASS — `request-reload-all-tests.log` |
| TypeScript và production build FE | tsc exit 0, build thành công | PASS — `request-reload-typecheck.log`, `request-reload-build.log` |
| MySQL/Nest HTTP cô lập + regression | 101/101; tạo đơn và cả sáu booking/insurance đi hết invoice/payment test; restart persistence đạt | PASS — `request-scope-integration-final.log` |
| Schema cũ thiếu scope | Tái hiện ER_BAD_FIELD_ERROR trong schema test; chạy CLI 021 ba lần, giữ totals, notes và scope có sẵn | PASS — cùng log integration |
| Customer truy cập staff API trực tiếp | HTTP 403; Frontend không tự gọi endpoint này | PASS — HTTP assertion và test callback provider thật |
| Browser reload bước 1 | Title, ngày 03/12/2026, ngày đến 05/12/2026, ghi chú còn nguyên | PASS |
| Browser reload bước 2 | Giữ ngựa, 1.000.000 VND, Standard, Dedicated | PASS |
| Browser reload bước 3 | Vẫn ở Review, phí 15.000 VND, booking và notes/ngày đúng; console không error/warn | PASS — `request-draft-restored.jpg` |
| Handler submit khi API 500 | Nháp không bị xóa, không điều hướng, có hướng dẫn thử lại; API thành công mới xóa | PASS — test gọi handler thật với API stub, không ghi đơn vào DB ứng dụng |

Không gửi đơn thử, phê duyệt hoặc thanh toán trên database ứng dụng. Kiểm thử ghi dữ liệu thực hiện trên MySQL/API tạm riêng. Database local chỉ nhận thay đổi schema bổ sung nêu trên sau backup.
