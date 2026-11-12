# Controlled Fix & Final Audit — 12/11/2026

## Phạm vi và trạng thái

- Branch: codex/equine-insurance-and-payment-gate; HEAD nền: 481621afd6a900fa41ef5318a59b723016b5f5d7. Giữ các thay đổi local sẵn có; không commit/push/merge.
- GROUP A: sửa 16 phát hiện gốc theo bảng dưới; có regression tái hiện trước sửa. GROUP B: triển khai Shared/Dedicated đường bộ theo phê duyệt của người dùng. GROUP C: migration/HTTP/MySQL/browser vẫn BLOCKED, không đổi UNVERIFIED thành BROKEN hoặc suy ra PASS từ build.
- Được duyệt: ghép thủ công đường bộ; 1 Stall/ngựa; khóa capacity khi đồng thời; Dedicated độc quyền xe trong khoảng đặt; Coordinator tự đánh giá tuyến/lịch, không thêm ngưỡng tự động. Cước duyệt mới phải lớn hơn 0. Air operational sharing/chartering chưa được duyệt.
- Working tree cuối phần kiểm tra độc lập: 40 tracked modified + 25 file tính năng mới = 65 file tính năng chưa commit, bao gồm 33 file từ trước Phase 2; thêm 2 deliverables có sẵn không thuộc tính năng. Không staged.
- Không chạy migration ứng dụng hoặc thanh toán thật. Không sửa .env, deliverables hoặc dữ liệu production.
- Docker từng trả phiên bản 28.5.1 nhưng list/run/cleanup treo rồi trả HTTP 500 từ dockerDesktopLinuxEngine. Người dùng đang tự khởi động lại; chỉ chạy tiếp integration khi người dùng xác nhận engine hoạt động. Không tự restart hoặc retry Docker liên tục. Cleanup lần thử container swp-payment-test-61bc82d9ab1c cũng trả HTTP 500; chưa xác minh container đó có tồn tại/đã được xóa.

## 16 phát hiện và thay đổi

| ID | Phát hiện | Trạng thái sửa/kiểm chứng | Source |
|---|---|---|---|
| F01 | Hoàn tất đơn sai quyền/trạng thái | Đã sửa; unit PASS, HTTP BLOCKED | [orders.store.ts:318](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/orders.store.ts:318>); [orders.service.ts:258](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/orders.service.ts:258>) |
| F02 | HTML injection trong quotation | Đã sửa; 2 template regression PASS | [quotation-html.ts:1](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/features/orders/quotation-html.ts:1>) |
| F03 | Mất gói/currency khi sửa một phần | Đã sửa; unit PASS | [orders.store.ts:116](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/orders.store.ts:116>) |
| F04 | Bypass capacity qua detailed plan | Đã sửa đường validation/transaction; kiểm chứng DB BLOCKED | [routes.store.ts:462](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/routes/routes.store.ts:462>); [road-trips.store.ts:5](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/fleet/road-trips.store.ts:5>) |
| F05 | Dedicated/Shared chưa có reservation đầy đủ | Đã triển khai đường bộ; unit PASS; concurrency MySQL BLOCKED | [road-trips.store.ts:48](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/fleet/road-trips.store.ts:48>) |
| F06 | Thiếu ghép chuyến nhiều chủ | Có mô hình/FE/API đường bộ; chưa xác nhận persistence/E2E; Air OPEN DECISION | [road-trips.store.ts:48](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/fleet/road-trips.store.ts:48>); [RoadTripPicker.tsx:14](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/features/routes/components/RoadTripPicker.tsx:14>) |
| F07 | Ghi đè International khi chọn road/air | Đã tách field mode; SQL unit PASS; migration/HTTP BLOCKED | [orders.store.ts:287](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/orders.store.ts:287>); [020_separate_transport_mode.sql:2](<D:/SWP_500/SWP391_GROUP1-feature-tracking/database/migrations/020_separate_transport_mode.sql:2>) |
| F08 | MoMo sandbox nâng readiness/paid chính thức | Đã bỏ cập nhật vận hành và fallback paid từ sandbox; unit PASS | [momo-payment.store.ts:65](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/momo-payment.store.ts:65>); [orders.store.ts:182](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/orders.store.ts:182>) |
| F09 | Confirm sandbox bỏ qua cờ/môi trường | Đã kiểm tra config; unit PASS | [momo-payment.service.ts:105](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/momo-payment.service.ts:105>) |
| F10 | MoMo nhân sai VND nhỏ | Đã dùng nguyên total VND; 50.000 giữ 50.000; unit PASS | [momo-payment.store.ts:47](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/momo-payment.store.ts:47>) |
| F11 | Quantity tự về 1 | Đã giữ quantity cũ khi bỏ qua; unit PASS | [orders.store.ts:114](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/orders.store.ts:114>) |
| F12 | Thiếu giá mặc định 0 | Đã chặn thiếu/null/rỗng/0/âm/không hợp lệ; unit PASS | [booking-policy.ts:42](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/booking-policy.ts:42>) |
| F13 | Mock và tổng giả khi API lỗi | Đã bỏ ở hai danh sách; callback regression PASS | [page.tsx:364](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/app/customer/requests/page.tsx:364>); [page.tsx:423](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/app/manager/requests/page.tsx:423>) |
| F14 | Detail lỗi vẫn skeleton | Đã có error/retry; render regression PASS | [page.tsx:330](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/app/customer/requests/[id]/page.tsx:330>) |
| F15 | Coordinator mất bookingType | Đã giữ mapping, hiển thị booking/mode và chọn chuyến; component/build PASS | [page.tsx:262](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/app/coordinator/routes/page.tsx:262>); [RoadTripPicker.tsx:14](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/features/routes/components/RoadTripPicker.tsx:14>) |
| F16 | Manager list thiếu policy khi duyệt | Đã thêm InsuranceSummary; component gốc và build PASS; browser BLOCKED | [page.tsx:878](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/app/manager/requests/page.tsx:878>) |

