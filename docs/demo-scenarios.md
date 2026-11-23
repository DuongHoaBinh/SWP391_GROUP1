# KỊCH BẢN DEMO HỆ THỐNG EQUITRANSIT (HẬU REVIEW 11/2026)

Tài liệu này hướng dẫn chi tiết **8 kịch bản trình diễn (mỗi kịch bản < 3 phút)** để chứng minh và bảo vệ 12 nhóm góp ý của Hội đồng thẩm định (G1 đến G12).

---

## Danh sách tài khoản thử nghiệm

Dữ liệu demo được khởi tạo bằng lệnh:
```bash
cd backend && npm run seed:demo
```
*(Mật khẩu khởi tạo chung được cấu hình trong `backend/.env` qua biến `DEMO_ACCOUNT_PASSWORD`)*

| Vai trò | Email đăng nhập | Mô tả & Phân quyền |
|---|---|---|
| **Customer A** | `customer_a@example.com` | Khách hàng chủ lực (sở hữu 4 ngựa đua: Xích Thổ, Bạch Long, Hoàng Phi, Ô Long) |
| **Customer B** | `customer_b@example.com` | Khách hàng độc lập (sở hữu 1 ngựa: Kiếm Phong, dùng để thử phân quyền cô lập) |
| **Logistics Manager 1** | `manager_a@example.com` | Quản lý vận hành (duyệt tính khả thi, duyệt hoàn tiền lần 1, duyệt claim) |
| **Logistics Manager 2** | `manager_b@example.com` | Quản lý vận hành độc lập (kiểm thử SoD phê duyệt kép Dual-Approval) |
| **Admin / Finance** | `admin_demo@example.com` | Quản trị viên hệ thống & Tài vụ chuyển tiền thủ công |
| **Driver 1** | `driver_demo1@example.com` | Tài xế chuyên trách xe `DEMO-51C-001` (4 chỗ) |
| **Driver 2** | `driver_demo2@example.com` | Tài xế chuyên trách xe `DEMO-51C-002` (2 chỗ) |
| **Escort Vet** | `escort_demo@example.com` | Bác sĩ thú y áp tải kiểm tra sinh hiệu |

---

## Kịch bản 1: Đặt chuyến nội địa HCM → Đà Lạt (Giờ cấm đô thị & Báo giá 3 phương án)
- **Mục tiêu chứng minh:** **G4, G7, G9, G11** (Tách giá minh bạch, cấm ghép chuyến chia sẻ cước với người lạ, tính phụ phí giờ cấm đêm, phân bổ xe thông minh).
- **Thời lượng:** ~2.5 phút.
- **Tài khoản:** `customer_a@example.com`

