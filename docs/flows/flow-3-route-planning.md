# Flow 3: Lập kế hoạch lộ trình và điều phối phương tiện (Route Planning and Fleet Coordination)

> **Cập nhật sau review 11/2026:** Transport Specialist và Fleet & Route Coordinator đã gộp vào **Logistics Manager** (xem `docs/actors-and-roles.md`). Trong tài liệu này, mọi chỗ ghi Specialist/Coordinator được hiểu là Logistics Manager; role `TRANSPORT_SPECIALIST`/`FLEET_ROUTE_COORDINATOR` chỉ còn để tương thích dữ liệu cũ.

## 0. Cập nhật Step 3 (review 11/2026)

- **Đã bỏ gom chuyến.** Mỗi đơn mới đi xe riêng (`dedicated_charter`). Lựa chọn "Ghép ô chuồng" đã bị gỡ khỏi form tạo đơn; backend trả `400` nếu đơn mới gửi `shared_stall`, và `POST /fleet/road-trips` trả `410`. Đơn ghép cũ giữ nguyên để xem lại và điều phối nốt (RoadTripPicker chỉ hiện với đơn `shared_stall` cũ). Các mục 7 và AC liên quan đến ghép chuyến bên dưới chỉ còn áp dụng cho đơn cũ.
- **Trạm xe.** Mỗi xe đường bộ thuộc một trạm đang hoạt động (`/manager/fleet/depots`, có bản đồ). Trạm `partner` là trạm đối tác ở nước ngoài, dùng cho chặng giao cuối. Trạm còn xe không xóa được, chỉ tạm ngưng. Việc chọn trạm gần nhất khi điều xe làm ở Step 9.
- **Loại phương tiện và sức chứa.** Khi tạo xe, Manager chọn loại (`truck_1/2/4/6`, `jet_stall`, `ferry_slot`, `vessel_pen`); sức chứa lấy theo loại. `truck_4` và `truck_6` là xe tải nặng (dùng cho giờ cấm đô thị ở Step 9).
- **Sức chứa đường bộ** tính theo đúng số ngựa của đơn (`1 chỗ / ngựa`) khi lưu kế hoạch và phân công xe. Phân bổ nhiều xe cho một đơn và số jet stall cho chặng bay làm ở Step 9.

## 1. Bối cảnh và nguyên tắc cốt lõi

- **Thời điểm kích hoạt:** Bắt đầu ngay khi đơn vận chuyển đã được Manager phê duyệt và khách hàng chấp nhận báo giá (kết thúc Flow 1). Đơn hàng chuyển sang trạng thái `planning`.
- **Chạy song song Flow 2 & Flow 3:** Không cần chờ kiểm dịch (Flow 2) hoàn tất mới lập kế hoạch. Flow 2 (hồ sơ pháp lý, xét nghiệm, kiểm dịch) và Flow 3 (lộ trình, phương tiện, chuyến bay) chạy **đồng thời**, gặp nhau tại cổng chốt **Ready to depart**.
- **Loại chuyến đi:** Tự động suy ra từ điểm xuất phát và điểm đến:
  - *Cùng quốc gia:* **Nội địa**, 100% đường bộ bằng xe thùng chuyên dụng.
  - *Khác quốc gia:* **Quốc tế**, kết hợp đa phương thức: Đường bộ $\rightarrow$ Hàng không (Cargo Flight) $\rightarrow$ Đường bộ.
- **Phân định 2 cấp độ lập kế hoạch:**
  - **Cấp chiến lược (Strategic Framework):** Logistics Manager thiết lập định hướng tổng thể, chọn loại phương tiện, hãng bay, tuyến chính và chỉ định Coordinator.
  - **Cấp thực thi (Operational Details):** Fleet & Route Coordinator chọn xe cụ thể, dựng chi tiết các chặng (legs), điểm dừng, giờ giấc và thông tin booking chuyến bay.
- **Tích hợp bên ngoài:** Không kết nối API đặt vé hãng bay thật; Coordinator đặt chỗ bên ngoài và nhập mã booking, số stall vào hệ thống.
- **Hình thức đặt chỗ & Gom chuyến (Consolidation):** `order.bookingType` phân biệt `shared_stall` (ghép ô chuồng trên hành lang chung) và `dedicated_charter` (xe riêng cho đoàn, ưu tiên tuyến thẳng/giờ yêu cầu).
  - *Đường bộ ghép chuồng:* Tuyến Multi-stop (nhiều điểm đón, nhiều điểm trả dọc trục Bắc – Nam). Coordinator sắp xếp thứ tự ô chuồng trên xe logic (ngựa xuống trước ở khoang ngoài gần cửa dỡ, ngựa đi xa nhất ở trong cùng).
  - *Hàng không ghép chuồng:* Mô hình Hub-to-Hub cố định giữa các sân bay cargo lớn (Tân Sơn Nhất SGN, Nội Bài HAN, Changi, v.v.) kết hợp xe tải trung chuyển chặng đầu và chặng cuối. Thùng Airstall/ULD ghép tối đa 3 ngựa. Khi xuất phát hoặc đích đến không phải sân bay, UI lập lộ trình tự động tạo và bắt buộc đủ chuỗi **Xe thùng đường bộ $\rightarrow$ Chuyến bay $\rightarrow$ Xe thùng đường bộ** trước khi gửi duyệt.
  - *Khung thời hạn (SLA — Hòa giải Spec v3.1, `DEC-05` Approved):* Đặt chỗ `>= MAX(3 ngày [shared] / 2 ngày [charter], MaxLeadTime + 2 ngày)`; nộp hồ sơ Tầng A `>= MAX(2 ngày [shared] / 1 ngày [charter], MAX(lead_time_days))`; Coordinator chốt lộ trình và phân công trước `T - 70h` (Cut-off `T - 72h`). Driver/Escort chính xác nhận theo **SLA 4 giờ làm việc (`08:00–18:00`) hoặc tối đa 12 giờ đồng hồ** (mục tiêu hóa đơn `≤ T - 58h`), quá hạn chuyển Backup Pool với **Backup SLA 4 giờ đồng hồ** (**Trần cứng hóa đơn `T - 52h`**). Hạn thanh toán = `MIN(invoice_issued_at + 24h, departure_at - 30h)`.
