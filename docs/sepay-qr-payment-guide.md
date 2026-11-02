# Hướng dẫn Cấu hình & Demo Thanh toán Chuyển khoản QR Tự động (SePay Test Mode + VietQR)

> **Giả định của dự án:** *"Thanh toán dùng môi trường thử nghiệm của dịch vụ xác nhận chuyển khoản (SePay Test mode)."*

---

## 1. Biến môi trường (`.env`)

Thêm hoặc kiểm tra các biến sau trong file `.env` của `backend`:

```env
SEPAY_WEBHOOK_API_KEY=equitransit-sepay-test-apikey-2026
PAYMENT_CODE_PREFIX=EQT
PAYMENT_EXPIRE_HOURS=48
BANK_CODE=MBBank
BANK_ACCOUNT_NO=0000123456789
BANK_ACCOUNT_NAME=CONG TY VAN CHUYEN NGUA EQUITRANSIT
PAYMENT_DEV_SIMULATE=true
```

Ngoài ra, **Logistics Manager** có thể thay đổi trực tiếp **Ngân hàng, Số tài khoản nhận, Tên chủ tài khoản, Tiền tố mã (`EQT`) và Thời hạn thanh toán** ngay trên giao diện **`/manager/settings`**.

---

## 2. Cấu hình trên SePay Dashboard (Test Mode)

1. **Đăng ký & Bật Test Mode:**
   - Truy cập `https://my.sepay.vn` (hoặc `https://developer.sepay.vn`) và bật chế độ **Test Mode (Môi trường thử nghiệm)**.
   - Tạo tài khoản ngân hàng / VA thử nghiệm và nhập số tài khoản đó vào trang **`/manager/settings`**.

2. **Thiết lập Cấu trúc mã thanh toán:**
   - Vào **Cấu hình Công ty $\rightarrow$ Cấu trúc mã thanh toán**.
   - Đặt tiền tố nhận diện là **`EQT`** (khớp với `PAYMENT_CODE_PREFIX=EQT`). Khi nội dung chuyển khoản có chứa `EQT039`, SePay sẽ tự động tách `EQT039` vào trường `code` trong Webhook payload.

3. **Tạo Webhook xác thực bằng API Key:**
   - Khi chạy localhost (port `5000`), mở terminal chạy `ngrok`:
     ```bash
     ngrok http 5000
     ```
   - Trên SePay Dashboard $\rightarrow$ **Tích hợp Webhooks $\rightarrow$ Thêm Webhook**:
     - **Gọi đến URL:** `https://<dia-chi-ngrok>/api/webhooks/sepay`
     - **Sự kiện:** Có tiền vào (`in`)
     - **Kiểu chứng thực:** `API Key`
     - **API Key:** `equitransit-sepay-test-apikey-2026` (khớp với `SEPAY_WEBHOOK_API_KEY` trong `.env`). SePay sẽ gửi header `Authorization: Apikey equitransit-sepay-test-apikey-2026`.
     - **Content-Type:** `application/json`

---

## 3. Cách Demo nhanh trên Hệ thống (3 cách)

### Cách 1: Nút "Mô phỏng chuyển khoản SePay" ngay trên màn hình Khách hàng (Nhanh nhất)
- Khi `PAYMENT_DEV_SIMULATE=true`, trong khung mã QR của khách hàng (`/customer/requests/[id]`) có sẵn nút **"⚡ Mô phỏng chuyển khoản SePay (Đúng số tiền)"**.
- Bấm nút này $\rightarrow$ Backend tự bắn đúng chuẩn payload SePay qua bộ xử lý Webhook $\rightarrow$ Tự động chuyển sang **Thanh toán thành công (`PAID`)** + Xuất **Hóa đơn điện tử (`INV-2026-xxxx`)** ngay lập tức mà không cần tải lại trang.

### Cách 2: Mô phỏng trên giao diện SePay Test Mode (Qua ngrok)
- Trên SePay Test Mode $\rightarrow$ **Mô phỏng chuyển khoản** với số tiền khớp báo giá và nội dung chuyển khoản là mã `EQTxxx` hiển thị trên màn hình khách hàng.
- SePay gọi `POST /api/webhooks/sepay` $\rightarrow$ Trang chi tiết đơn của khách hàng tự động polling (mỗi 4 giây) và hiển thị **Thanh toán thành công** kèm **Hóa đơn**.

### Cách 3: Nhánh dự phòng xác nhận thủ công
- Khách hàng bấm **"Tôi đã chuyển khoản (Báo Manager)"** $\rightarrow$ Trạng thái chuyển sang `AWAITING_CONFIRMATION`, Manager nhận thông báo.
- Manager mở `/manager/requests` $\rightarrow$ Bấm **"Xác nhận đã nhận tiền"** $\rightarrow$ Đơn chuyển sang `PAID`, xuất **Hóa đơn điện tử** và mở khóa cổng **`Ready to depart`** (khi kế hoạch lộ trình đã `Confirmed` và hồ sơ Flow 2 đã hoàn tất).

