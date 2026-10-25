# Flow 3: Lập kế hoạch lộ trình và điều phối phương tiện (Route Planning and Fleet Coordination)

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
- Chuyến đi tự động chuyển sang trạng thái **`Ready to depart`** khi và chỉ khi **CẢ HAI** điều kiện song song được thỏa mãn:
  1. Kế hoạch lộ trình & phương tiện ở trạng thái **`Confirmed`** (Flow 3 xong).
  2. Toàn bộ hồ sơ kiểm dịch, hải quan của đàn ngựa đã được Chuyên viên & Cơ quan chức năng phê duyệt đạt chuẩn 100% (`isFullyCompliant === true`, Flow 2 xong).
- Nếu thiếu một trong hai điều kiện:
  - Hệ thống **chặn xuất phát** và hiển thị rõ lý do đang chờ: *"Đang chờ phê duyệt đủ hồ sơ kiểm dịch"* hoặc *"Đang chờ xác nhận từ đội ngũ tài xế"*.
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