- Khi phát hành invoice sau xác nhận, lưu `bookingType`, `stallUnitPrice` (nếu có), số ngựa, cước và bảo hiểm trong snapshot.
  - *Đối với đơn trả sau (Legacy Postpaid Flow):* Thanh toán đợi Flow 3 xác nhận, phát hành hóa đơn mới và mở Gate 2.
  - *Đối với đơn trả trước (Prepaid Flow - Step 7):* Khách hàng đã thanh toán và sở hữu hóa đơn sơ bộ `route_id = NULL` từ khi tạo đơn. Khi route được xác nhận (`confirmed`), hệ thống tự động liên kết `route_id` vào hóa đơn hiện có; **tuyệt đối không sinh thêm hóa đơn thứ hai** và không yêu cầu khách hàng thanh toán lại.
- Điều kiện xuất phát vẫn yêu cầu đủ tiền (`isPaymentSucceeded === true`), đủ hồ sơ (100% compliant) và lộ trình đã xác nhận.

---

## 2. Dữ liệu và thực thể quản lý

- **Phương tiện (Vehicle):** Loại xe (xe thùng chuyên dụng điều hòa nhiệt độ, xe tải thường, air stall/container), biển số/mã, sức chứa (số ngựa), vị trí hiện tại, trạng thái (`available`, `in_use`, `maintenance`).
- **Hãng bay (Airline):** Tên hãng, mã IATA, thông tin liên hệ dịch vụ hàng hóa chuyên chở động vật sống.
- **Sân bay (Airport):** Tên sân bay, mã ICAO/IATA, quốc gia, thành phố, hỗ trợ kiểm dịch cargo (Có/Không).
- **Điểm dừng danh mục (Master Stops):** Danh mục trạm dừng mẫu gồm: Điểm dừng nghỉ cho ngựa (Rest), Trạm kiểm dịch (Quarantine), Trạm nhiên liệu (Refuel), Cửa khẩu/Hải quan (Border check).
- **Kế hoạch chuyến đi (Trip Plan):** Mã kế hoạch, mã đơn vận chuyển, khung chiến lược của Manager, Coordinator phụ trách, trạng thái (`draft`, `pending_approval`, `approved`, `confirmed`, `ready_to_depart`), lý do trả về (nếu có).
- **Chặng vận chuyển (Trip Legs):** Thứ tự chặng, loại chặng (Đường bộ / Bay), điểm đi/đến, khoảng cách/thời gian ETA, giờ xuất phát/đến dự kiến.
  - *Chặng đường bộ:* Phương tiện cụ thể được gán (`vehicle_id`).
  - *Chặng bay:* Hãng bay, số hiệu chuyến bay, sân bay đi/đến, giờ cất cánh/hạ cánh, mã đặt chỗ (booking code), số stall đã book.
- **Điểm dừng của chặng (Leg Stops):** Thuộc chặng, thứ tự dừng, loại điểm dừng, thời gian dự kiến (ETA).
- **Phân công nhân sự (Assignments):** Kế hoạch, nhân sự (Specialist, Driver, Escort), cá thể ngựa phụ trách, chặng phụ trách, trạng thái xác nhận (`pending`, `confirmed`).

---

## 3. Quy trình từng bước chi tiết

### Bước 0. Chuẩn bị dữ liệu nền (Coordinator / Quản trị viên)
- Quản lý danh mục phương tiện, danh mục hãng bay, sân bay quốc tế cargo, trạm dừng nghỉ và trạm kiểm dịch mẫu.

### Bước 1a. Manager lập khung kế hoạch tổng thể (Cấp chiến lược)
- Đơn hàng sau khi được khách hàng chấp nhận báo giá tự động xuất hiện tại danh sách **"Chờ lập kế hoạch"**.
- Logistics Manager mở đơn và thiết lập khung chiến lược:
  1. Chọn nhóm/loại phương tiện đường bộ yêu cầu (ví dụ: *Xe thùng chuyên dụng điều hòa 18°C*).
  2. Với chuyến quốc tế: Chọn hãng hàng không đối tác và các điểm trung chuyển chính (sân bay xuất phát, sân bay hạ cánh).
  3. Chọn tuyến đường chính (ví dụ: *Tuyến qua Sân bay Cần Thơ* hoặc *Tuyến qua Sân bay Tân Sơn Nhất*).
  4. Chỉ định Fleet & Route Coordinator chịu trách nhiệm soạn thảo chi tiết.
- Kế hoạch được khởi tạo ở trạng thái **`Draft`**.

