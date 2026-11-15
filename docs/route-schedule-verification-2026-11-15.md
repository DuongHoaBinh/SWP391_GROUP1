# Kiểm chứng bản đồ và luồng ngày giờ — 15/11/2026

Source được chỉnh và kiểm thử: `D:\G4_fow4_pay\SWP391_GROUP1`, nhánh `codex/harden-insurance-road-booking`. Các chỉnh sửa bảo hiểm/booking/UI trước đó được giữ nguyên. Không commit, push hoặc sửa lịch sử đơn ứng dụng.

## Kết quả sửa

| Lỗi đã đối chiếu | Thay đổi |
| --- | --- |
| Quãng đường hỗn hợp đường bộ + bay bị mô tả là đường bộ thực tế | `RoutePlanningMap.tsx`, `route-metrics.ts`: ghi nguồn OSRM/ước tính, tách tuyến tham khảo khỏi kế hoạch đã xác nhận. |
| Dùng công thức cố định để khẳng định thời gian vận chuyển | Chỉ dùng thời gian chạy xe từ OSRM khi toàn bộ chặng đường bộ định tuyến được. Tuyến bay/hỗn hợp hoặc định tuyến thiếu không có tổng thời gian tự suy đoán. |
| Đếm waypoint thành số trạm bắt buộc | Đổi thành điểm kiểm soát tham khảo; bỏ khẳng định pháp lý/thú y và đường bay đã thẩm định trong popup/legend. Escape nội dung địa điểm trước khi chèn vào HTML Leaflet. |
| Ngày đến ở form không gửi/lưu | Form gửi `expectedArrivalDate`; DTO/create/update lưu cột `expected_arrival_date` đã có. Không cần migration mới. |
| Chuyển bước không kiểm tra ngày đến | Kiểm tra ngày có thật, ngày đi không ở quá khứ theo lịch Việt Nam, ngày đến từ ngày đi trở đi; kiểm tra cả FE và BE. |
| Trang chi tiết tự cộng thời gian để tạo ngày đến | Bỏ phép cộng; thiếu ngày đến hiển thị chưa xác định. Component `SavedTransportSchedule` đọc các giờ từng chặng đã lưu, phân biệt dự thảo/xác nhận. |
| Máy khác múi giờ có thể hiển thị/nhập giờ khác nhau | Các ô giờ điều phối dùng Việt Nam UTC+07:00, chuyển ISO rõ ràng. Ngày ở danh sách Customer/Manager/Coordinator và chi tiết dùng lịch Việt Nam. |
| Dữ liệu lịch cũ lệch một ngày khi lấy phần ngày UTC | Hiển thị timestamp theo ngày Việt Nam. Khi sửa riêng ngày đến, dùng ngày Việt Nam của ngày đi cũ để đối chiếu, giữ nguyên timestamp trường bị bỏ qua. |
| Lịch chặng/trạm có thể chồng chéo hoặc nằm ngoài hành trình | `schedule-policy.ts`, `schedule-time.ts`: kiểm tra ngày thật, timezone, interval, sequence và phạm vi trạm. Dự thảo có thể chưa đủ giờ; gửi duyệt và xác nhận cần đủ giờ từng chặng. |
| Liên kết trạm/chặng bị bỏ khi lưu | Lưu `legSequenceNo` thành `route_stop.leg_id`, trả liên kết khi reload và kiểm tra lại khi điều chỉnh. |
| API đổi giờ có thể cập nhật trạm ngoài route hoặc lưu một phần | Khóa shipment/route/stops, kiểm tra ID thuộc route và không trùng, ghép dữ liệu cũ, validate toàn bộ rồi ghi trong transaction; thất bại rollback. |
| API tạo chuyến có thể chấp nhận ngày normalize, giờ thiếu timezone hoặc quá khứ | Kiểm tra ngay ở `RoadTripsStore` trước khi tạo chuyến. Khoảng giữ chỗ cũng dùng cùng bộ phân tích ISO. |
| Chưa có ô nhập lịch từng trạm | `StopScheduleFields`: nhập đến/rời, chọn chặng chứa trạm hoặc toàn hành trình, hiển thị UTC+07, khóa chế độ xem. |

## Kiểm thử thực tế

Thư mục bằng chứng: `C:\Users\tdinh\.codex\verification\insurance-road-20261114`.

