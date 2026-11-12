# Giá trị ngựa và bảo hiểm vận chuyển

> Cập nhật Phase 2 ngày 12/11/2026: đã sửa bảo toàn policy/quantity khi cập nhật một phần, phân quyền hoàn tất, quotation HTML, giá duyệt dương và tách sandbox khỏi paid/readiness chính thức. Xem [báo cáo kiểm chứng hiện tại](controlled-fixes-audit.md). Các số liệu test cũ bên dưới là lịch sử; không thay thế kết quả HTTP/MySQL/browser của Phase 2 đang BLOCKED bởi Docker.

## Phạm vi triển khai

- Customer khai báo giá trị và chọn Basic/Standard/Premium độc lập cho từng hồ sơ ngựa tại bước chọn ngựa khi tạo yêu cầu.
- Basic: phí 0, giới hạn bồi thường 50.000.000 VNĐ/ngựa. Standard: phí 1,5%, bồi thường tối đa 80% giá trị khai báo khi tổn thất/thương tích vĩnh viễn. Premium: phí 3%, bồi thường 100% và chi phí cấp cứu thú y trên đường.
- Với hồ sơ có nhiều ngựa, giá trị và giới hạn bồi thường là cho mỗi ngựa; phí đơn hàng bằng phí mỗi ngựa nhân số lượng.
- Backend tính phí, kiểm tra quyền sở hữu ngựa và lưu trong transaction. Các số tiền, tỷ giá và mức bồi thường do client gửi thêm không quyết định số tiền phải trả.
- Lưu giá trị gốc, loại tiền, tỷ giá, giá trị quy đổi, phí, mức bồi thường, quyền cấp cứu và phiên bản chính sách tại `shipment_horse`. Thay đổi cấu hình tỷ giá không đổi chính sách đã lưu.
- Manager nhập cước cơ bản; backend cộng phí bảo hiểm một lần. Customer, Manager, báo giá và hóa đơn hiển thị cước/phí/tổng; SePay thu tổng đã chốt trong hóa đơn sau Flow 3.
- Đơn chưa được báo giá có cước cơ bản đang chờ, không hiển thị phí bảo hiểm như tổng cước hoàn chỉnh. Đơn cũ giữ nguyên tổng tiền, mặc định Basic.
- Customer sửa trực tiếp giá trị/gói trong hộp thoại gửi lại đơn khi Manager yêu cầu chỉnh sửa. API chỉ nhận sửa ở trạng thái `change_requested`. Ghi chú mới được thêm vào yêu cầu cũ, giữ thông tin lộ trình. Trước khi thay danh sách, hệ thống lưu lịch sử bảo hiểm vào `shipment_insurance_revision`; bảo hiểm không thay đổi được giữ nguyên tỷ giá và chính sách.

Đây là phần khai báo, tính phí và ghi nhận quyền lợi theo yêu cầu; chưa tích hợp nhà bảo hiểm hoặc chi trả bồi thường thực tế.

## Cài đặt local

Database hiện hữu cần các migration trước đó đến 015. Khởi động MySQL rồi chạy trong thư mục `backend`:

```powershell
npm run migrate:payment-gate
npm run migrate:insurance
npm run start:dev
```

Hai migration 016/017 có thể chạy lại. Migration 017 thêm trường vào `shipment`/`shipment_horse`, tạo bảng lịch sử và giữ tổng báo giá lịch sử.

Mặc định nhập bằng VNĐ. Nếu hỗ trợ USD, đặt `INSURANCE_USD_TO_VND` trong `backend/.env` bằng tỷ giá nghiệp vụ được thống nhất rồi khởi động lại backend. Giá trị phải dương, không quá 1.000.000, tối đa 6 chữ số thập phân. Để trống thì giao diện và API không nhận khai báo USD. Không có tỷ giá thị trường tự động.

Trong terminal khác, chạy `npm run dev` từ `frontend` (cổng 3001). Backend dùng cổng 5000.

## Quy tắc tiền