### Bước 1b. Coordinator dựng kế hoạch chi tiết (Cấp thực thi)
- Coordinator tiếp nhận khung chiến lược và thực hiện hoàn thiện:
  1. **Chọn xe cụ thể:** Chọn xe có biển số cụ thể (`vehicle_id`), kiểm tra sức chứa $\ge$ số lượng ngựa của đơn hàng.
  2. **Dựng các chặng (Legs) và điểm dừng (Stops):**
     - *Nội địa:* Thường gồm 1 chặng đường bộ nối từ nơi gửi đến nơi nhận, bổ sung các trạm nghỉ/nhiên liệu theo quy định W welfare.
     - *Quốc tế:* Dựng tối thiểu 3 chặng: Chặng bộ ra sân bay $\rightarrow$ Chặng bay quốc tế $\rightarrow$ Chặng bộ từ sân bay đến nơi nhận.
     - Tính toán giờ xuất phát chặng xe trước chuyến bay lùi lại theo công thức: Giờ cất cánh $-$ Thời gian làm thủ tục kiểm dịch/cargo tại sân bay $-$ Thời gian xe chạy trên đường.
  3. **Nhập thông tin chuyến bay cụ thể:** Số hiệu chuyến bay, giờ bay thực tế, mã đặt chỗ booking, số stall cho ngựa trong hãng hàng không Manager đã định hướng.
  4. **Gửi duyệt:** Coordinator kiểm tra tổng thể lộ trình, bấm **"Gửi duyệt kế hoạch"** $\rightarrow$ Trạng thái chuyển sang **`Pending Approval`**.

### Bước 2. Manager duyệt kế hoạch lộ trình
- Logistics Manager xem xét toàn bộ kế hoạch do Coordinator vừa dựng (thời gian, lộ trình các chặng, xe phân bổ, chuyến bay).
- **Phê duyệt:** Chuyển trạng thái sang **`Approved`**.
- **Trả về kèm lý do:** Kế hoạch quay lại trạng thái **`Draft`** cùng phản hồi/lý do để Coordinator điều chỉnh lại ở Bước 1b.

### Bước 3. Phân công nhân sự & Gửi thông báo xác nhận
- Manager (hoặc Coordinator phối hợp) gán nhân sự thực hiện:
  - Tái sử dụng Transport Specialist đã phụ trách ở Flow 2.
  - Phân công Tài xế (Driver) và Hộ tống viên (Escort) phụ trách từng xe/chặng.
- Hệ thống gửi thông báo phân công nhiệm vụ đến từng Driver/Escort (kèm lịch trình, danh sách ngựa, điểm dừng).
- Từng Driver/Escort truy cập hệ thống và bấm **"Xác nhận nhận chuyến"**.
- Khi toàn bộ nhân sự được phân công đã xác nhận $\rightarrow$ Kế hoạch chuyển sang trạng thái **`Confirmed`**.
- Khách hàng nhận được thông báo lộ trình dự kiến chính thức của chuyến đi.

### Bước 4. Cổng hội tụ kiểm soát xuất phát (Ready to depart)
- Chuyến đi tự động chuyển sang trạng thái **`Ready to depart`** khi và chỉ khi **CẢ BA** điều kiện được thỏa mãn:
  1. Kế hoạch lộ trình & phương tiện ở trạng thái **`Confirmed`** (Flow 3 xong - đã phân công và tài xế xác nhận).
  2. Toàn bộ hồ sơ kiểm dịch, hải quan của đàn ngựa đã được Chuyên viên & Cơ quan chức năng phê duyệt đạt chuẩn 100% (`isFullyCompliant === true`, Flow 2 xong).
  3. Cước phí vận chuyển đã được ngân hàng xác nhận qua SePay, đúng số tiền hóa đơn (`shipment_sepay_payment.status = succeeded`; MoMo sandbox không được tính là tiền thật) (`isPaymentSucceeded === true`).
- Nếu thiếu một trong ba điều kiện:
  - Hệ thống **chặn xuất phát** và hiển thị rõ lý do đang chờ: *"Đang chờ phê duyệt đủ hồ sơ kiểm dịch"*, *"Đang chờ xác nhận từ đội ngũ tài xế"* hoặc *"Đang chờ khách hàng hoàn tất thanh toán cước vận chuyển"*.
- **Đầu ra:** Khi đạt `Ready to depart`, chuyến đi sẵn sàng cho Flow 4 (Tài xế bấm bắt đầu xuất phát và cập nhật nhật ký hành trình).

---

## 4. Bảng chuyển dịch trạng thái kế hoạch

```
[Khách chấp nhận đơn]
        │
        ▼
   (Bước 1a)
     Draft (Manager định khung & giao Coordinator)
        │
        ▼
   (Bước 1b)
Pending Approval (Coordinator dựng chi tiết & bấm gửi)
   │           ▲
   │ (Duyệt)   │ (Trả về kèm lý do)
   ▼           │
Approved ──────┘
   │
   ▼
(Bước 3 - Driver/Escort xác nhận)
Confirmed
   │
   │ ── + Hồ sơ kiểm dịch Flow 2 hoàn tất (isFullyCompliant = true)
   ▼
Ready to depart ──► [Chuyển giao sang Flow 4: Theo dõi hành trình]
```

---

## 5. Quy tắc nghiệp vụ (Business Rules)