| Test case | Expected Result | Actual Result | Trạng thái / bằng chứng |
| --- | --- | --- | --- |
| Backend build và TypeScript | Compile không lỗi | Build thành công; `tsc --noEmit --incremental false` exit 0 | PASS — `schedule-backend-build.log`, `schedule-backend-typecheck.log` |
| Frontend production build và TypeScript | Compile/typecheck không lỗi | Build hoàn tất, 47 trang static được tạo; tsc không lỗi | PASS — `schedule-frontend-build.log`, `schedule-frontend-typecheck-final.log` |
| Toàn bộ FE regression | Không regression auth, bảo hiểm, booking, UI và ngày giờ | 72/72, không skip | PASS — `schedule-frontend-tests-final.log` |
| MySQL + Nest HTTP cô lập và BE regression | Migration, API, thanh toán test, concurrency, ngày giờ đúng | 101/101, không skip | PASS — `schedule-integration-final.log` |
| Basic/Standard/Premium × Shared/Dedicated | Giá, invoice và trạng thái chính thức nhất quán | Cả sáu tổ hợp đi hết luồng, hóa đơn và thanh toán test tồn tại sau restart API | PASS — cùng log integration |
| Tạo/cập nhật ngày đến | Persist/reload đúng, omitted không mất dữ liệu | HTTP và DB khớp; ngày cũ ở ranh giới Việt Nam không bị đổi timestamp | PASS — `insurance.integration.cjs` |
| Calendar/arrival/past validation | Từ chối ngày không tồn tại, quá khứ, đến trước đi | HTTP 400, ngựa không bị giữ chỗ sau yêu cầu sai | PASS — cùng test |
| Chặng sai giờ/sequence/timezone | Từ chối interval đảo, chặng chồng, sequence trùng | HTTP 400, không lưu chặng dở dang | PASS — `road-trips.integration.cjs` |
| Đổi giờ trạm | Giữ giờ bị bỏ qua, chặn trạm lạ/trùng và vượt chặng; rollback toàn bộ | Các lần sai không làm đổi dữ liệu đã lưu; Customer bị 403 | PASS — cùng test |
| Dữ liệu lịch cũ không hợp lệ khi nhận chuyến | Không xác nhận nhân sự hoặc phát hành invoice | HTTP 400, invoice count 0, is_confirmed = 0 | PASS — cùng test |
| Hai Customer ghép chuyến, concurrency, Dedicated | Không vượt capacity, không chiếm xe độc quyền | Các test HTTP phân bổ đồng thời vẫn chạy Promise.all, kể cả các trường hợp đủ chỗ và thiếu chỗ | PASS — cùng test |
| Múi giờ máy khác nhau | Giờ UTC+07 nhập và ISO gửi giống nhau | UTC/New York/Tokyo đều cùng roundtrip; có test leap day và midnight | PASS — `transport-schedule.test.cjs` FE/BE |
| Form browser: arrival trước departure | Không chuyển bước, báo lỗi | Chặn tại bước lộ trình | PASS — `schedule-invalid-dates.jpg` |
| Form browser: để trống arrival, quay lại | Cho chuyển bước và giữ departure | Chuyển được sang bước chọn ngựa, quay lại giữ ngày | PASS — quan sát trực tiếp localhost, không gửi đơn |
| Browser: tuyến TP.HCM → Singapore | Không ghi ~6 tiếng hay số trạm bắt buộc | Hỗn hợp đường bộ/bay, thời gian chờ điều phối, 2 điểm tham khảo | PASS — `schedule-invalid-dates.jpg` |
| Browser: tuyến TP.HCM → Hà Nội | Hiện nguồn routing và chỉ thời gian chạy xe | OSRM trả khoảng 1.718,6 km / 22 giờ 30 phút tại thời điểm kiểm tra; ghi chưa gồm thời gian nghỉ/chờ/kiểm dịch | PASS — `schedule-road-preview.jpg`; không phải số liệu cam kết |
| Browser: đơn cũ thiếu chặng | Không dựng giờ/xe giả, không suy ra ngày đến | Hiện chưa có chặng/giờ chi tiết; ngày đi 25/10 hiển thị đúng | PASS — `schedule-customer-detail.jpg`, `schedule-legacy-warning.jpg` |
| UI nhập giờ/trạm có thể chỉnh sửa | UTC+07, chuyển đúng ISO, có association và khóa read-only | Test component thực thi handler và kiểm tra dữ liệu; build/typecheck đạt. Local chỉ có kế hoạch khóa thiếu chặng, không tạo/sửa đơn thật để quay browser toàn bộ màn hình này | PASS component; browser nhập/lưu đầy đủ chưa thực hiện |

Một lượt đầu có 97/99 do các suite dùng chung DB test: suite SePay xóa user fixture khi API suite khác đang gửi thông báo đến role đó. Runner đã cho các suite chạy tuần tự bằng `--test-concurrency=1`; các test HTTP phân bổ đồng thời bên trong suite vẫn giữ nguyên. Lượt cuối 101/101 là kết quả chạy mới, không dùng lượt lỗi để kết luận PASS.

## Phạm vi và giới hạn

- Hoàn thiện validation, persistence và cách trình bày ngày mong muốn/lịch đã lưu; không khẳng định mọi ETA là khả thi ngoài đời chỉ vì đúng thứ tự thời gian.
- Chưa có nguồn lịch bay đã đặt, giao thông trực tiếp, thời gian xử lý pháp lý/kiểm dịch hoặc chính sách tối thiểu về nghỉ/nghỉ tài xế/nối chuyến được phê duyệt. Coordinator/Specialist phải xác nhận các dữ liệu đó. Không tự đặt ngưỡng cứng và không mở rộng mô hình Shared/Dedicated hàng không.
- Đơn lịch sử REQ-004 có trạng thái Ready to Depart nhưng không có chặng lưu. Chỉ cảnh báo dữ liệu thiếu; không sửa status, bù lịch, giả invoice hoặc sửa DB ứng dụng.
- MySQL test là instance tạm riêng; HTTP test dùng API riêng 5012. Không test ghi dữ liệu trên DB ứng dụng, không gọi thanh toán tiền thật. SePay dùng webhook ký test; MoMo sandbox không được coi là thanh toán vận hành chính thức.
- Thay đổi shared utility/DTO và Fleet cần thiết để API tạo chuyến và lập tuyến dùng cùng chuẩn giờ. Đã cập nhật API contract và Flow 1/3.
- Chưa commit hoặc push. Source còn các thay đổi bảo hiểm/booking/UI từ phiên trước và thư mục `.idea` không liên quan được giữ nguyên.