Sửa bổ sung phục vụ riêng tư khi ghép: route/full-plan và fleet assignment reads kiểm tra Customer ownership; regression service PASS. Không đổi quyền đọc của nhân sự vận hành.

## Bằng chứng kiểm thử hiện tại

| Kiểm tra | Kết quả | Phạm vi |
|---|---|---|
| Backend build | PASS | Nest compile |
| Backend unit/policy | PASS 27/27 | controlled-fixes 14, road-trip policy 6, insurance 4, booking 3; persistence dùng stub |
| Frontend test | PASS 24/24 | controlled fixes 8, booking 4, insurance 5, SePay 7; helper/render/event handler |
| FE/BE biên tính tiền | PASS 408 đối chiếu | 260 phép tính hợp lệ, 148 trường hợp hai phía cùng từ chối; VND/USD và 4 tỷ giá |
| Frontend typecheck | PASS | npx tsc --noEmit --incremental false |
| Frontend production build | PASS | Next compile/lint/type, 47 trang |
| Initial regression before fixes | FAIL theo kỳ vọng | 10/10 backend regression tái hiện lỗi trước sửa, hiện đã PASS |
| npm run test:insurance (HTTP/MySQL) | BLOCKED | Docker HTTP 500; không có HTTP/MySQL PASS trong Phase 2 |
| Migration 017/018/019/020 upgrade/repeat | BLOCKED | Đã bổ sung kịch bản dữ liệu lịch sử/quantity/route/scope; chưa chạy được |
| Road concurrency/privacy + sáu HTTP flows | BLOCKED | road-trips.integration.cjs đã viết, chỉ kiểm tra cú pháp; chưa thực thi |
| Browser E2E với API/DB thật | BLOCKED | Chờ backend/MySQL fixture cô lập |
| Bank transaction thật | NOT RUN | Không thuộc phạm vi được phép |

Bài kiểm tra độc lập không được coi là browser E2E hoặc chứng minh isolation/locking thực tế của MySQL. Không dùng con số backend 47/47 từ tài liệu lịch sử làm bằng chứng hiện tại.

## Ma trận đối chiếu đủ 102 tiêu chí gốc