1. Tổng sức chứa của các phương tiện được chọn phải $\ge$ số lượng ngựa trong đơn hàng.
2. Mỗi chặng phải có thứ tự tuần tự rõ ràng (`sequence_no`), chặng sau bắt đầu sau khi chặng trước kết thúc.
3. Chặng đường bộ xuyên biên giới hoặc chặng bay quốc tế bắt buộc phải có điểm dừng làm thủ tục hải quan / kiểm dịch.
4. Chuyến đi tuyệt đối **không được xuất phát** (`Ready to depart`) nếu hồ sơ pháp lý kiểm dịch ở Flow 2 chưa hoàn tất 100%.
5. Nếu phát sinh thay đổi lịch kiểm dịch ở Flow 2 làm ảnh hưởng ngày bay, Coordinator được phép mở lại kế hoạch về `Draft` để điều chỉnh ngày giờ các chặng và gửi Manager duyệt lại.


## 6. Cổng thanh toán sau xác nhận (11/11/2026)

- Duyệt Flow 1 chỉ có báo giá dự kiến. Hoàn tất Flow 2 cũng không tự mở QR.
- Manager phải duyệt kế hoạch chi tiết; Driver/Escort chỉ xác nhận phân công của mình. Tất cả Driver/Escort phải xác nhận, các chặng phải có xe/chuyến bay và giờ đi/đến hợp lệ.
- Lần xác nhận cuối ghi `confirmed`, tạo `shipment_invoice` và thông báo thanh toán trong cùng transaction. Một route có một hóa đơn; gửi lại không sinh trùng. Hóa đơn chụp lại giá VND, thông tin khách và các chặng tại thời điểm phát hành.
- Customer đọc hóa đơn và in/lưu PDF trong chi tiết đơn hoặc trang thanh toán. Đây là hóa đơn cước vận chuyển của ứng dụng, không tích hợp hóa đơn thuế điện tử.
- API SePay kiểm tra route mới nhất, xác nhận nhân sự, hóa đơn và giá hiện hành ở cả tạo QR, đọc QR và nhận tiền. Không suy ra đủ điều kiện từ `activeStepIndex` hay chỉ từ trạng thái đơn `planning`.
- Thanh toán hợp lệ và thay đổi hồ sơ kích hoạt đánh giá lại cổng xuất phát. Thiếu một trong ba điều kiện thì chưa được `ready_to_depart`. Báo giá 0 không được xem là đã thanh toán. API xuất bản và mốc xuất phát Flow 4 cũng phải kiểm tra cổng này.
- Giữ giá trị trạng thái thanh toán đang dùng là `succeeded` (ý nghĩa đã trả tiền), không thêm giá trị `paid` song song.
- Migration `016_route_payment_gate.sql` không sửa lịch sử thanh toán. Với kế hoạch cũ chưa có hóa đơn, Driver/Escort hoặc Admin xác nhận lại phân công để phát hành hóa đơn; không backfill bằng cách giả định kế hoạch lịch sử đã hợp lệ.
- Cấu hình khung, dựng lại chi tiết và duyệt lại không được sửa ngầm kế hoạch đã xác nhận/phát hành hóa đơn. Điều chỉnh điểm dừng trong chuyến đi vẫn theo API lịch trình và lý do hiện có; hóa đơn giữ snapshot lúc phát hành.

## 7. Shared/Dedicated đường bộ — phạm vi được duyệt ngày 12/11/2026