Giá trị khai báo tối đa 2 chữ số thập phân. Backend dùng số nguyên BigInt để quy đổi, làm tròn giá trị VNĐ tới 2 chữ số thập phân, sau đó làm tròn phí mỗi ngựa tới VNĐ nguyên theo half-up, rồi mới nhân số lượng. Giao diện dùng cùng thứ tự làm tròn. Standard/Premium yêu cầu giá trị dương; Basic cho phép 0 để tương thích đơn cũ. Mỗi giá trị và tổng tiền phải nằm trong giới hạn DECIMAL(15,2).

## File và lý do thay đổi

- `backend/src/modules/orders/`: DTO, API chính sách, tính phí, lưu khai báo và cộng phí vào duyệt báo giá.
- `frontend/src/features/orders/`: thành phần chọn bảo hiểm, tóm tắt quyền lợi/chi phí và hóa đơn dùng chung.
- Route Customer tạo/chi tiết đơn: nhập và xem chính sách. Route Manager danh sách/chi tiết: báo giá cước riêng, hiển thị tổng gồm bảo hiểm.
- `backend/src/modules/routes/routes.store.ts`: cần lưu bảo hiểm vào snapshot hóa đơn khi xác nhận Flow 3, để số tiền thanh toán khớp báo giá.
- `backend/src/modules/notifications/notifications.store.ts`: bỏ ID người nhận giả khi vai trò chưa có tài khoản. Lỗi cũ khiến duyệt báo giá trả 500 sau khi đã lưu, hoặc gửi thông tin cho người sai vai trò.
- `database/`: schema/migration và script áp dụng; `.env.example`: cấu hình tỷ giá tùy chọn.
- `docs/requirements.md`, `docs/flows/flow-1-request-approval.md`, `docs/erd.md`, `docs/api-documentation.md`: nghiệp vụ, dữ liệu và API.

Các thay đổi payment gating đã có trong cùng working tree được giữ lại; chi tiết riêng ở `docs/payment-gating-delivery.md`.

## Kiểm chứng ngày 12/11/2026

- Backend `npm run test:insurance`: 37/37 qua, kiểm tra tính phí, API HTTP với JWT thật, MySQL 8 cô lập, quyền truy cập, cập nhật chính sách, thao tác đồng thời, snapshot hóa đơn, tổng tiền QR SePay và người nhận thông báo.
- Frontend `npm run test:insurance`: 5/5 qua, gồm làm tròn, gói độc lập từng ngựa, tóm tắt chi phí/quyền lợi, giữ tỷ giá đã lưu khi chỉnh sửa và escape nội dung.
- Frontend `npm run test:sepay`: 7/7 qua.
- Backend build và frontend production build thành công; frontend typecheck thành công.
- Runner backend tạo rồi dọn container MySQL dùng riêng, không dùng database ứng dụng. Tỷ giá 25.000 trong test là dữ liệu kiểm thử.
- Đã bổ sung các cột hồ sơ ngựa cũ `color`, `weight`, `medical_status`, `special_requirements` mà API chọn/xem ngựa sử dụng vào schema và migration 017 có kiểm tra tồn tại. Runner thử nâng cấp từ schema thiếu các trường này và chạy lại 017 để kiểm tra khả năng chạy lặp; không còn tự vá riêng schema test.
- Kiểm tra trực tiếp trên trình duyệt với MySQL/Nest/Next chạy thật, dữ liệu thử riêng: tạo đơn Standard 100 triệu, xem phí 1,5 triệu; Manager yêu cầu chỉnh sửa, Customer đổi Premium, gửi lại và xác nhận phí 3 triệu/quyền lợi 100 triệu. Sau sửa lỗi thông báo, Manager duyệt đơn Premium với cước 10 triệu thành công, hiển thị cước 10 triệu + bảo hiểm 3 triệu = tổng 13 triệu. Đã dọn môi trường thử sau kiểm tra. Không thực hiện chuyển tiền ngân hàng thật.
- MySQL ứng dụng chưa kết nối được (`ECONNREFUSED`): migration 016/017 chưa được áp dụng vào database ứng dụng thật.

Chưa commit, push hoặc merge.