### Các bước thực hiện:
1. Đăng nhập với tài khoản **Customer A**, vào trang [Tạo yêu cầu vận chuyển](file:///c:/Users/ttrrang/Documents/GitHub/SWP391_GROUP1/frontend/src/app/customer/requests/new/page.tsx) (`/customer/requests/new`).
2. **Bước 1 (Chọn phương thức & tuyến đường):**
   - Phương thức: **Đường bộ (Road)**.
   - Điểm đón: `Số 1 Công xã Paris, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh`.
   - Điểm trả: `Hồ Tuyền Lâm, Phường 4, TP. Đà Lạt, Lâm Đồng`.
   - Thời gian đón mong muốn: Ngày mai, lúc **09:00 sáng** (khung giờ cấm xe tải nặng tại trung tâm TP.HCM).
3. **Bước 2 (Chọn ngựa):**
   - Chọn 3 cá thể ngựa:
     - `Xích Thổ` (Standard).
     - `Bạch Long` (Standard).
     - `Hoàng Phi` (Tích chọn: **Yêu cầu chuồng riêng / Private Stall**).
   - Hệ thống hiển thị: Tổng số khoang yêu cầu = 4 khoang (2 thường + 1 chuồng riêng chiếm 2 khoang).
4. **Bước 3 (Nhận báo giá tự động):**
   - Nhấn **Nhận báo giá (Request Quote)**.
   - Quan sát kết quả hệ thống tính toán:
     - **Cảnh báo giờ cấm (City Restriction):** Điểm đón Quận 1 trong khung cấm 06:00 - 22:00 đối với xe tải nặng. Hệ thống tự động dời giờ xuất bến sang **22:00 cùng ngày**, cộng phụ phí vận hành ban đêm (Night-shift Surcharge +15%).
     - **Bảng 3 phương án xe:**
       - *Phương án 1 (Tối ưu - 1 xe 4 chỗ):* Xe 4 khoang đón từ Depot Thủ Đức, gom cả 3 ngựa, tổng cước trọn gói tiết kiệm nhất.
       - *Phương án 2 (3 xe 1 chỗ):* Sử dụng 3 xe nhỏ đi cùng thời điểm, giá cao hơn.
       - *Phương án 3 (Chia ngày):* Phương án dự phòng điều phối khi khan hiếm xe.
5. **Khôi phục / Chạy lại:** Huỷ báo giá hoặc chọn đơn khác mà không bấm xác nhận đặt cọc.

---

## Kịch bản 2: Vận chuyển quốc tế HCM → Singapore (Hàng không, Khứ hồi, Bảo hiểm toàn diện, Hoá đơn PDF)
- **Mục tiêu chứng minh:** **G3, G4, G4a, G4c, G5, G6, G7** (Vận chuyển hàng không quốc tế, khứ hồi, bảng bảo hiểm M1-M4 bằng tiền mặt, tái sử dụng hộ chiếu, trạm trung chuyển đối tác, hoá đơn VAT PDF).
- **Thời lượng:** ~3 phút.
- **Tài khoản:** `customer_a@example.com`

### Các bước thực hiện:
1. Vào trang [Tạo đơn vận chuyển](file:///c:/Users/ttrrang/Documents/GitHub/SWP391_GROUP1/frontend/src/app/customer/requests/new/page.tsx).
2. **Chọn loại hình & khứ hồi:**
   - Phương thức: **Đường hàng không (Air Cargo)**.
   - Tích chọn: **Vận chuyển khứ hồi (Round-trip)**.
   - Điểm đi: `Sân bay Quốc tế Tân Sơn Nhất (SGN), TP. Hồ Chí Minh`.
   - Điểm đến: `Sân bay Quốc tế Changi (SIN), Singapore`.
   - Trạm trung chuyển trả ngựa nước ngoài: Tự động gắn **Singapore Partner Depot (Kranji)**.
   - Ngày đi: `2026-12-15`, Ngày về: `2026-12-25` (cách 10 ngày).
3. **Chọn ngựa & Bảo hiểm:**
   - Chọn ngựa `Xích Thổ`.
   - Chọn gói bảo hiểm: **Toàn diện (Comprehensive - M3)**. Khai báo giá trị ngựa: `2.000.000.000 VND`.
   - Bảng so sánh quyền lợi bảo hiểm hiển thị rõ ràng bằng số tiền thật:
     - Mức bồi thường tối đa tử vong: 2.000.000.000 VND.
     - Chi phí y tế khẩn cấp: Tối đa 200.000.000 VND.
     - Phí bảo hiểm: Tự động cộng vào cấu trúc giá.
4. **Kiểm tra hồ sơ pháp lý:**
   - Hộ chiếu FEI của Xích Thổ còn hạn đến 2030 -> Hệ thống tự động **Tái sử dụng (Reused)** mà không bắt nộp lại.
   - Đính kèm tệp chứng nhận kiểm dịch xuất khẩu hợp lệ.
5. **Thanh toán & Xuất hoá đơn:**
   - Xác nhận báo giá -> Chuyển sang bước thanh toán SePay / VietQR.
   - Sau khi thanh toán đặt cọc thành công, nhấn **Tải hoá đơn điện tử (Download Invoice PDF)**.
   - Kiểm tra file PDF tải về: Đầy đủ mã tra cứu, bảng kê chi tiết cước chặng đi, chặng về, phí bảo hiểm, thuế VAT và thông tin trạm đối tác.

---

## Kịch bản 3: Vận chuyển đường thủy Rạch Giá → Phú Quốc (Ferry)
- **Mục tiêu chứng minh:** **G3** (Bổ sung phương thức đường thủy cho các tuyến đảo nội địa).
- **Thời lượng:** ~1.5 phút.
- **Tài khoản:** `customer_a@example.com`

### Các bước thực hiện:
1. Vào trang tạo yêu cầu vận chuyển mới.
2. Chọn phương thức: **Đường thủy (Sea / Ferry)**.
3. Nhập tuyến đường:
   - Điểm đón: `Cảng Rạch Giá, Đường Nguyễn Công Trứ, TP. Rạch Giá, Kiên Giang`.
   - Điểm trả: `Cảng Bãi Vòng, Hàm Ninh, TP. Phú Quốc, Kiên Giang`.
4. Chọn 1 ngựa và bấm **Nhận báo giá**.
5. **Kết quả mong đợi:**
   - Hệ thống áp dụng bảng giá cước đường thủy `Tariff Sea VN v1` (Cước phà biển theo giờ hải trình + phí chuồng phao tiêu chuẩn).
   - Tuyến đường thể hiện rõ trạm trung chuyển cảng biển và hướng dẫn an toàn cho ngựa khi đi phà cao tốc.

---

## Kịch bản 4: Quy trình hoàn tiền vận hành & Phê duyệt kép SoD (Segregation of Duties)
- **Mục tiêu chứng minh:** **G4b** (Quy trình hoàn tiền minh bạch, tách bạch trách nhiệm tài chính: Người duyệt không được chuyển khoản, trên 20 triệu phải duyệt kép).
- **Thời lượng:** ~2.5 phút.
- **Tài khoản:** `manager_a@example.com`, `manager_b@example.com`, `admin_demo@example.com`.

### Các bước thực hiện:
1. **Bước 1 - Khách yêu cầu hoặc Điều phối hủy chuyến:**
   - Đơn hàng đã đặt cọc nhưng do điều kiện thời tiết xấu hoặc lý do bất khả kháng, đơn bị chuyển sang trạng thái huỷ.
   - Form yêu cầu hoàn tiền xuất hiện: Số tiền hoàn = `25.000.000 VND` (vượt ngưỡng 20M, yêu cầu Dual-Approval).
2. **Bước 2 - Duyệt lần 1 (Manager A):**
   - Đăng nhập `manager_a@example.com`, truy cập trang [Danh sách hoàn tiền](file:///c:/Users/ttrrang/Documents/GitHub/SWP391_GROUP1/frontend/src/app/manager/refunds/page.tsx).
   - Mở hồ sơ hoàn tiền -> Nhấn **Phê duyệt lần 1 (Approve Tier 1)**.
   - Trạng thái chuyển thành: `pending_second_approval`.
3. **Bước 3 - Thử vi phạm SoD (Manager A tự duyệt lần 2):**
   - Dùng tiếp tài khoản Manager A bấm duyệt lần 2 -> Hệ thống chặn với thông báo lỗi: *"Vi phạm Dual-Approval (>= 20.000.000 VND): Người xác nhận lần 2 phải khác người duyệt lần 1"*.
4. **Bước 4 - Duyệt lần 2 hợp lệ (Manager B):**
   - Đăng xuất, đăng nhập `manager_b@example.com`.
   - Mở hồ sơ hoàn tiền -> Nhấn **Phê duyệt lần 2 (Approve Tier 2)**.
   - Trạng thái chuyển thành: `approved` (Chờ giải ngân chuyển khoản).
5. **Bước 5 - Chuyển khoản (Admin / Finance):**
   - Đăng xuất, đăng nhập `admin_demo@example.com`.
   - Nhấn **Xác nhận đã chuyển khoản (Disburse Refund)** kèm mã giao dịch ngân hàng và ảnh uỷ nhiệm chi.
   - Hệ thống ghi nhận hoàn tất quy trình SoD, sinh biên nhận hoàn tiền PDF.

---

## Kịch bản 5: Giả lập Live Tracking, Check-in mốc hành trình & Cảnh báo sinh hiệu
- **Mục tiêu chứng minh:** **G8, G12** (Định vị xe thời gian thực, timeline dọc đồng bộ 3 bên, phát hiện bất thường sinh hiệu ngựa, tự động kích hoạt cảnh báo đỏ).
- **Thời lượng:** ~3 phút.
- **Tài khoản:** `driver_demo1@example.com`, `customer_a@example.com`.

### Các bước thực hiện:
1. **Bước 1 - Tài xế chạy chuyến và gửi định vị:**
   - Đăng nhập `driver_demo1@example.com`, vào trang [Trạng thái chuyến đi](file:///c:/Users/ttrrang/Documents/GitHub/SWP391_GROUP1/frontend/src/app/driver/status/page.tsx).
   - Chọn chuyến đi đang chạy (`in_transit`). Bật **Giả lập hành trình (Simulation Mode)**.
   - Hệ thống tự động gửi pings tọa độ GPS di chuyển dần về phía mốc điểm dừng tiếp theo.
2. **Bước 2 - Ghi nhận sinh hiệu cảnh báo:**
   - Tài xế hoặc Bác sĩ thú y mở form **Ghi nhận sinh hiệu (Log Vitals)**:
     - Nhịp tim: `58 bpm` (Ngưỡng vàng).
     - Thân nhiệt: `38.9°C` (Ngưỡng vàng).
     - Nhịp thở: `28 bpm` (Ngưỡng vàng).
   - Ghi nhận liên tiếp 2 lần sinh hiệu vàng -> Hệ thống tự động leo thang thành **Cảnh báo đỏ (Red Alert - Nghi sốt vận chuyển)** và gửi thông báo khẩn cấp đến Quản lý.
3. **Bước 3 - Khách hàng giám sát trên Timeline dọc:**
   - Đăng nhập `customer_a@example.com`, vào trang [Theo dõi hành trình](file:///c:/Users/ttrrang/Documents/GitHub/SWP391_GROUP1/frontend/src/app/customer/tracking/page.tsx).
   - Cột trái: Bản đồ live tracking với biểu tượng xe di chuyển và vùng geofence trạm dừng.
   - Cột phải: **Timeline dọc chi tiết (Vertical Timeline)** hiển thị các mốc đã qua (xanh lá), mốc hiện tại (xanh dương kèm hiệu ứng nhấp nháy), cảnh báo sinh hiệu màu hổ phách/đỏ với đầy đủ thời gian và thông số đã được ẩn danh tên nhân sự nội bộ.

---

## Kịch bản 6: Xử lý sự cố Khách không xuất hiện chặng về (Return Leg No-Show)
- **Mục tiêu chứng minh:** **G5** (Quy định cửa sổ chờ 120 phút, thủ tục xác nhận No-show có ảnh minh chứng, chính sách phạt/hoàn cước theo hợp đồng).
- **Thời lượng:** ~2 phút.
- **Tài khoản:** `driver_demo1@example.com`, `manager_a@example.com`.

### Các bước thực hiện:
1. Đăng nhập `driver_demo1@example.com` trên chuyến đi chặng về.
2. Đến điểm hẹn đón ngựa nhưng khách không có mặt. Bấm nút **Bắt đầu đồng hồ chờ (Start 120m Wait Timer)**.
3. Khi hết thời gian chờ quy định (hoặc chọn mô phỏng vượt ngưỡng 120 phút), nút **Báo cáo No-Show** sáng lên.
4. Tài xế chụp ảnh thực địa điểm đón trống, nhập biên bản hiện trường và nhấn **Xác nhận No-Show**.
5. **Kết quả:** Chuyến xe được lệnh quay về trạm gần nhất để bảo đảm lịch trình. Hệ thống áp dụng chính sách phạt no-show (giữ 100% cước chặng về và hoàn trả các chi phí dịch vụ chưa phát sinh theo điều khoản hợp đồng).

---

## Kịch bản 7: Khiếu nại bồi thường bảo hiểm M3 (Insurance Claim & Payout)
- **Mục tiêu chứng minh:** **G6** (Bảo hiểm theo mức độ M1-M4, cửa sổ khiếu nại 72h sau bàn giao, thẩm định bồi thường theo tỷ lệ thương tật).
- **Thời lượng:** ~2.5 phút.
- **Tài khoản:** `customer_a@example.com`, `manager_a@example.com`, `admin_demo@example.com`.

### Các bước thực hiện:
1. **Bước 1 - Khách gửi khiếu nại:**
   - Khách `customer_a@example.com` vào đơn hàng vừa hoàn tất bàn giao trong vòng 72 giờ.
   - Nhấn **Yêu cầu bồi thường bảo hiểm (File Claim)**.
   - Chọn ngựa `Xích Thổ`, mức độ tổn thương: `M3 - Chấn thương cần phẫu thuật / điều trị đặc biệt`.
   - Đính kèm hồ sơ chẩn đoán của bệnh viện thú y và hoá đơn viện phí `45.000.000 VND`.
2. **Bước 2 - Quản lý thẩm định:**
   - Đăng nhập `manager_a@example.com`, vào trang [Quản lý khiếu nại bảo hiểm](file:///c:/Users/ttrrang/Documents/GitHub/SWP391_GROUP1/frontend/src/app/manager/claims/page.tsx).
   - Xem bảng đền bù bằng tiền của ngựa (mức trần quyền lợi M3 = 200.000.000 VND).
   - Nhấn **Phê duyệt bồi thường (Approve Claim)** với số tiền `45.000.000 VND`.
   - Do số tiền >= 20M, hệ thống tự động sinh hồ sơ hoàn tiền SoD chờ phê duyệt kép.
3. **Bước 3 - Phê duyệt kép & Chi trả:**
   - `manager_b@example.com` duyệt bước 2.
   - `admin_demo@example.com` thực hiện chi trả và tải uỷ nhiệm chi lên hệ thống.

---

## Kịch bản 8: Gộp vai trò vận hành, Hồ sơ ngựa tập trung & Loại bỏ hoàn toàn ghép chuyến
- **Mục tiêu chứng minh:** **G1, G2, G10** (Thống nhất vai trò Logistics Manager, chuyển hồ sơ kiểm dịch vào từng cá thể ngựa, loại bỏ hoàn toàn tính năng ghép xe với người lạ).
- **Thời lượng:** ~2 phút.
- **Tài khoản:** `manager_a@example.com`, `customer_a@example.com`.

### Các bước thực hiện:
1. **Kiểm tra Gộp Actor (G1):**
   - Đăng nhập tài khoản điều phối viên cũ (`manager_a@example.com`).
   - Hệ thống chuyển hướng thẳng vào `/manager`.
   - Menu điều hướng được cấu trúc gọn gàng thành **3 nhóm nghiệp vụ**:
     - *Nhóm Đơn hàng & Pháp lý:* Đơn hàng, Thẩm định giấy tờ kiểm dịch, Hoàn tiền, Bồi thường.
     - *Nhóm Tuyến đường & Đội xe:* Bảng giá, Giờ cấm đô thị, Đội xe & Trạm trung chuyển, Lập kế hoạch lộ trình.
     - *Nhóm Giám sát:* Bản đồ giám sát trực tiếp (Live Overview), Báo cáo vận hành.
2. **Kiểm tra Hồ sơ ngựa tập trung (G2):**
   - Đăng nhập `customer_a@example.com`, vào trang [Danh sách ngựa của tôi](file:///c:/Users/ttrrang/Documents/GitHub/SWP391_GROUP1/frontend/src/app/customer/horses/page.tsx).
   - Chọn ngựa `Xích Thổ`.
   - Tab **Giấy tờ & Kiểm dịch** nằm ngay trong trang chi tiết ngựa: Hiển thị Hộ chiếu, Giấy tiêm phòng cúm, Coggins test, ngày hết hạn và nút tải lên trực tiếp.
   - Form thông tin ngựa không còn các trường thừa (`gender`, `birth_date`).
3. **Kiểm tra Tuyệt đối không ghép chuyến (G10):**
   - Toàn bộ giao diện báo giá và đặt chuyến chỉ cho phép bao nguyên xe (Dedicated Charter: 1 xe 1-6 khoang) cho một khách hàng.
   - Không còn bất kỳ lựa chọn "Ghép xe chung với chủ khác" (Shared Ride), bảo đảm an toàn sinh học tuyệt đối cho ngựa đua.