- Coordinator tạo chuyến đường bộ từ chặng mới khi lưu kế hoạch, hoặc chọn `roadTripId` để ghép thủ công các đơn phù hợp. Coordinator chịu trách nhiệm đánh giá tuyến và lịch; không đặt ngưỡng lệch giờ/khoảng cách tự động.
- Một chuyến lưu xe, loại booking, điểm đi/đến và khoảng giờ bất biến. Chọn chuyến có sẵn lấy thông tin chặng từ chuyến, không tin xe/giờ/slot do client gửi kèm. Một đơn có một phân bổ trên mỗi chuyến; mỗi ngựa chiếm một Stall.
- Shared cho nhiều Customer cùng chuyến; Dedicated chỉ cho một đơn sử dụng xe trong khoảng giờ đã đặt. Các chuyến khác trên cùng xe không được trùng khoảng giờ. Hai khoảng có giờ kết thúc/bắt đầu bằng nhau không giao nhau.
- Lưu kế hoạch khóa shipment/route và khóa các xe theo ID tăng dần trong cùng transaction, rồi kiểm tra tổng slot, ghi các chặng và liên kết xe. Không xác nhận phần phân bổ khi bất kỳ chặng nào thất bại. Xác nhận nhận chuyến kiểm tra lại capacity và reservation, gồm kế hoạch cũ chưa có roadTripId.
- Phân bổ cũ chưa có giờ/chuyến phải được điều phối lại trước khi dùng xe cho đơn khác. Các API phân công xe không có lịch không được thay thế phân bổ đã nằm trong kế hoạch; dùng màn hình lập tuyến để sửa/ghép.
- Khoảng đặt chỗ đã ghi vẫn được đối chiếu khi kiểm tra trùng thời gian; không tự xóa lịch sử đặt chỗ khi hoàn tất đơn. Hóa đơn giữ snapshot riêng, bao gồm booking và chặng đường bộ.
- Danh sách chuyến ghép chỉ dành cho Coordinator/Manager/Admin, không trả danh sách khách/ngựa của các đơn khác. Customer chỉ đọc route/plan của đơn thuộc mình.
- MoMo sandbox không cập nhật trạng thái vận hành hoặc trạng thái đã thanh toán chính thức của đơn. Mọi mutation sandbox kiểm tra cờ bật và môi trường; số tiền lấy nguyên giá trị VND đã chốt. Readiness vẫn dựa vào SePay và hồ sơ pháp lý.
- Chưa được duyệt mô hình vận hành ghép/thuê riêng hàng không. Giữ nguyên các trường hãng bay, flight booking reference và stalls hiện có; không thêm quy tắc thuê cả chuyến bay/khoang riêng.
- Migration 019 thêm road_trip và route_leg.road_trip_id; không backfill hoặc sửa giá/booking lịch sử. Chạy sau các migration hiện có trên môi trường được phép.
- Migration 020 lưu riêng shipment.transport_mode (road/air), không thay Domestic/International. Chọn mode tại bước duyệt giá và giữ trong response/snapshot; dữ liệu cũ không bị suy đoán hoặc sửa tự động.
- Migration 021 (`021_add_transfer_hub_stop_type.sql`) bổ sung `'transfer_hub'` vào `route_stop.stop_type` ENUM để lưu các điểm đón/trả ghép trung gian trên chuyến đường bộ hợp nhất.
- Khi ghép nhiều đơn `shared_stall` khác điểm đón hoặc khác điểm trả vào cùng `road_trip`, `routes.store` (`consolidateSharedRoadTripWaypoints` cùng helper `road-trip-sequencing.ts`) tự động sắp xếp lộ trình vật lý dọc hành lang: Điểm đón xa nhất -> Điểm đón ghép gần hơn (`stop_type = 'transfer_hub'`) -> Các trạm dừng chung dọc tuyến -> Điểm trả ghép gần hơn (`stop_type = 'transfer_hub'`) -> Điểm trả xa nhất, cập nhật `road_trip` và đồng bộ `route_stop` trên các đơn cùng chuyến.
- API đọc route (`routes.service`) thực hiện ẩn dữ liệu phía server cho role `Customer`: loại bỏ điểm `transfer_hub`, ẩn `roadTripId` và giữ nguyên điểm đi/đến thuộc chính đơn của khách hàng.

## 8. Chuẩn hóa SLA Xác nhận Tài xế, Backup Pool, Thanh toán Động & AC (BA Spec v3.1 — `DEC-05` & `DEC-08` Approved)