COMPLETE chỉ áp dụng đúng phạm vi tiêu chí (khai báo schema, helper hoặc component). Persistence/deployment/E2E có dòng riêng và vẫn UNVERIFIED khi chưa có kết quả. PARTIAL ở vận hành gồm road đã viết nhưng chưa chạy DB và/hoặc air chưa được duyệt.

| ID | Tiêu chí | Audit trước | Hiện tại | Bằng chứng | Kiểm chứng/giới hạn |
|---|---|---|---|---|---|
| D01 | Kiểu declared_value DECIMAL(15,2), mặc định 0 | COMPLETE | COMPLETE | [schema.mysql.sql:170](<D:/SWP_500/SWP391_GROUP1-feature-tracking/database/schema.mysql.sql:170>) | T: xác minh khai báo schema; runtime xét riêng |
| D02 | Gói mặc định Basic | COMPLETE | COMPLETE | [schema.mysql.sql:174](<D:/SWP_500/SWP391_GROUP1-feature-tracking/database/schema.mysql.sql:174>) | T: xác minh khai báo schema; runtime xét riêng |
| D03 | Phí bảo hiểm đơn vị riêng | COMPLETE | COMPLETE | [schema.mysql.sql:140](<D:/SWP_500/SWP391_GROUP1-feature-tracking/database/schema.mysql.sql:140>) | T: xác minh khai báo schema; runtime xét riêng |
| D04 | Chính sách theo shipment_horse | COMPLETE | COMPLETE | [schema.mysql.sql:165](<D:/SWP_500/SWP391_GROUP1-feature-tracking/database/schema.mysql.sql:165>) | T: xác minh khai báo schema; runtime xét riêng |
| D05 | Tổng phí trên shipment | COMPLETE | COMPLETE | [schema.mysql.sql:140](<D:/SWP_500/SWP391_GROUP1-feature-tracking/database/schema.mysql.sql:140>) | T: xác minh khai báo schema; runtime xét riêng |
| D06 | Cước cơ bản lưu riêng | COMPLETE | COMPLETE | [schema.mysql.sql:139](<D:/SWP_500/SWP391_GROUP1-feature-tracking/database/schema.mysql.sql:139>) | T: xác minh khai báo schema; runtime xét riêng |
| D07 | Cột tỷ giá và giá VND snapshot | COMPLETE | COMPLETE | [schema.mysql.sql:172](<D:/SWP_500/SWP391_GROUP1-feature-tracking/database/schema.mysql.sql:172>) | T: xác minh khai báo schema; runtime xét riêng |
| D08 | Nâng cấp dữ liệu cũ | UNVERIFIED | UNVERIFIED | [017_equine_insurance.sql:78](<D:/SWP_500/SWP391_GROUP1-feature-tracking/database/migrations/017_equine_insurance.sql:78>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| D09 | Bản ghi cũ mặc định Basic | UNVERIFIED | UNVERIFIED | [017_equine_insurance.sql:53](<D:/SWP_500/SWP391_GROUP1-feature-tracking/database/migrations/017_equine_insurance.sql:53>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| D10 | Giữ nguyên tổng tiền lịch sử | UNVERIFIED | UNVERIFIED | [test-payment-gate.cjs:54](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/scripts/test-payment-gate.cjs:54>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| D11 | Migration chạy lặp không mất/nhân dữ liệu | UNVERIFIED | UNVERIFIED | [test-payment-gate.cjs:50](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/scripts/test-payment-gate.cjs:50>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| D12 | Booking enum và default Shared | COMPLETE | COMPLETE | [018_booking_type.sql:2](<D:/SWP_500/SWP391_GROUP1-feature-tracking/database/migrations/018_booking_type.sql:2>) | T: xác minh khai báo schema; runtime xét riêng |
| D13 | Migration booking/capacity/mode triển khai được | UNVERIFIED | UNVERIFIED | [019_road_trip_capacity.sql:2](<D:/SWP_500/SWP391_GROUP1-feature-tracking/database/migrations/019_road_trip_capacity.sql:2>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| D14 | Lưu/đọc booking qua database | UNVERIFIED | UNVERIFIED | [orders.store.ts:474](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/orders.store.ts:474>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| D15 | Đơn giá Stall và số ngựa để đối chiếu giá | COMPLETE | COMPLETE | [booking-policy.ts:33](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/booking-policy.ts:33>) | T: xác minh khai báo schema; runtime xét riêng |
| D16 | Mô hình đặt chỗ chung/độc quyền theo chuyến | MISSING | PARTIAL | [road-trips.store.ts:48](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/fleet/road-trips.store.ts:48>) | Chưa đủ kiểm chứng toàn bộ hoặc còn Air/config ngoài phạm vi duyệt |
| I01 | Basic phí 0 | COMPLETE | COMPLETE | [insurance-policy.ts:8](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/insurance-policy.ts:8>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| I02 | Basic trần 50 triệu/ngựa | COMPLETE | COMPLETE | [insurance-policy.ts:8](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/insurance-policy.ts:8>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| I03 | Standard phí 1,5% | COMPLETE | COMPLETE | [insurance-policy.ts:9](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/insurance-policy.ts:9>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| I04 | Standard trần bồi thường 80% | COMPLETE | COMPLETE | [insurance-policy.ts:9](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/insurance-policy.ts:9>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| I05 | Premium phí 3% | COMPLETE | COMPLETE | [insurance-policy.ts:10](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/insurance-policy.ts:10>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| I06 | Premium trần bồi thường 100% | COMPLETE | COMPLETE | [insurance-policy.ts:10](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/insurance-policy.ts:10>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| I07 | Premium có quyền chi phí cấp cứu | COMPLETE | COMPLETE | [insurance-policy.ts:10](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/insurance-policy.ts:10>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| I08 | Chính sách độc lập mỗi ngựa | COMPLETE | COMPLETE | [orders.store.ts:101](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/orders.store.ts:101>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| I09 | Nhân quantity đúng một lần | COMPLETE | COMPLETE | [insurance-policy.ts:52](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/insurance-policy.ts:52>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| I10 | Server không tin phí/quyền lợi Customer gửi | UNVERIFIED | UNVERIFIED | [orders.store.ts:128](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/orders.store.ts:128>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| I11 | Từ chối âm/NaN/Infinity/sai định dạng/vượt giới hạn | COMPLETE | COMPLETE | [insurance-policy.ts:21](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/insurance-policy.ts:21>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| I12 | Gói trả phí cần giá trị dương | COMPLETE | COMPLETE | [insurance-policy.ts:38](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/insurance-policy.ts:38>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| I13 | USD quy đổi và giữ tỷ giá snapshot đúng | COMPLETE | COMPLETE | [insurance-policy.ts:39](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/insurance-policy.ts:39>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| I14 | USD dùng được trong môi trường ứng dụng | PARTIAL | PARTIAL | [insurance-policy.ts:14](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/insurance-policy.ts:14>) | Chưa đủ kiểm chứng toàn bộ hoặc còn Air/config ngoài phạm vi duyệt |
| I15 | FE/BE làm tròn nhất quán | COMPLETE | COMPLETE | [insurance-policy.ts:18](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/features/orders/insurance-policy.ts:18>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| I16 | Customer chỉ truy cập đơn thuộc mình | UNVERIFIED | UNVERIFIED | [orders.service.ts:72](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/orders.service.ts:72>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| I17 | Không sửa policy sau chốt | UNVERIFIED | UNVERIFIED | [orders.store.ts:421](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/orders.store.ts:421>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| I18 | Sửa một phần giữ các trường policy bị bỏ qua | BROKEN | COMPLETE | [orders.store.ts:116](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/orders.store.ts:116>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| I19 | Sửa không tự giảm quantity | BROKEN | COMPLETE | [orders.store.ts:114](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/orders.store.ts:114>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| I20 | Duyệt giá cộng bảo hiểm một lần | COMPLETE | COMPLETE | [orders.store.ts:271](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/orders.store.ts:271>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| I21 | Lưu lịch sử sửa policy thực tế | UNVERIFIED | UNVERIFIED | [orders.store.ts:434](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/orders.store.ts:434>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| I22 | Tổng duyệt khớp invoice/bank thực tế | UNVERIFIED | UNVERIFIED | [routes.store.ts:711](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/routes/routes.store.ts:711>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| I23 | Không bỏ qua lifecycle/regression hiện hữu | BROKEN | PARTIAL | [orders.store.ts:318](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/orders.store.ts:318>) | Chưa đủ kiểm chứng toàn bộ hoặc còn Air/config ngoài phạm vi duyệt |
| F01 | Có input giá trị ngựa | COMPLETE | COMPLETE | [InsuranceSelection.tsx:23](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/features/orders/components/InsuranceSelection.tsx:23>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| F02 | Có ba gói | COMPLETE | COMPLETE | [InsuranceSelection.tsx:38](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/features/orders/components/InsuranceSelection.tsx:38>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| F03 | Hiển thị phí và quyền lợi | COMPLETE | COMPLETE | [InsuranceSelection.tsx:41](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/features/orders/components/InsuranceSelection.tsx:41>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| F04 | Mặc định Basic/VND hợp lý | COMPLETE | COMPLETE | [insurance-policy.ts:9](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/features/orders/insurance-policy.ts:9>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| F05 | Validation giao diện | COMPLETE | COMPLETE | [insurance-policy.ts:18](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/features/orders/insurance-policy.ts:18>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| F06 | Tương tác đổi gói/giá trên trang thật | UNVERIFIED | UNVERIFIED | [InsuranceSelection.tsx:26](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/features/orders/components/InsuranceSelection.tsx:26>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| F07 | Nhiều ngựa có lựa chọn độc lập | COMPLETE | COMPLETE | [InsuranceSelection.tsx:15](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/features/orders/components/InsuranceSelection.tsx:15>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| F08 | Summary tách freight/insurance/total | COMPLETE | COMPLETE | [InsuranceSummary.tsx:3](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/features/orders/components/InsuranceSummary.tsx:3>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| F09 | Chưa báo giá không có tổng giả | COMPLETE | COMPLETE | [InsuranceSummary.tsx:5](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/features/orders/components/InsuranceSummary.tsx:5>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| F10 | Detail hiển thị policy từ API | UNVERIFIED | UNVERIFIED | [page.tsx:253](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/app/customer/requests/[id]/page.tsx:253>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| F11 | Reload giữ policy | UNVERIFIED | UNVERIFIED | [page.tsx:292](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/app/customer/requests/[id]/page.tsx:292>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| F12 | Manager Detail có đủ policy | COMPLETE | COMPLETE | [page.tsx:488](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/app/manager/requests/[id]/page.tsx:488>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| F13 | Manager List có policy khi duyệt | PARTIAL | COMPLETE | [page.tsx:878](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/app/manager/requests/page.tsx:878>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| F14 | Lỗi API danh sách không thay bằng mock/giá giả | BROKEN | COMPLETE | [page.tsx:364](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/app/customer/requests/page.tsx:364>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| F15 | Loading với API thực | UNVERIFIED | UNVERIFIED | [page.tsx:336](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/app/customer/requests/[id]/page.tsx:336>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| F16 | Error state 403/404/network | BROKEN | COMPLETE | [page.tsx:330](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/app/customer/requests/[id]/page.tsx:330>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| F17 | Empty state với dữ liệu thực | UNVERIFIED | UNVERIFIED | [page.tsx:358](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/app/customer/requests/page.tsx:358>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| F18 | Xuất quotation an toàn với dữ liệu nhập | BROKEN | COMPLETE | [quotation-html.ts:1](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/features/orders/quotation-html.ts:1>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| B01 | HTTP tạo đơn nhận bookingType | UNVERIFIED | UNVERIFIED | [create-order.dto.ts:82](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/dto/create-order.dto.ts:82>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| B02 | Kiểm tra enum booking | COMPLETE | COMPLETE | [booking-policy.ts:12](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/booking-policy.ts:12>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| B03 | Mặc định Shared khi bỏ trống | COMPLETE | COMPLETE | [booking-policy.ts:13](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/booking-policy.ts:13>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| B04 | GET trả booking đã lưu | UNVERIFIED | UNVERIFIED | [orders.store.ts:474](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/orders.store.ts:474>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| B05 | Gửi lại giữ booking bị bỏ qua | UNVERIFIED | UNVERIFIED | [orders.store.ts:422](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/orders.store.ts:422>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| B06 | Manager nhận đúng booking | UNVERIFIED | UNVERIFIED | [page.tsx:250](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/app/manager/requests/page.tsx:250>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| B07 | Shared đơn giá nhân số ngựa | COMPLETE | COMPLETE | [booking-policy.ts:33](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/booking-policy.ts:33>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| B08 | Charter trọn gói, không nhân số ngựa | COMPLETE | COMPLETE | [booking-policy.ts:40](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/booking-policy.ts:40>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| B09 | Dùng tổng quantity thay vì số hồ sơ | COMPLETE | COMPLETE | [orders.store.ts:148](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/orders.store.ts:148>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| B10 | Shared 1/2/3 và Dedicated 1/3 tính được | COMPLETE | COMPLETE | [booking-policy.ts:18](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/booking-policy.ts:18>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| B11 | Mốc số ngựa là khuyến nghị | COMPLETE | COMPLETE | [BookingChoice.tsx:19](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/features/orders/components/BookingChoice.tsx:19>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| B12 | Đổi booking xóa quote cũ | UNVERIFIED | UNVERIFIED | [orders.store.ts:445](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/orders.store.ts:445>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| B13 | Chặn quote dựa trên loại/số ngựa cũ | COMPLETE | COMPLETE | [booking-policy.ts:22](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/booking-policy.ts:22>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| B14 | Customer không tự chốt freight | UNVERIFIED | UNVERIFIED | [create-order.dto.ts:78](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/dto/create-order.dto.ts:78>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| B15 | Legacy total freight không nhân thêm | COMPLETE | COMPLETE | [booking-policy.ts:38](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/booking-policy.ts:38>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| B16 | Mọi đường lập tuyến kiểm tra capacity | BROKEN | PARTIAL | [road-trips.store.ts:5](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/fleet/road-trips.store.ts:5>) | Chưa đủ kiểm chứng toàn bộ hoặc còn Air/config ngoài phạm vi duyệt |
| B17 | Nhiều đơn Shared không vượt tổng chỗ | BROKEN | PARTIAL | [road-trips.store.ts:95](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/fleet/road-trips.store.ts:95>) | Chưa đủ kiểm chứng toàn bộ hoặc còn Air/config ngoài phạm vi duyệt |
| B18 | Dedicated giữ độc quyền xe | BROKEN | PARTIAL | [road-trips.store.ts:91](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/fleet/road-trips.store.ts:91>) | Chưa đủ kiểm chứng toàn bộ hoặc còn Air/config ngoài phạm vi duyệt |
| B19 | Ghép nhiều chủ cùng chuyến thực tế | MISSING | PARTIAL | [road-trips.store.ts:48](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/fleet/road-trips.store.ts:48>) | Chưa đủ kiểm chứng toàn bộ hoặc còn Air/config ngoài phạm vi duyệt |
| B20 | Tách Booking/Mode/Domestic–International | BROKEN | COMPLETE | [020_separate_transport_mode.sql:2](<D:/SWP_500/SWP391_GROUP1-feature-tracking/database/migrations/020_separate_transport_mode.sql:2>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| B21 | Form có hai lựa chọn/cách tính | COMPLETE | COMPLETE | [BookingChoice.tsx:17](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/features/orders/components/BookingChoice.tsx:17>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| B22 | Form gửi lựa chọn đúng qua HTTP | UNVERIFIED | UNVERIFIED | [page.tsx:150](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/app/customer/requests/new/page.tsx:150>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| B23 | Submit/reload giữ booking | UNVERIFIED | UNVERIFIED | [page.tsx:892](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/app/customer/requests/[id]/page.tsx:892>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| B24 | Form sửa giữ booking | UNVERIFIED | UNVERIFIED | [InsuranceAmendmentForm.tsx:21](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/features/orders/components/InsuranceAmendmentForm.tsx:21>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| B25 | Detail hiển thị booking đã lưu | UNVERIFIED | UNVERIFIED | [page.tsx:892](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/app/customer/requests/[id]/page.tsx:892>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| B26 | Component tách cước và bảo hiểm | COMPLETE | COMPLETE | [BookingSummary.tsx:5](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/features/orders/components/BookingSummary.tsx:5>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| B27 | Manager List phân biệt hai booking | COMPLETE | COMPLETE | [page.tsx:916](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/app/manager/requests/page.tsx:916>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| B28 | Manager Detail phân biệt hai booking | COMPLETE | COMPLETE | [page.tsx:759](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/app/manager/requests/[id]/page.tsx:759>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| B29 | Payload duyệt dùng đúng unit/flat | COMPLETE | COMPLETE | [booking-policy.ts:17](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/features/orders/booking-policy.ts:17>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| B30 | Thông báo sau duyệt dùng dữ liệu đã chốt | UNVERIFIED | UNVERIFIED | [orders.service.ts:119](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/orders.service.ts:119>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| B31 | Coordinator thấy booking để điều phối | PARTIAL | COMPLETE | [RoadTripPicker.tsx:14](<D:/SWP_500/SWP391_GROUP1-feature-tracking/frontend/src/features/routes/components/RoadTripPicker.tsx:14>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| X01 | Shared + Basic tính đúng | COMPLETE | COMPLETE | [controlled-fixes.test.cjs:74](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/test/controlled-fixes.test.cjs:74>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| X02 | Shared + Standard tính đúng | COMPLETE | COMPLETE | [controlled-fixes.test.cjs:74](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/test/controlled-fixes.test.cjs:74>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| X03 | Shared + Premium tính đúng | COMPLETE | COMPLETE | [controlled-fixes.test.cjs:74](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/test/controlled-fixes.test.cjs:74>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| X04 | Dedicated + Basic tính đúng | COMPLETE | COMPLETE | [controlled-fixes.test.cjs:74](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/test/controlled-fixes.test.cjs:74>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| X05 | Dedicated + Standard tính đúng | COMPLETE | COMPLETE | [controlled-fixes.test.cjs:74](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/test/controlled-fixes.test.cjs:74>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| X06 | Dedicated + Premium tính đúng | COMPLETE | COMPLETE | [controlled-fixes.test.cjs:74](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/test/controlled-fixes.test.cjs:74>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| X07 | Phí hỗn hợp nhiều ngựa/gói/quantity | COMPLETE | COMPLETE | [insurance-policy.ts:52](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/insurance-policy.ts:52>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| X08 | Create → Manager → Customer qua API/DB | UNVERIFIED | UNVERIFIED | [road-trips.integration.cjs:7](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/test/road-trips.integration.cjs:7>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| X09 | Sửa policy/quantity không mất dữ liệu | BROKEN | COMPLETE | [controlled-fixes.test.cjs:18](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/test/controlled-fixes.test.cjs:18>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| X10 | Confirm tạo invoice snapshot đúng một lần | UNVERIFIED | UNVERIFIED | [routes.store.ts:711](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/routes/routes.store.ts:711>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| X11 | SePay gate phía server thực tế | UNVERIFIED | UNVERIFIED | [payment-gate.ts:6](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/src/modules/orders/payment-gate.ts:6>) | BLOCKED DB/HTTP/browser; có source, chưa đủ bằng chứng |
| X12 | Sandbox không nâng readiness chính thức | BROKEN | COMPLETE | [controlled-fixes.test.cjs:101](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/test/controlled-fixes.test.cjs:101>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| X13 | Sandbox disabled/production chặn confirm | BROKEN | COMPLETE | [controlled-fixes.test.cjs:114](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/test/controlled-fixes.test.cjs:114>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |
| X14 | Sandbox dùng đúng tổng VND invoice | BROKEN | COMPLETE | [controlled-fixes.test.cjs:129](<D:/SWP_500/SWP391_GROUP1-feature-tracking/backend/test/controlled-fixes.test.cjs:129>) | PASS unit/component hoặc kiểm tra source + build; không suy ra E2E |

**Tổng 102:** COMPLETE 65; PARTIAL 7; BROKEN 0; MISSING 0; UNVERIFIED 30. **Chưa COMPLETE: 37.** Đây là số tiêu chí, không phải số bug độc lập. BROKEN 0 không có nghĩa là đã chứng minh hệ thống không còn bug.

## Triển khai và phần còn lại

1. **BLOCKED môi trường:** khi người dùng xác nhận Docker hoạt động, chạy backend npm run test:insurance (runner cô lập), sửa nếu xuất hiện FAIL và cập nhật báo cáo bằng kết quả thực tế. Không dùng DB ứng dụng thay thế.
2. **BLOCKED kiểm chứng:** chạy fresh base schema + migrations, nâng cấp dữ liệu cũ, lặp 017/018/019/020; xác minh tiền/quantity/scope/route lịch sử không đổi; chạy concurrency Shared/Dedicated, privacy, invoice snapshot, SePay test webhook và MoMo sandbox không nâng paid/readiness.
3. **BLOCKED browser:** kiểm tra wizard, chọn/sửa booking-policy, Manager báo giá, Coordinator ghép xe, reload và invoice trên frontend với fixture API/DB thật; không thanh toán thật.
4. **OPEN DECISION:** mô hình ghép/thuê riêng hàng không (cả chuyến hay khoang); không triển khai thay cho BA. Không tự thêm ngưỡng tương thích route/time. USD runtime cần tỷ giá hợp lệ; không tự sửa .env hoặc chọn tỷ giá.
5. **Migration triển khai:** 019 và 020 chỉ là source chưa được áp dụng lên DB ứng dụng. Sau khi kiểm thử cô lập thành công và được phép triển khai, áp dụng theo thứ tự sau migration cũ bằng npm run migrate:road-trips và npm run migrate:transport-mode. Không tự sửa các đơn cũ cước 0; chỉ từ chối duyệt giá mới không hợp lệ.
6. **Ngoài phạm vi:** insurer claims processing, airline reservation API, tự động tối ưu ghép chuyến.

## Kết luận

Yêu cầu 1 PARTIAL do còn persistence/migration/invoice/E2E chưa kiểm chứng và USD runtime chưa bật/xác nhận. Yêu cầu 2 PARTIAL: road FE/BE/schema đã triển khai, unit/component đã qua; MySQL concurrency và end-to-end chưa xác minh, air operational model còn chờ phê duyệt. Chưa sẵn sàng xác nhận triển khai production. Không commit/push/merge hoặc migrate DB ứng dụng.

## Rà soát lại trước push theo yêu cầu mới (12/11/2026)

- Người dùng yêu cầu kiểm tra lại rồi push, thay thế giới hạn không commit/push của mốc Phase 2 phía trên. Đích là nhánh codex/equine-insurance-and-payment-gate; không merge dev/main.
- Đã chạy lại backend build và 27/27 unit/policy test; frontend 24/24 regression/component test và production build (gồm compile/lint/type, 47 trang) đều PASS. Không có lỗi mới được xác nhận trong phạm vi kiểm tra độc lập này.
- Một lần kiểm tra Docker có giới hạn 15 giây trả ETIMEDOUT. Không chạy lại liên tục hoặc chuyển test ghi dữ liệu sang DB ứng dụng. HTTP/MySQL, migration và browser E2E vẫn BLOCKED; ma trận 65 COMPLETE / 7 PARTIAL / 30 UNVERIFIED giữ nguyên.
- Diff và danh sách file đã được rà: 65 file tính năng (backend 31, database 7, docs 10, frontend 17), gồm lựa chọn/báo giá booking, sửa lỗi audit, vận hành đường bộ, migration 018–020 và regression/tài liệu. Không đưa deliverables hoặc .env thật vào commit. Quét mẫu token/private-key trên các file chuẩn bị commit không có phát hiện; git diff --check PASS.
- Đây là bản đẩy lên nhánh tính năng để kiểm tra tiếp, không phải xác nhận sẵn sàng triển khai production.
