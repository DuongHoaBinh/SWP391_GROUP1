# Context Diagram - EquiTransit Platform (v2.0 Post-Review & Hot-Fix)

> **Cập nhật sau review hội đồng & hot-fix (11/2026):**
> 1. **Gộp Actor (G1):** Ba vai trò vận hành nội bộ (*Logistics Manager*, *Transport Specialist*, *Fleet & Route Coordinator*) đã được gộp thành một tác nhân duy nhất: **Logistics Manager (Quản lý vận hành toàn diện)**.
> 2. **Bổ sung Actor Admin:** Thực thi giải ngân chuyển khoản hoàn tiền và bồi thường bảo hiểm theo nguyên tắc *Segregation of Duties* (SoD: `transferred_by != approved_by`), quản trị tài khoản và bật/tắt GPS giả lập.
> 3. **Bổ sung Cổng thanh toán & Dịch vụ ngoài:** SePay VietQR (Webhook đối soát tự động), OpenRouteService (ORS API tính cự ly tự động), SMTP Email Service (gửi OTP và thông báo).

Tệp sơ đồ nguồn Draw.io có thể mở và chỉnh sửa trực tiếp trên [diagrams.net](https://app.diagrams.net/):
- **Đường dẫn tệp Draw.io riêng:** [`docs/context-diagram-equitransit.drawio`](file:///c:/Users/ttrrang/Documents/GitHub/SWP391_GROUP1/docs/context-diagram-equitransit.drawio) (hoặc tệp gốc tại thư mục dự án: [`context-diagram-equitransit.drawio`](file:///c:/Users/ttrrang/Documents/GitHub/SWP391_GROUP1/context-diagram-equitransit.drawio)).
- **Tệp Draw.io tích hợp 2 tab (Use Case + Context):** [`use-case-diagram-equitransit.drawio`](file:///c:/Users/ttrrang/Documents/GitHub/SWP391_GROUP1/use-case-diagram-equitransit.drawio).
- **Ảnh xem trước độ phân giải cao:** [`docs/context-diagram-preview.png`](file:///c:/Users/ttrrang/Documents/GitHub/SWP391_GROUP1/docs/context-diagram-preview.png).

---

## 1. Sơ đồ Ngữ cảnh DFD Mức 0 (Mermaid Diagram)

```mermaid
flowchart TD
  subgraph Entities["Các Tác nhân Bên ngoài (External Entities)"]
    C["Customer (Chủ ngựa / Khách hàng)"]
    LM["Logistics Manager (Quản lý vận hành toàn diện)"]
    DRV["Vehicle Driver / Escort (Tài xế / Bác sĩ thú y)"]
    ADM["Admin (Quản trị & SoD Tài chính)"]
    EXT["External Services (SePay VietQR, ORS API, SMTP)"]
  end

  SYS(("0. Cross-Border Racehorse<br/>Transport System<br/>(EquiTransit Platform)"))

  %% Customer Flows
  C -->|"1. Yêu cầu báo giá, Đơn đặt chỗ trả trước,<br/>Hồ sơ ngựa, Chuyển khoản VietQR,<br/>Khiếu nại M1–M4, Tài khoản hoàn tiền"| SYS
  SYS -->|"2. Báo giá tự động, Hóa đơn VAT PDF,<br/>Trạng thái hồ sơ kiểm dịch,<br/>Live tracking & Timeline dọc"| C

  %% Logistics Manager Flows
  LM -->|"1. Thẩm định khả thi đơn trả trước,<br/>Duyệt hồ sơ 4 điểm, Lập lộ trình/xe,<br/>Duyệt bồi thường, Cấu hình bảng giá"| SYS
  SYS -->|"2. Danh sách đơn chờ duyệt, Tải trọng đội xe,<br/>Bản đồ giám sát trực tiếp, Cảnh báo đỏ sinh hiệu, Báo cáo OTD"| LM

  %% Vehicle Driver / Escort Flows
  DRV -->|"1. Xác nhận nhận chuyến, Check-in GPS Geofence,<br/>Sinh hiệu 3 tầng, Báo sự cố,<br/>Biên bản giao ngựa, No-show 120p"| SYS
  SYS -->|"2. Lộ trình chi tiết, Danh sách ngựa & trạm dừng,<br/>Giờ nghỉ IATA LAR, Xác thực bán kính Geofence"| DRV

  %% Admin Flows
  ADM -->|"1. Cấp tài khoản, Bật/tắt giả lập GPS,<br/>Thực thi giải ngân hoàn tiền/claim SoD"| SYS
  SYS -->|"2. Hàng đợi lệnh hoàn tiền/claim chờ giải ngân,<br/>Nhật ký kiểm toán hệ thống (Audit Logs)"| ADM

  %% External Services Flows
  SYS -->|"1. Mã hóa đơn SePay, Tọa độ cự ly ORS,<br/>Email OTP xác thực SMTP"| EXT
  EXT -->|"2. Webhook SePay (HMAC), Khoảng cách ORS,<br/>Trạng thái gửi mail SMTP"| SYS
```

---

## 2. Bảng Ma trận Luồng Dữ liệu (Data Flow Matrix)

| Tác nhân (Entity) | Hướng luồng | Tên luồng dữ liệu | Chi tiết nghiệp vụ trao đổi với Hệ thống EquiTransit |
|---|:---:|---|---|
| **Customer** *(Chủ ngựa)* | In $\rightarrow$ | Dữ liệu đầu vào của Khách | - Thông tin tài khoản & danh mục cá thể ngựa (vi chip, cờ chuồng riêng).<br/>- Yêu cầu báo giá cước tự động & lựa chọn gói bảo hiểm.<br/>- Đơn đặt chỗ vận chuyển & chấp nhận điều khoản chặng về.<br/>- Hồ sơ kiểm dịch nộp vào kho ngựa (hộ chiếu, xét nghiệm Coggins).<br/>- Xác nhận chuyển khoản thanh toán VietQR.<br/>- Yêu cầu hủy/dời ngày đón chặng về.<br/>- Hồ sơ bồi thường bảo hiểm M1–M4 & bằng chứng tổn thất.<br/>- Thông tin số tài khoản ngân hàng nhận hoàn tiền 100%.<br/>- Ký nhận biên bản nghiệm thu bàn giao hoặc khởi tạo khiếu nại. |
| | Out $\leftarrow$ | Phản hồi của Hệ thống | - Báo giá cước vận tải & phí bảo hiểm khóa 30 phút.<br/>- Hóa đơn điện tử PDF kèm mã VietQR động đối soát tự động.<br/>- Kết quả thẩm định hồ sơ kiểm dịch & cảnh báo thiếu/hết hạn.<br/>- Vị trí xe trực tiếp trên bản đồ vệ tinh & Timeline dọc ẩn danh.<br/>- Quyết định phê duyệt hoàn tiền hoặc bồi thường bảo hiểm. |
| **Logistics Manager** *(Quản lý vận hành)* | In $\rightarrow$ | Chỉ đạo & Quyết định Vận hành | - Quyết định duyệt khả thi (`feasible`) hoặc từ chối (`unfeasible`).<br/>- Đánh giá checklist 4 tiêu chí hồ sơ kiểm dịch của ngựa.<br/>- Thiết lập khung chiến lược Road/Air/Sea, hãng bay, sân bay.<br/>- Dựng chặng (Legs), trạm dừng nghỉ IATA LAR (Stops).<br/>- Phân bổ xe từ trạm gần nhất, gán tài xế & bác sĩ thú y áp tải.<br/>- Phê duyệt xuất bản lộ trình (Khóa Gate 1).<br/>- Ghi đè mốc hành trình & xác nhận lý do trễ miễn trừ (48h).<br/>- Thẩm định và duyệt hồ sơ bồi thường bảo hiểm M1–M4.<br/>- Cấu hình bảng giá đa phương thức, trạm xe & giờ cấm đô thị. |
| | Out $\leftarrow$ | Báo cáo & Cảnh báo Vận hành | - Danh sách đơn hàng trả trước chờ thẩm định khả thi.<br/>- Hồ sơ pháp lý ngựa cần rà soát & trạng thái phê duyệt cơ quan.<br/>- Sức chứa, tải trọng xe và tình trạng sẵn sàng của nhân sự.<br/>- Bản đồ giám sát toàn bộ chuyến đi & Cảnh báo đỏ sinh hiệu (Red Alert).<br/>- Báo cáo tài chính, chi phí thực tế và tỷ lệ đúng giờ (OTD %).<br/>- Báo cáo sự cố khẩn cấp trên đường & hồ sơ khiếu nại bàn giao. |
| **Vehicle Driver / Escort** *(Tài xế / Áp tải)* | In $\rightarrow$ | Dữ liệu Thực địa Hiện trường | - Xác nhận nhận chuyến vận chuyển (`confirmed`) hoặc từ chối.<br/>- Check-in mốc hành trình định vị GPS trong bán kính Geofence.<br/>- Nhật ký theo dõi thân nhiệt, nhịp tim định kỳ (áp tải thú y).<br/>- Báo cáo sự cố khẩn cấp trên đường kèm tọa độ và ảnh chụp hiện trường.<br/>- Biên bản bàn giao cá thể ngựa, đánh giá thể trạng & đối soát CCCD.<br/>- Biên bản vắng mặt đón chặng về (No-show) sau 120 phút chờ đợi. |
| | Out $\leftarrow$ | Hướng dẫn & Giám sát Chuyến đi | - Lộ trình di chuyển chi tiết, danh sách ngựa phụ trách & điểm dừng.<br/>- Phản hồi xác thực vị trí GPS trong bán kính Geofence hợp lệ.<br/>- Định mức thời gian lái xe tối đa và thời gian nghỉ bắt buộc.<br/>- Phương án đổi tuyến đường/chuyển viện cấp cứu khi có sự cố. |
| **Admin** *(Quản trị & SoD)* | In $\rightarrow$ | Quản trị & Giải ngân Tài chính | - Khởi tạo tài khoản nhân sự nội bộ và phân quyền RBAC.<br/>- Bật/tắt chế độ giả lập GPS hành trình (`simulation_enabled`).<br/>- Cấu hình mức độ hiển thị sinh hiệu cho khách hàng.<br/>- Thực thi lệnh chuyển khoản hoàn tiền/bồi thường bảo hiểm & tải ủy nhiệm chi (SoD: `transferred_by != approved_by`). |
| | Out $\leftarrow$ | Hàng đợi & Dữ liệu Kiểm toán | - Hàng đợi các lệnh hoàn tiền/bồi thường bảo hiểm đã được duyệt.<br/>- Toàn bộ nhật ký kiểm toán hệ thống (Audit Logs & Security Traces). |
| **External Services** *(SePay, ORS, SMTP)* | In $\rightarrow$ | Phản hồi từ Dịch vụ Ngoài | - Webhook ngân hàng SePay gửi xác nhận giao dịch thành công (HMAC SHA-256).<br/>- Khoảng cách đường bộ (km) & thời gian lái xe từ OpenRouteService.<br/>- Trạng thái gửi email xác thực và mã OTP thành công từ SMTP. |
| | Out $\leftarrow$ | Yêu cầu Giao tiếp Ngoài | - Thông tin hóa đơn, mã đơn hàng & số tiền gửi tới cổng VietQR.<br/>- Cặp tọa độ điểm đón và điểm trả gửi tới ORS tính toán cự ly.<br/>- Nội dung email gửi mã OTP kích hoạt và thông báo trạng thái đơn. |