> [!IMPORTANT]
> Phân quyền thao tác tuân thủ Ma trận RACI tại [actors-and-roles.md](file:///f:/SWP/Project/SWP391_GROUP1/docs/actors-and-roles.md).

### Quy tắc Nghiệp vụ Bổ sung (`BR-F3-05` → `BR-F3-07`, `DEC-08`)

- **`BR-F3-05` (Driver Confirmation SLA, Backup Pool & Invoice Hard Cap `T - 52h` — `Target Spec v3.1 (Planned)`):**
  - Sau khi được phân công (chậm nhất `T - 70h`), Driver/Escort chính phải bấm Confirm/Decline trong **4 giờ làm việc (`08:00–18:00`) hoặc tối đa 12 giờ đồng hồ liên tục** (nhắc ở mốc 50%: 2 giờ làm việc / 6 giờ đồng hồ), hướng tới mục tiêu phát hành hóa đơn chậm nhất `T - 58h`.
  - Quá SLA → hệ thống gửi Escalation lên Coordinator & Manager để chuyển sang **Backup Pool** với **Backup SLA rút gọn = 4 giờ đồng hồ**. Việc thay đổi nhân sự cùng vai trò trên kế hoạch đang `approved` **không làm mất trạng thái `approved`** (không cần quay về `draft` nếu xe và giờ giữ nguyên).
  - **Trần cứng phát hành hóa đơn (`Invoice Hard Cap`): `T - 52h`**. Nhân sự cuối cùng xác nhận trong cùng 1 transaction sẽ chuyển `confirmed`, phát hành duy nhất 1 `shipment_invoice` và mở Gate 1.
  - **Từ chối sau khi đã xác nhận (`POST /routes/plan/:id/driver-decline`):** Driver/Escort được từ chối khi đơn chưa xuất phát. Xử lý trong một transaction, khóa shipment rồi route:
    - Ghi phân công `TỪ CHỐI: <lý do>`; chỉ áp dụng cho vai trò `driver`/`escort`.
    - Nếu route đang `confirmed`/`ready_to_depart` → về `approved` (kế hoạch vẫn đã duyệt, chờ nhân sự xác nhận).
    - Nếu shipment đang `confirmed`/`ready_to_depart` → về `planning` qua state machine, ghi `shipment_status_history` với `reason_code = staff_declined`.
    - Manager nhận cảnh báo; khách nhận thông báo chuyến tạm chưa đủ điều kiện xuất phát.
    - Hóa đơn và thanh toán giữ nguyên. Khi người thay thế xác nhận, đơn quay lại `confirmed` và chỉ gắn lại hóa đơn hiện có, không phát hành hóa đơn mới.
    - Không cho từ chối khi đơn đã `in_transit`, `return_pending` hoặc đã đóng (`409`); sự cố trên đường xử lý qua Flow 5.
- **`BR-F3-06` (Fallback khi Không đủ Backup Pool hoặc Quá Trần `T - 52h` — `Target Spec v3.1 (Planned)`):** Nếu trước `T - 62h` không đủ nhân sự thay thế hoặc chạm trần `T - 52h` vẫn chưa xác nhận đủ, hệ thống phát cảnh báo High tới Logistics Manager để chọn: **(a)** điều chuyển nội bộ từ chuyến có lịch xa hơn; **(b)** kích hoạt tài xế/hộ tống hợp đồng ngoài đã thẩm định (`Pre-vetted External Contractor`); hoặc **(c)** dời lịch chuyến (cho phép khách chọn dời ngày miễn phí hoặc `cancelled_operational` hoàn 100%).
- **`BR-F3-07` (Cửa sổ Thanh toán Động, Gia hạn Trần `T - 24h` & Tự hủy — `Target Spec v3.1 (Planned)`):**
  - Hạn thanh toán neo theo thời điểm xuất hóa đơn thực tế: `payment_due_at = MIN(invoice_issued_at + 24h, departure_at - 30h)` (nhắc trước hạn 6 giờ).
  - Quá `payment_due_at` chưa có SePay `succeeded` → gắn trạng thái con `payment_overdue` và báo động Manager + Coordinator. Manager chọn giải phóng chuồng (`cancelled_operational`) trước `T - 28h`, hoặc cấp gia hạn **1 lần duy nhất** với hạn `grace_due_at = MIN(grace_granted_at + 10h, departure_at - 24h)`.
  - Quá `grace_due_at` vẫn chưa thanh toán → hệ thống **tự động chuyển `cancelled_operational`** (`cancellation_category = payment_overdue_expired`) để giải phóng ô chuồng.
- **`DEC-08` (Xác nhận Vận hành Hàng không Release 1):** Release 1 giữ quản lý chặng bay ở mức Coordinator nhập thủ công (`airline_id`, `flight_number`, `booking_reference`, `stalls_booked`), chưa mở ghép Airstall đa khách hàng tự động.

### Acceptance Criteria (BDD — Flow 3)

- **AC-F3-01 (Chặn Overbooking Đồng thời):** *Given* xe 4 chuồng đã có `road_trip` `shared_stall` giữ 3 chuồng 08:00–18:00. *When* Coordinator ghép thêm đơn 2 ngựa hoặc tạo `dedicated_charter` trùng khung giờ. *Then* giao dịch rollback hoàn toàn và trả `409 Conflict`.
- **AC-F3-02 (Hóa đơn Duy nhất & Mở Gate 1):** *Given* kế hoạch `approved` có 1 Driver và 1 Escort. *When* Driver xác nhận trước, Escort xác nhận sau (kể cả gửi lặp request retry). *Then* chuyển `confirmed`, phát hành đúng 1 `shipment_invoice` bất biến và mở `paymentUnlocked = true`.
- **AC-F3-03 (Cô lập Dữ liệu Khách trên Chuyến Ghép):** *Given* Đơn A (TP.HCM → Hà Nội) và Đơn B (Đồng Nai → Đà Nẵng) ghép chung 1 `road_trip`. *When* Customer A xem lộ trình đơn A. *Then* response ẩn hoàn toàn `transfer_hub` của Đơn B, `roadTripId` và danh tính Đơn B.
- **AC-F3-04 (Backup SLA & Hard Cap `T - 52h`):** *Given* Driver chính quá SLA lúc `T - 58h`, Coordinator gán Backup Driver B (kế hoạch giữ nguyên `approved`); Backup Driver B xác nhận lúc `T - 54h`. *Then* hóa đơn phát hành lúc `T - 54h` với `payment_due_at = T - 30h`. Nếu tới `T - 52h` vẫn chưa xác nhận đủ, hệ thống phát cảnh báo High `BR-F3-06` tới Manager.
- **AC-F3-05 (Gia hạn Thanh toán Trần `T - 24h` & Tự động Hủy):** *Given* hóa đơn quá hạn lúc `T - 34h` (`payment_overdue`), đến `T - 28h` Manager bấm gia hạn 1 lần. *Then* `grace_due_at` bị chặn cứng tại `T - 24h` (còn 4 giờ); bấm gia hạn lần 2 trả `409 Conflict`; tại `T - 24h` nếu vẫn chưa có SePay `succeeded`, đơn tự động chuyển `cancelled_operational` (`payment_overdue_expired`).

---

## 5. Quy định Vận chuyển Đường Thủy (Sea Transport — Step 4)

Hệ thống hỗ trợ 2 dạng vận chuyển đường thủy (`sea`) với các ràng buộc an toàn nghiêm ngặt:

1. **Phà kết hợp xe tải (`sea_mode = 'ferry'` / RoRo):**
   - Áp dụng cho các chặng vượt biển ngắn (ví dụ: đất liền ra đảo Phú Quốc, vịnh, eo biển).
   - Ngựa lưu lại bên trong xe thùng chuyên dụng có điều hòa nhiệt độ (`truck_1`, `truck_2`, `truck_4`, `truck_6`).
   - **Giới hạn thời gian biển:** Thời gian di chuyển đường biển thực tế tối đa không được vượt quá **12 giờ** (`typical_hours <= 12`). Nếu tuyến biển vượt quá 12 giờ, hệ thống từ chối phương thức `ferry`.
   - **Cấu trúc cước:** Tính cước đường bộ lũy tiến suốt quãng đường từ điểm đón đến điểm giao, cộng thêm vé xe tải lên phà (`vehicle_ticket_vnd`).

2. **Tàu biển chuyên dụng (`sea_mode = 'vessel'`):**
   - Ngựa được đưa vào ô chuồng/pen chuyên dụng trên boong hoặc hầm tàu chở gia súc/tàu chuyên dùng.
   - **Ràng buộc kết nối cảng:** Gồm 3 chặng vận chuyển: Xe đường bộ đến cảng đi $\rightarrow$ Tàu biển giữa 2 cảng $\rightarrow$ Xe đường bộ từ cảng đến về đích.
   - **Giới hạn khoảng cách đường bộ ra vào cảng:** Mỗi chặng đường bộ nối với cảng không được vượt quá **400 km** để tránh ngựa kiệt sức trước và sau hải trình dài.
   - **Cảnh báo sức khỏe:** Bắt buộc hiển thị khuyến cáo minh bạch cho khách hàng: *"Đường thủy rẻ hơn nhưng lâu hơn và rủi ro sức khỏe cao hơn. Khuyến nghị đường hàng không cho ngựa đua thi đấu."*
   - Cước tính dựa trên biểu cước hải trình cảng - cảng kết hợp phí bốc dỡ và chăm sóc tại cảng.


## 9. Định hướng Lộ trình Khứ hồi & Phân bổ Chặng (Step 5 — Review 11/2026)

- Mỗi chặng `route_leg` và điểm dừng `route_stop` được phân định rõ trường `direction: 'outbound' | 'return'` (mặc định `'outbound'`).
- Đơn hàng một chiều (`trip_type = 'one_way'`) bị nghiêm cấm chứa bất kỳ chặng nào có `direction = 'return'`; nếu vi phạm khi gọi `POST /routes/plan/:id/build-detail`, server từ chối với mã lỗi `400 Bad Request`.
- Đơn hàng khứ hồi (`trip_type = 'round_trip'`) bắt buộc phải có ít nhất 1 chặng `outbound` và ít nhất 1 chặng `return`. Thời điểm xuất phát chặng về (`planned_departure` của chặng `return` đầu tiên) phải thỏa mãn `>= shipment.return_departure_at`.
- Coordinator có thể bổ sung chặng về bằng nút "Thêm Chặng Về" trên giao diện lập tuyến và linh hoạt điều phối xe/tài xế riêng cho từng chiều di chuyển.

## 10. Phân bổ xe, giữ chỗ xe, trạm own/partner, đổi xe có lý do (Step 9 — Review 11/2026)

**Phân bổ khi báo giá** (`fleet/allocation-policy.ts`, hàm thuần):

1. Lấy xe đường bộ **rảnh** trong khung `[giờ đón − 2h, giờ đón + ETA + 2h]` theo từng trạm `own` đang hoạt động (không bảo dưỡng, không trùng `vehicle_reservation` còn hiệu lực, không trùng `route_leg` của đơn đang hoạt động). Khoảng cách chạy rỗng: OpenRouteService cho 3 trạm gần nhất (Haversine), các trạm còn lại Haversine × 1,3.
2. Với từng trạm, liệt kê **tổ hợp xe tối thiểu** đủ số chỗ chuồng (1 chỗ / ngựa), tối đa 4 xe; xe cùng loại cùng trạm coi là tương đương để tránh nổ tổ hợp.
3. Không trạm nào đủ một mình → **ghép xe 2 trạm gần nhất** (`two_depots`). Xe lớn nhất của trạm gần nhất không chở hết một lượt → thêm phương án **chia nhiều ngày** (`split_days`, tối đa 4 lượt): cước = cước một lượt × số lượt + chạy rỗng quay đầu (điểm giao → điểm đón) giữa các lượt; `extraDays = số lượt − 1`.
4. Chọn tối đa **3 phương án**: Rẻ nhất · Ít xe nhất · Đến sớm nhất (trạm gần nhất), gộp phương án trùng tập xe. Đề xuất = Rẻ nhất. Không có phương án → gợi ý 3 ngày gần nhất (trong 14 ngày) có đủ xe.

**Giữ chỗ xe** (`fleet/vehicle-reservation.ts`, bảng `vehicle_reservation`):

- Tạo đơn từ báo giá + `optionCode`: trong **transaction tạo đơn**, khóa xe theo `vehicle_id ASC` (`SELECT … FOR UPDATE`), kiểm tra lại trùng giờ, tạo reservation `active`. Xe đã bị đơn khác giữ → `409` "Xe trong phương án đã được đặt, vui lòng báo giá lại" (toàn bộ đơn rollback).
- **Nhả** (`released`) khi đơn chuyển sang `cancelled` (khách hủy, hết hạn thanh toán), `refund_requested`, `refunded`, `cancelled_operational`, `rejected` — gọi tập trung trong `transitionShipment` và ở các chỗ cập nhật trạng thái trực tiếp. Truy vấn "xe bận" cũng bỏ qua reservation của đơn đã kết thúc (phòng thủ nếu quên nhả).
- **Consumed** khi kế hoạch chi tiết lưu chặng dùng đúng xe đã giữ.
- Reservation không bị xóa: lịch sử giữ/nhả/đổi xe được giữ nguyên.

**Đoàn xe (nhiều xe cho một đơn)**: kế hoạch chi tiết vẫn gắn một **xe dẫn đầu** cho mỗi chặng bộ; xe nằm trong nhóm đã giữ chỗ cùng hướng được tính sức chứa bằng **tổng sức chứa cả đoàn** (`applyConvoyCapacity`). Xe ngoài nhóm giữ nguyên quy tắc Step 3 (mỗi xe phải đủ chỗ cho cả đơn).

**Trạm đối tác nước ngoài**: chặng giao sau sân bay/cảng ở nước ngoài dùng trạm `partner` gần điểm giao nhất (≤ 300 km) và bảng giá `pricing_tariff` mode `road`, `region = 'PARTNER'`; chạy rỗng tính từ trạm đối tác đến sân bay/cảng đến. Không có trạm đối tác trong 300 km → dùng bảng giá VN, cảnh báo `NO_PARTNER_DEPOT`.

**Manager đổi xe/trạm**:

- `POST /fleet/shipments/:id/reservations/swap` (bắt buộc lý do ≥ 5 ký tự): khóa xe, giữ xe mới cùng khung giờ, nhả xe cũ (`released_reason = manager_swap`), cập nhật chặng `pending` đang dùng xe cũ kèm `route_leg.allocation_override_reason`, ghi `trip_status_log` (`milestone_type = allocation_override`) và nối lịch sử vào `shipment.allocation_snapshot.overrides`. Tổng sức chứa sau khi đổi vẫn phải đủ.
- Trong màn dựng kế hoạch, chặng bộ dùng xe **khác** nhóm đã giữ phải nhập `allocationOverrideReason`, nếu không backend trả `400`.

**Chặng bay**: `route_leg.jet_stall_count` = ⌈tổng số ngựa / 3⌉; `stalls_booked` giữ nghĩa cũ (số chỗ ngựa).

## 11. Tinh gọn & Đồng bộ Điều phối từ Báo giá (Flow 3 Consolidation — 11/2026)

Sau khi gộp vai trò Coordinator vào Logistics Manager (G1) và mở rộng báo giá tự động (`shipment_quote` + `vehicle_reservation`), Flow 3 được tinh gọn thành luồng **Xác nhận lộ trình từ báo giá → Chốt 1 bước → Phân công Tài xế/Bác sĩ**:

1. **Tự nạp lộ trình từ dữ liệu khách đặt (`GET /routes/shipment/:shipmentId/draft-suggestion`):**
   - Khi mở đơn chưa có `route` trên `/manager/dispatch/routes`, hệ thống tự đọc `shipment_quote` (`routePlan.legs`, `legs`), `vehicle_reservation` (phân biệt rõ `outbound` và `return`), `pickup_at` (giữ nguyên giờ đón đã né giờ cấm tải đô thị) và `trip_type` để nạp sẵn `legs[]` (`road` / `flight` / `sea` + chặng `return`) và `stops[]` (kể cả cửa khẩu cho đường bộ xuyên biên giới).
   - Đơn cũ không có `quote_id` fallback theo đúng `shipment.transport_mode` (`road` / `air` / `sea`), không bao giờ ép đơn đường bộ sang mẫu Hàng không.
2. **Chốt kế hoạch 1 bước (bỏ vòng tự gửi duyệt cho chính mình):**
   - Nút chính **"Lưu & Chốt Kế Hoạch"** gọi `POST /routes/plan/:id/build-detail` và phê duyệt trực tiếp qua `POST /routes/plan/:id/review` (`status = 'approved'`, tận dụng `canApproveDirectly` ở backend), sẵn sàng phân công Tài xế/Bác sĩ ngay trên `/manager/planning`.
3. **Tinh gọn giao diện Điều phối còn 2 tab rõ vai trò:**
   - Tab 1: **Điều Phối & Phân Công** (`/manager/planning`) — danh sách đơn đã duyệt khả thi, hiển thị trạng thái thực của `route.planStatus`, khóa read-only `transportCost` cho đơn trả trước đã thanh toán, phân công nhân sự và kiểm tra Gate 2.
   - Tab 2: **Xác Nhận Lộ Trình** (`/manager/dispatch/routes`) — bỏ Tab 2 `localStorage` trùng lặp và banner Khung chiến lược cũ, hỗ trợ đầy đủ giao diện chặng **Đường thủy (`sea`)** (`Cảng đi/đến`, `bookingReference` B/L tùy chọn, `stallsBooked` = số `vessel_pen`) và chặng **Khứ hồi (`return`)**.
   - Route `/manager/dispatch/schedule` chuyển hướng sạch sang `/manager/monitoring`.
4. **Đồng bộ Đường thủy (`sea`) toàn tuyến & Vá lỗi Flow 5 Emergency Reroute:**
   - `fleet.store` (`validateStaffAssignment`, `findAvailableStaff`) và `tracking.service` (`checkInLegEnd`) xử lý chặng `sea` đồng nhất với `flight`: không khóa tài xế xe tải chặng 1 xuyên hải trình nhiều ngày và tự giải phóng xe tải VN về `available` ngay khi hoàn tất chặng 1 tới cảng đi.
   - `routes.store` (`confirmAndInvoice`) xác thực tối thiểu cho chặng `sea` (`planned_departure`, `planned_arrival > planned_departure`, `stalls_booked >= 1`).
   - Khi reroute khẩn cấp trên chuyến đang `in_transit` (Flow 5), giao diện lưu trực tiếp chặng thay thế và đóng sự cố mà **không** gọi `POST /routes/plan/:id/submit`.

