# API Documentation

> **Cập nhật sau review 11/2026:** Transport Specialist và Fleet & Route Coordinator đã gộp vào **Logistics Manager** (xem `docs/actors-and-roles.md`). Trong tài liệu này, mọi chỗ ghi Specialist/Coordinator được hiểu là Logistics Manager; role `TRANSPORT_SPECIALIST`/`FLEET_ROUTE_COORDINATOR` chỉ còn để tương thích dữ liệu cũ.

## API technology

The backend is implemented with **NestJS and TypeScript**. It exposes a **REST API** consumed by the **React/Next.js frontend**. The target database is **MySQL 8.0+**; authentication stores users and registration OTP records in MySQL. OpenAPI/Swagger UI is available at `http://localhost:5000/api/docs` while the backend is running.

## Authentication endpoints

Base URL: `http://localhost:5000/api`

### `POST /auth/register`

Creates a pending **customer** registration and sends a six-digit OTP. Required body:

```json
{
	"email": "owner@example.com",
	"password": "Password123",
	"confirmPassword": "Password123"
}
```

The password must contain at least eight characters, one letter, and one number. The OTP is sent through the configured SMTP provider. It must not be exposed in production; `AUTH_EXPOSE_DEV_OTP=true` may be used only for local development.

### `POST /auth/verify-otp`

Completes the customer registration after a valid OTP. OTPs expire after ten minutes.

```json
{
	"email": "owner@example.com",
	"otp": "123456"
}
```

### `POST /auth/login`

Authenticates verified customers and pre-provisioned internal accounts. Returns a JWT access token and the user's role.

```json
{
	"email": "owner@example.com",
	"password": "Password123"
}
```

### `GET /auth/profile`

Retrieves the authenticated user's profile details. Requires Bearer JWT token.

Response:
```json
{
	"id": "7",
	"email": "tamngoi192@gmail.com",
	"role": "CUSTOMER",
	"fullName": "Nguyễn Văn Tâm",
	"name": "Nguyễn Văn Tâm",
	"phone": "0912345678",
	"address": "123 Nguyễn Huệ, TP.HCM",
	"avatarUrl": "",
	"authProvider": "local",
	"hasPassword": true,
	"createdAt": "2026-09-30T10:00:00.000Z"
}
```

### `PATCH /auth/profile`

Updates the authenticated user's profile information. Requires Bearer JWT token.

Request body:
```json
{
	"fullName": "Nguyễn Văn Tâm",
	"phone": "0912345678",
	"address": "123 Nguyễn Huệ, Quận 1, TP.HCM",
	"avatarUrl": ""
}
```

Response:
```json
{
	"message": "Profile updated successfully",
	"user": {
		"id": "7",
		"email": "tamngoi192@gmail.com",
		"role": "CUSTOMER",
		"fullName": "Nguyễn Văn Tâm",
		"name": "Nguyễn Văn Tâm",
		"phone": "0912345678",
		"address": "123 Nguyễn Huệ, Quận 1, TP.HCM",
		"avatarUrl": "",
		"createdAt": "2026-09-30T10:00:00.000Z"
	}
}
```

### `POST /auth/change-password`

Changes the password for the currently authenticated user, or sets an initial password for a Google OAuth account that does not have a local password yet (`hasPassword: false`, where `currentPassword` may be omitted). Requires Bearer JWT token.

Request body:
```json
{
	"currentPassword": "OldPassword123",
	"newPassword": "NewPassword123",
	"confirmPassword": "NewPassword123"
}
```

Response:
```json
{
	"message": "Mật khẩu đã được thay đổi thành công",
	"hasPassword": true
}
```

### `POST /auth/forgot-password`

Requests a password-reset OTP email for an active account. Protected by per-IP rate limiting (`RateLimitGuard`).

### `POST /auth/reset-password`

Resets the account password using `{ email, otp, newPassword, confirmPassword }`. Protected by rate limiting and max failed-attempt lockouts.

### Rate Limiting & Security Defaults

- Authentication mutation routes (`register`, `verify-otp`, `login`, `forgot-password`, `reset-password`, `google`) enforce sliding-window rate limits via `@RateLimit`.
- JWT verification requires an active database user account (`is_active`) and a configured secret (`JWT_SECRET`, minimum 32 characters in production).

### `GET /health`

Public health probe verifying API readiness and MySQL connectivity (`SELECT 1`). Returns `{ status: "ok", db: "up", uptimeSeconds, timestamp }` or HTTP 503 if MySQL is unreachable.

## Local MySQL and SMTP configuration

The backend reads database and SMTP settings from `backend/.env`. `SMTP_USER` and `SMTP_PASSWORD` belong to a dedicated system sender account, not to the customer. The customer email from `POST /auth/register` is passed as the recipient of the OTP email. Required values for the real registration flow are `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASSWORD`. For Gmail, use an App Password with two-step verification enabled. Never commit `backend/.env` or expose `SMTP_PASSWORD`.

API contracts are organized by backend module:

- `/api/auth`
- `/api/orders` - requests, manager approval, assignments
- `/api/documents` - horse document sets, requirements, reviews, authority approvals
- `/api/compliance` - country, border-gate, quarantine, and customs rules
- `/api/fleet` - vehicles, aircraft capacity, stalls, availability
- `/api/routes` - route plans, legs, stops, schedule changes
- `/api/tracking` - trip status, route events, horse health logs, attachments
- `/api/incidents` - emergency reports, escalation, route/cost changes (optional)
- `/api/handover` - delivery checklist and acceptance (optional)
- `/api/notifications` - customer and internal alerts
- `/api/reports` - revenue, operating cost, and on-time delivery

## Orders endpoints (Flow 1: Transport Request & Approval)

Base URL: `http://localhost:5000/api` (All endpoints require `Authorization: Bearer <token>`)

### `POST /orders` (Customer)
Creates and submits a new transport request.
- **Role:** `CUSTOMER`
- **Body:**
```json
{
  "contactName": "Nguyễn Văn A",
  "contactAddress": "123 Trần Phú, Q.5, TP.HCM",
  "contactPhone": "0901234567",
  "contactEmail": "owner@example.com",
  "requestedHorseCount": 1,
  "originLocation": "Trang trại Củ Chi, TP.HCM",
  "destinationLocation": "Singapore Turf Club, Singapore",
  "requestedDate": "2026-10-15T08:00:00.000Z",
  "specialRequirements": "Cần xe điều hòa đặc biệt",
  "medicalDocumentUrl": "https://example.com/docs/medical-rules.pdf",
  "horseName": "Xích Thố",
  "horseBreed": "Thoroughbred",
  "horseAge": 4,
  "horses": [
    {
      "name": "Xích Thố",
      "breed": "Thoroughbred",
      "age": 4
    }
  ]
}
```

### `GET /orders/my-orders` (Customer)
Lists all transport requests submitted by the authenticated customer.

### `GET /orders` (Logistics Manager / Admin)
Lists all transport requests across the system. Supports optional query parameter `?status=requested`.

### `GET /orders/:id`
Retrieves detailed information for a specific order. Customers can only view their own orders.

### `PATCH /orders/:id/approve` (Logistics Manager / Admin)
Approves a pending `requested` order and notifies the customer.
- **Body:** `{ "totalCost": 15000000, "note": "Phê duyệt kế hoạch" }`

### `PATCH /orders/:id/reject` (Logistics Manager / Admin)
Rejects a pending `requested` order with a mandatory reason and notifies the customer.
- **Body:** `{ "reason": "Lý do từ chối đơn hàng" }`

### `PATCH /orders/:id/request-changes` (Logistics Manager / Admin)
Requests modifications on a pending `requested` order with a mandatory explanation note. Updates status to `change_requested` and sends a notification to the customer.
- **Body:** `{ "reason": "Vui lòng dời ngày xuất phát sang 16/10 và cập nhật địa chỉ đón chi tiết" }`

### `PUT /orders/:id` (Customer)
Customer updates editable order details (dates, route locations, horse info, special requirements) only while the owned order is `change_requested`, then resubmits it. Resets status back to `requested` for manager review. Other states return 400.
- **Body:** Partial or full fields from `CreateOrderDto`.

## Prepaid Flow Endpoints (Step 7: Báo giá → Thanh toán ngay → Hóa đơn PDF → Duyệt khả thi → Hoàn tiền 100%)

### `PATCH /orders/:id/feasibility` (Logistics Manager / Admin)
Thẩm định tính khả thi vận hành cho đơn hàng trả trước sau khi khách hàng đã thanh toán thành công (`paid_pending_review`).
- **Headers:** `Authorization: Bearer <manager_or_admin_token>`
- **Request Body (Phê duyệt khả thi):**
```json
{
  "decision": "approve"
}
```
*Kết quả:* Chuyển đơn sang `planning` (hoặc `approved`) để Coordinator lập lộ trình chi tiết. Khi xác nhận lộ trình ở Flow 3, hệ thống liên kết `route_id` vào hóa đơn hiện có mà không sinh thêm hóa đơn mới hay yêu cầu thanh toán lại.

- **Request Body (Không thể đáp ứng):**
```json
{
  "decision": "cannot_fulfil",
  "reasonCode": "no_vehicle_available",
  "note": "Toàn bộ xe chuyên dụng đã được phân bổ kín lịch trong tuần yêu cầu."
}
```
*Các mã lý do hợp lệ (`reasonCode`):* `no_vehicle_available`, `route_restricted`, `quarantine_capacity_full`, `weather_or_force_majeure`, `other`.  
*Quy tắc:* `note` bắt buộc tối thiểu 10 ký tự.  
*Kết quả:* Chuyển đơn sang `refund_requested`. Khách hàng nhận thông báo điền thông tin ngân hàng để nhận hoàn tiền 100%.

### `GET /orders/:id/invoice` (Customer owner, Logistics Manager, Admin)
Lấy dữ liệu chi tiết hóa đơn điện tử A4 chuẩn cho đơn hàng (hóa đơn sơ bộ `route_id = NULL` hoặc hóa đơn sau lập tuyến).
- **Headers:** `Authorization: Bearer <token>`
- **Response Data:**
```json
{
  "invoiceCode": "INV-2026-000100",
  "invoiceType": "primary",
  "status": "paid",
  "issuedAt": "2026-11-23T10:00:00.000Z",
  "totalAmount": 35000000,
  "freightAmount": 32000000,
  "insuranceAmount": 3000000,
  "currency": "VND",
  "amountInWords": "ba mươi lăm triệu đồng",
  "customer": {
    "name": "Nguyễn Văn A",
    "phone": "0901234567",
    "email": "customer@example.com",
    "address": "TP. Hồ Chí Minh"
  },
  "route": {
    "origin": "TP. Hồ Chí Minh",
    "destination": "Hà Nội",
    "transportMode": "road",
    "distanceKm": 1720,
    "departureDate": "2026-12-10"
  },
  "horses": [
    {
      "name": "Red Rum",
      "declaredValue": 2000000000,
      "package": "standard",
      "fee": 3000000
    }
  ],
  "sepayPayment": {
    "transactionId": "TXN-889922",
    "gateway": "SePay VietQR",
    "paidAt": "2026-11-23T10:15:00.000Z",
    "status": "succeeded"
  }
}
```

### `GET /orders/:id/refund-form` (Customer owner, Logistics Manager, Admin)
Lấy thông tin đơn hàng và bản ghi hoàn tiền đang xử lý (nếu có) để hiển thị form hoàn tiền 100% khi công ty không đáp ứng được.
- **Headers:** `Authorization: Bearer <token>`

### `POST /orders/:id/refund-form` (Customer owner)
Khách hàng gửi thông tin tài khoản ngân hàng để nhận hoàn tiền 100% khi đơn ở trạng thái `refund_requested`.
- **Headers:** `Authorization: Bearer <customer_token>`
- **Request Body:**
```json
{
  "bankName": "Vietcombank",
  "accountNumber": "0071001234567",
  "accountHolder": "NGUYEN VAN A",
  "confirmAmount": 35000000,
  "note": "Mong công ty xử lý sớm"
}
```
*Quy tắc:*
- Chỉ chủ sở hữu đơn hàng mới được gửi (`403 Forbidden` nếu người khác gửi).
- Đơn bắt buộc đang ở trạng thái `refund_requested` (`409 Conflict` nếu ở trạng thái khác).
- `confirmAmount` phải khớp chính xác với tổng số tiền khách đã thanh toán (`409 Conflict` nếu sai lệch).
- Không được gửi trùng nếu đã có yêu cầu hoàn tiền đang xử lý (`409 Conflict`).
- Nếu số tiền ≥ 20.000.000 VND, tự động kích hoạt cờ `dual_approval_required = true`.
- Hạn xử lý cam kết: SLA 3-5 ngày làm việc (`sla_due_at = addBusinessDays(now, 5)`).
- Phân tách nhiệm vụ (SoD): Người duyệt hoàn tiền không được là người thực hiện lệnh chuyển khoản (`transferred_by != approved_by_1`).

## Pricing & Quotes endpoints (Step 4: Báo giá tự động & Bảng giá có phiên bản)

Tự động tính khoảng cách qua ORS (hoặc fallback Haversine) và áp biểu cước theo bậc khoảng cách (tiered km), bậc kích thước xe (`truck_1`..`truck_6`), cước bay theo đầu ngựa, cước phà (`ferry`) và cước tàu biển chuyên dụng (`vessel`). Khóa giá trong 30 phút.

### `POST /quotes` (Customer / Authenticated)
Tạo báo giá tự động máy chủ có hiệu lực trong 30 phút (`expires_at`), tính toán khoảng cách leg qua ORS/fallback và lưu `pricing_snapshot`.
- **Request Body:**
```json
{
  "origin": { "address": "Quận 7, TP.HCM", "lat": 10.734, "lng": 106.7216, "country": "Vietnam" },
  "destination": { "address": "Singapore Turf Club", "lat": 1.4239, "lng": 103.7618, "country": "Singapore" },
  "departureDate": "2026-12-10",
  "transportMode": "air",
  "seaMode": null,
  "horses": [
    {
      "horseId": 12,
      "quantity": 1,
      "declaredValue": 2000000000,
      "declaredCurrency": "VND",
      "insurancePackage": "standard"
    }
  ]
}
```
- **Response (201 Created):**
```json
{
  "quoteId": 101,
  "expiresAt": "2026-11-23T11:45:00.000Z",
  "transportMode": "air",
  "seaMode": null,
  "legs": [
    { "key": "flight", "from": "Quận 7, TP.HCM", "to": "Singapore Turf Club", "distanceKm": 1085, "durationHours": 3.5, "source": "estimated" }
  ],
  "requiredStallSlots": 1,
  "options": [
    {
      "optionCode": "charter",
      "label": "Chuyến bay chuyên dụng",
      "vehicles": [],
      "freight": { "lines": [], "subtotal": 125000000, "rounding": 0, "total": 125000000 }
    }
  ],
  "recommendedOptionCode": "charter",
  "insurance": { "total": 6000000, "horses": [] },
  "total": 131000000,
  "tariffVersions": { "air": 1 },
  "warnings": []
}
```

### `GET /quotes/:id` (Customer / Logistics Manager / Admin)
Lấy chi tiết báo giá tự động, kiểm tra thời gian hết hạn (`isExpired`), chi tiết từng dòng cước và danh sách phương án xe. Khách hàng chỉ xem được báo giá của chính mình.
- **Response (200 OK):** Đối tượng `ShipmentQuoteDto`.
- **Errors:** `404 Not Found`, `403 Forbidden`.

### `GET /pricing/tariffs/active` (All Authenticated)
Lấy danh sách các bảng giá cước đang kích hoạt (`active = 1`) cho cả 3 phương thức `road`, `air`, `sea`.
- **Response (200 OK):** Mảng các bản ghi `pricing_tariff` kèm `params_json`.

### `GET /pricing/tariffs` (Logistics Manager / Admin)
Lấy danh sách toàn bộ phiên bản bảng giá cước (kể cả phiên bản lưu trữ cũ) phục vụ kiểm toán và quản lý định mức. Hỗ trợ query `?mode=road`.
- **Response (200 OK):** Mảng các bản ghi `pricing_tariff`.

### `POST /pricing/tariffs` (Logistics Manager / Admin)
Tạo phiên bản bảng giá mới cho một phương thức vận tải. Tự động chuyển các phiên bản cũ của phương thức đó sang `active = 0`.
- **Request Body:**
```json
{
  "transportMode": "road",
  "name": "Bảng giá đường bộ Q1/2027",
  "effectiveFrom": "2027-01-01",
  "params": {
    "distanceTiers": [
      { "minKm": 0, "maxKm": 100, "pricePerKmPerVehicle": 45000 },
      { "minKm": 100, "maxKm": 300, "pricePerKmPerVehicle": 38000 },
      { "minKm": 300, "maxKm": null, "pricePerKmPerVehicle": 32000 }
    ],
    "minChargePerTrip": 5000000,
    "deadheadPricePerKm": 18000,
    "classMultipliers": { "truck_1": 0.85, "truck_2": 1.0, "truck_4": 1.35, "truck_6": 1.7 }
  }
}
```
- **Response (201 Created):** Bản ghi `pricing_tariff` vừa tạo.

### `POST /pricing/preview` (Logistics Manager / Admin)
Thử tính toán giá cước với các tham số biểu giá và khoảng cách giả định mà không ghi vào cơ sở dữ liệu.
- **Request Body:**
```json
{
  "transportMode": "road",
  "distanceKm": 450,
  "horseCount": 2,
  "customParams": { ... }
}
```
- **Response (200 OK):**
```json
{
  "freight": { "lines": [], "subtotal": 18500000, "rounding": 0, "total": 18500000 }
}
```

### `GET /orders/return-policy` (All Authenticated)
Trả về chính sách vận chuyển khứ hồi hiện hành của hệ thống, bao gồm mức chiết khấu chặng về (-10%), chiết khấu bảo hiểm khứ hồi (-10%), thời gian chờ tối đa tại điểm đón (120 phút), thang tỷ lệ hoàn tiền khi hủy (≥ 168h: 80%, 72h-168h: 50%, < 72h: 0%), và quy định phí đổi ngày đón.

### `GET /orders/:id/return/cancellation-preview` (Customer / Logistics Manager / Admin)
Tính toán và hiển thị trước số tiền hoàn nếu khách hàng hủy chặng về ở thời điểm hiện tại. Trả về chi tiết: số giờ còn lại trước giờ đón, tỷ lệ hoàn cước, số tiền cước hoàn, số tiền bảo hiểm hoàn (100%), tổng tiền hoàn và cờ `requiresDualApproval` (nếu tổng hoàn ≥ 20.000.000 đ).
- **Errors:** `404 Not Found`, `403 Forbidden` (khách khác chủ), `400 Bad Request` (không phải đơn khứ hồi), `409 Conflict` (chặng về đã bắt đầu hoặc đã kết thúc).

### `PATCH /orders/:id/cancel` (Customer chủ đơn / Admin)
Khách tự hủy đơn khi chưa thanh toán hoặc chưa được duyệt.
- **Trạng thái được hủy:** `awaiting_payment` (đơn trả trước), `requested`, `change_requested` (đơn cũ). Gọi lại trên đơn đã `cancelled` không có tác dụng (idempotent).
- **Logic khi đơn ở `awaiting_payment`:**
  - Chuyển sang `cancelled` và ghi `shipment_status_history`.
  - Hủy (`void`) hóa đơn và đóng QR SePay đang `pending`.
  - Nhả xe giữ chỗ, trả ngựa về `active`, thông báo cho Customer và Manager.
- **Errors:**
  - `403`: không phải chủ đơn.
  - `404`: không tìm thấy đơn.
  - `409`: trạng thái không cho hủy, hoặc đã có giao dịch SePay `succeeded`/`review`.

### `POST /orders/:id/return/cancel` (Customer)
Khách hàng chủ đơn hủy chặng về.
- **Body:** `{ "reason": "Kế hoạch thi đấu thay đổi" }`
- **Logic:** Cập nhật `return_status = 'cancelled'`, ghi nhận `return_cancelled_at = NOW()`. Nếu số tiền hoàn > 0, tạo `shipment_refund_record` (`cancellation_category = 'return_leg_customer_cancel'`) đi qua luồng duyệt và chuyển khoản SoD.
- **Errors:** `400 Bad Request`, `403 Forbidden`, `409 Conflict`.

### `POST /orders/:id/return/company-cancel` (Logistics Manager / Admin)
Công ty chủ động hủy chặng về do điều kiện bất khả kháng hoặc giới hạn vận hành.
- **Body:** `{ "reason": "Bão lớn cấm đường và chuyến bay bị đình trệ" }`
- **Logic:** Cập nhật `return_status = 'cancelled'`, tạo `shipment_refund_record` hoàn 100% cước chặng về và 100% bảo hiểm chặng về (`cancellation_category = 'return_leg_company_cancel'`). Gửi thông báo cho khách hàng.

### `POST /orders/:id/return/reschedule` (Customer)
Khách hàng đổi ngày hẹn đón chặng về.
- **Body:** `{ "newReturnDepartureAt": "2026-12-25T08:00:00.000Z" }`
- **Logic:** Kiểm tra thời điểm hợp lệ (sau khi chặng đi kết thúc + 12h nghỉ). Nếu đổi trước ≥ 168 giờ: miễn phí. Nếu đổi trong vòng < 168 giờ: thu phí đổi ngày trễ 10% cước chặng về (`return_reschedule_fee`). Lưu lịch sử vào `shipment_return_change`.

### `POST /tracking/shipments/:id/return/no-show` (Driver / Escort được phân công)
Tài xế đánh dấu khách không giao ngựa tại điểm đón chặng về sau khi đã chờ đủ 120 phút.
- **Body:** `{ "notes": "Đã chờ 125 phút tại cổng trang trại, gọi khách 3 lần không liên lạc được", "evidenceUrls": ["https://.../photo1.jpg"] }`
- **Logic:** Xác thực tài xế được phân công chặng về. Kiểm tra điều kiện thời gian chờ (trước `returnDepartureAt + waitMinutes` trả `409 Conflict` kèm `allowedAt`). Khi hợp lệ: đóng đơn với trạng thái `completed`, `return_status = 'no_show'`, `return_no_show = true`, nhả ngựa và phương tiện, ghi `trip_status_log`. Không tạo hoàn tiền.

## Documents endpoints (Flow 2: Legal, Quarantine, and Customs Documents)

Base URL: `http://localhost:5000/api` (All endpoints require `Authorization: Bearer <token>`)

### `GET /documents/regulations`
Lists active quarantine and legal regulations by destination country. Supports optional query `?country=Singapore`.

### `POST /documents/regulations` (Transport Specialist / Admin)
Creates a new document requirement for a destination country.
- **Role:** `TRANSPORT_SPECIALIST`, `ADMIN`
- **Body:**
```json
{
  "country": "Singapore",
  "documentType": "horse_passport",
  "description": "Hộ chiếu FEI hoặc liên đoàn quốc gia cấp có gắn mã microchip",
  "effectiveDate": "2026-01-01"
}
```

### `POST /documents/upload` (Customer / Transport Specialist / Admin)
Uploads an official scan/PDF document for a specific horse.
- **Body:**
```json
{
  "horseId": 1,
  "regulationId": 1,
  "docType": "horse_passport",
  "docNumber": "FEI-VN-2026-12",
  "fileUrl": "https://storage.example.com/docs/passport.pdf",
  "issueDate": "2026-01-10",
  "expiryDate": "2027-01-10"
}
```

### `GET /documents/:id`
Retrieves detailed information for a specific document, including reviewer notes and official authority approval history.

### `GET /documents/horse/:horseId`
Lists all uploaded documents for a specific horse.

### `GET /documents/order/:orderId/checklist`
Returns the complete legal and quarantine compliance checklist for all horses in a transport order. Evaluates missing regulations, accepted documents, and the overall `isFullyCompliant` status.

### `PATCH /documents/:id/review` (Transport Specialist / Admin)
Specialist reviews and approves (`approved`), rejects (`rejected` with required reason), or marks a document as expired (`expired`). Notifies the customer automatically.
- **Body:**
```json
{
  "status": "approved",
  "notes": "Hồ sơ hợp lệ và còn thời hạn",
  "expiryDate": "2027-01-10"
}
```

### `POST /documents/:id/authority-approval` (Transport Specialist / Admin)
Records official submission and approval progress with agricultural, veterinary, and customs agencies.
- **Body:**
```json
{
  "authorityName": "Cơ quan Thú y Singapore (AVS)",
  "status": "approved",
  "approvalDate": "2026-10-10T08:00:00.000Z",
  "notes": "Đã cấp giấy phép nhập khẩu số AVS-2026/099"
}
```
- **Rules:** Đây là tầng phê duyệt thứ 2, không thay thế bước `PATCH /documents/:id/review`.
  - `status: "approved"` yêu cầu tài liệu đã `approved` nội bộ; nếu chưa thì trả `409`. Trạng thái tài liệu giữ nguyên.
  - `status: "rejected"` chuyển tài liệu sang `rejected` và ghi review log.
  - `status: "pending"` chỉ ghi nhận đã nộp cơ quan.
- **Errors:** `409` nếu tài liệu đã bị thay thế, đang `rejected`/`expired`, hoặc ghi `approved` cho tài liệu chưa duyệt nội bộ.

### `POST /documents/order/:orderId/notify-missing` (Transport Specialist / Admin)
Evaluates compliance for the order and automatically sends a high-priority notification to the customer listing all missing and rejected documents per horse.
- **Body:**
```json
{
  "customMessage": "Vui lòng hoàn tất nộp giấy tờ trước ngày 10/10 để kịp trình Cục Thú Y."
}
```

## Notifications endpoints

### `GET /notifications`
Retrieves all notifications for the authenticated user (sorted newest first).

### `PATCH /notifications/:id/read`
Marks a notification as read.

## Horses endpoints

Valid `horse.status` values are `active`, `in_transit`, `retired`, and `deceased` (`delivered` is not used). Creating a transport request atomically sets selected horses to `in_transit` (meaning held/reserved by a non-terminal shipment from `requested` through `in_transit`), and releases them back to `active` when removed in `change_requested` or when the shipment transitions to `cancelled`, `rejected`, `cancelled_operational`, or `completed`.

### `GET /horses`
Retrieves all racehorses belonging to the authenticated customer.

### `GET /horses/:id`
Retrieves details of a specific racehorse. Customers can only view their own horses.

### `POST /horses`
Registers a new racehorse profile directly into the database.
- **Body:**
```json
{
  "name": "Pegasus Star",
  "breed": "Thoroughbred",
  "age": 5,
  "microchipNo": "985141001248999",
  "passportNo": "FEI-VN-2026-888",
  "requiresPrivateStall": false,
  "temperament": "normal",
  "status": "active"
}
```
- Sau review 11/2026 (Step 2): **bỏ `gender` và `dateOfBirth`**. Hai trường này không còn trong DTO; nếu client cũ vẫn gửi thì bị bỏ qua (ValidationPipe `whitelist`). Cột DB được giữ cho dữ liệu cũ nhưng API không trả về nữa.
- `requiresPrivateStall` (boolean, mặc định `false`): ngựa cần chuồng riêng (đực giống, dễ kích động). Dùng khi xếp ngựa lên phương tiện.
- `temperament`: `calm` | `normal` | `difficult` (mặc định `normal`).
- Order detail (`GET /orders/:id`) trả thêm `horses[].requiresPrivateStall`.

### Horse documents (Step 2: giấy tờ lưu trên ngựa)

Giấy tờ thuộc về con ngựa và dùng lại cho nhiều đơn. Các endpoint này thuộc module `documents`. Quyền: Customer chỉ truy cập ngựa của mình (khác chủ trả `403`, ngựa không tồn tại trả `404`); Logistics Manager/Admin truy cập mọi ngựa; Driver/Escort bị chặn ở role guard.

#### `GET /documents/types`
Danh mục loại giấy tờ (`document_type`): `code`, `nameVi`, `nameEn`, `defaultValidityDays`, `isIdentity`, `sortOrder`.

#### `GET /horses/:horseId/documents`
Các giấy tờ đang hiệu lực của ngựa (cả giấy tờ chung lẫn giấy tờ nộp theo quy định của đơn). Mỗi bản ghi có thêm:
- `documentTypeCode`, `documentTypeNameVi`, `documentTypeNameEn`;
- `regulationId` = `null` với giấy tờ chung;
- `validityStatus`: `valid` | `expiring_soon` (còn dưới 30 ngày) | `expired` | `no_expiry`, và `daysUntilExpiry`. Hai trường này tính khi đọc, không lưu DB.

#### `POST /horses/:horseId/documents` (multipart/form-data)
- Field: `file` (PDF/PNG/JPG/DOCX, tối đa 10MB, có kiểm tra magic bytes) hoặc `fileUrl`; `documentTypeCode` (bắt buộc, phải có trong danh mục); `docNumber`; `issueDate`, `expiryDate` (`YYYY-MM-DD`).
- Bỏ trống `expiryDate` thì hạn được tính bằng `issueDate + defaultValidityDays` của loại giấy tờ.
- `expiryDate` trước `issueDate` trả `400`.
- Append-only: bản chung đang hiệu lực cùng loại của cùng ngựa được đánh `is_archived = true` và `superseded_by_document_id` trỏ sang bản mới. Bản mới có `status = submitted` và chờ Manager duyệt qua `PATCH /documents/:id/review`.

#### `GET /horses/:horseId/documents/:docId/history`
Toàn bộ phiên bản (gồm bản đã lưu trữ) của cùng loại giấy tờ trên ngựa, mới nhất trước.

#### `GET /horses/:horseId/documents/:docId/file`
Stream tệp, có kiểm tra giấy tờ thuộc đúng ngựa và đúng chủ sở hữu.

### Compliance & Document Requirements (Step 8, review 11/2026)

#### `GET /compliance/requirements`
Lấy danh sách yêu cầu giấy tờ động theo điểm đến, phương thức và ngựa được chọn. Khách hàng chỉ truy cập được yêu cầu đối với ngựa thuộc sở hữu của mình (`403` nếu có ngựa của người khác).
- **Query params:**
  - `country` (string, bắt buộc): quốc gia đến (VD: `Singapore`, `Cambodia`, `Vietnam`).
  - `departDate` (string, `YYYY-MM-DD`, bắt buộc): ngày khởi hành dự kiến.
  - `returnDate` (string, `YYYY-MM-DD`, tùy chọn): ngày kết thúc chuyến về nếu khứ hồi.
  - `mode` (`road` | `air` | `sea`, tùy chọn): phương thức vận chuyển.
  - `horseIds` (string dạng csv hoặc mảng, tùy chọn): danh sách mã ngựa (VD: `101,102`).
  - `borderGate` (string, tùy chọn): cửa khẩu hoặc sân bay dự kiến.
- **Response:**
  ```json
  {
    "country": "Singapore",
    "mode": "air",
    "usingGlobalBaseline": false,
    "departureDate": "2026-12-25",
    "tripEndDate": "2026-12-25",
    "earliestFeasibleDeparture": "2026-12-08",
    "isDepartureFeasible": true,
    "horses": [
      {
        "horseId": 101,
        "horseName": "Storm",
        "microchipNo": "CHIP-101",
        "passportNo": "PASS-101",
        "requirements": [
          {
            "regulationId": 1,
            "documentTypeCode": "health_certificate",
            "documentTypeName": "Giấy chứng nhận sức khỏe",
            "tier": "A",
            "leadTimeDays": 7,
            "maxIssueAgeDays": 10,
            "minValidityBufferHours": 48,
            "status": "reusable",
            "canSubmitLater": false,
            "requiresAuthorityApproval": false,
            "reasonVi": "Đã có giấy tờ hợp lệ, còn hạn đến hết chuyến"
          }
        ]
      }
    ],
    "summary": {
      "reusable": 1,
      "pendingReview": 0,
      "missing": 0,
      "expired": 0,
      "blocking": []
    }
  }
  ```

#### `GET /compliance/documents/:id/history`
Lấy lịch sử các lần kiểm duyệt (audit logs) của một tài liệu. Trả về mảng `document_review_log`: `reviewId`, `documentId`, `reviewedBy`, `reviewerRole`, `oldStatus`, `newStatus`, `reason`, `checklistSnapshot`, `createdAt`.

#### `POST /compliance/run-expiry-sweep` (Logistics Manager / Admin)
Chạy thủ công job quét giấy tờ hết hạn: tự động chuyển giấy tờ quá hạn sang `expired`, gửi cảnh báo nhắc hạn 30/7/1 ngày, hạ trạng thái các đơn `ready_to_depart` có hồ sơ Tầng A quá hạn về `planning`.

#### `PATCH /documents/:id/review` (Logistics Manager / Admin)
Kiểm duyệt hồ sơ với danh mục đối chiếu 4 điểm (`microchipMatches`, `passportMatches`, `issueDateOk`, `expiryOk`).
- **Body:**
```json
{
  "status": "approved",
  "notes": "Hồ sơ hợp lệ và đối chiếu trùng khớp",
  "checklist": {
    "microchipMatches": true,
    "passportMatches": true,
    "issueDateOk": true,
    "expiryOk": true
  }
}
```
- Nếu `status = "rejected"`, `notes` bắt buộc có ít nhất 10 ký tự.
- Ghi nhật ký kiểm toán vào `document_review_log`.

### `PUT /horses/:id`
Updates details of a racehorse profile owned by the customer.

### `DELETE /horses/:id`
Deletes a horse profile. If the horse has been part of past shipments, it is soft-deleted to status `'retired'` to preserve transport audit history.

## Fleet endpoints (Flow 3: Fleet Management & Capacity Allocation)

Base URL: `http://localhost:5000/api` (All endpoints require `Authorization: Bearer <token>`)

### `GET /fleet/vehicles`
Lists transport vehicles. Supports optional query filters: `?status=available|in_use|maintenance`, `?type=truck|aircraft_stall|container` and `?depotId=<id>` (Step 3). Each vehicle includes `vehicleClassCode`, `vehicleClassName`, `isHeavyTruck`, `depotId`, `depotName`.

### `GET /fleet/vehicles/:id`
Retrieves details of a specific vehicle.

### `POST /fleet/vehicles` (Manager / Admin)
Registers a new transport vehicle.
- **Body (Step 3):**
```json
{
  "vehicleClassCode": "truck_4",
  "depotId": 1,
  "plateOrCode": "51C-888.99",
  "status": "available"
}
```
- `vehicleClassCode` (from `GET /fleet/vehicle-classes`) decides `vehicleType` (road → `truck`, air → `aircraft_stall`, sea → `container`) and `capacity`. A `capacity` sent for a fixed-capacity class is ignored. `ferry_slot` has no fixed capacity, so `capacity` is required for it.
- Road vehicles must belong to an **active** depot (`depotId`); otherwise `400`. An unknown class or depot returns `400`.
- Legacy body `{ vehicleType, capacity }` without a class is still accepted.
- `PATCH /fleet/vehicles/:id` accepts `vehicleClassCode` and `depotId`; changing the class recalculates `capacity`.

### `GET /fleet/vehicle-classes`
Vehicle class catalog: `code`, `mode` (`road` | `air` | `sea`), `nameVi`, `nameEn`, `horseCapacity` (`null` = depends on the vehicle on the ferry), `priceCoefficient`, `isHeavyTruck`. Seed: `truck_1` (1), `truck_2` (2), `truck_4` (4, heavy, ×1.3), `truck_6` (6, heavy, ×1.6), `jet_stall` (3), `ferry_slot` (null), `vessel_pen` (1).

### Depots (Step 3) — Manager / Admin
- `GET /fleet/depots`: all depots with `vehicleCount`. `type`: `own` | `partner` (partner depot abroad, used for last-mile delivery).
- `GET /fleet/depots/:id`: depot plus `vehicles[]`.
- `POST /fleet/depots`: `{ code, name, country, city, address?, lat, lng, type?, isActive? }`. A duplicate `code` (case-insensitive) returns `409`.
- `PATCH /fleet/depots/:id`: partial update; `{ "isActive": false }` pauses the depot (no new vehicles can be assigned to it).
- `DELETE /fleet/depots/:id`: only when the depot has no vehicles; otherwise `409`.

### `GET /fleet/staff` (Fleet Coordinator / Manager / Admin)
Lists drivers, escorts, and coordinators available for trip assignment.

### `GET /fleet/shipments/:id/assignments`
Retrieves all vehicles and staff assigned to a specific shipment.

### `POST /fleet/shipments/:id/assign-vehicles` (Fleet Coordinator / Manager / Admin)
Assigns vehicles to an approved transport order. Enforces rule: total vehicle capacity must be >= the order's **required stall slots** (each horse 1 slot; a horse with `requiresPrivateStall` takes 2 slots — Step 3). Sets vehicle status to `in_use` and order status to `planning`.
- **Body:** `{ "vehicleIds": [1, 2] }`

### `POST /fleet/shipments/:id/assign-staff` (Fleet Coordinator / Manager / Admin)
Assigns drivers and escorts to a transport trip and sends system notifications.
- **Body:**
```json
{
  "assignments": [
    { "userId": 5, "roleInShipment": "driver" },
    { "userId": 6, "roleInShipment": "escort" }
  ]
}
```

## Routes endpoints (Flow 3: Route Planning & Trip Publishing)

Base URL: `http://localhost:5000/api` (All endpoints require `Authorization: Bearer <token>`)

### `GET /routes/shipment/:shipmentId`
Retrieves the planned route and ordered stops for a shipment.

### `GET /routes/shipment/:shipmentId/plan`
Returns the full trip plan (route, assigned vehicles, staff) and readiness evaluation (`isReadyToPublish`, list of `missingRequirements`).

### `POST /routes/shipment/:shipmentId` (Fleet Coordinator / Manager / Admin)
Creates or updates an ordered route with stops (rest, border check, quarantine, refuel, other). International routes must include at least one `border_check` or `quarantine` stop.
- **Body:**
```json
{
  "routeName": "Tuyến TP.HCM - Mộc Bài - Phnom Penh - Singapore",
  "totalDistanceKm": 1250.5,
  "stops": [
    {
      "sequenceNo": 1,
      "stopType": "other",
      "locationName": "Củ Chi Horse Farm, TP.HCM",
      "country": "Vietnam",
      "plannedDeparture": "2026-10-15T08:00:00Z"
    },
    {
      "sequenceNo": 2,
      "stopType": "border_check",
      "locationName": "Mộc Bài Border Gate",
      "country": "Vietnam",
      "plannedArrival": "2026-10-15T12:00:00Z",
      "plannedDeparture": "2026-10-15T14:00:00Z"
    },
    {
      "sequenceNo": 3,
      "stopType": "rest",
      "locationName": "Phnom Penh Vet Care Station",
      "country": "Cambodia",
      "plannedArrival": "2026-10-15T19:00:00Z",
      "plannedDeparture": "2026-10-16T06:00:00Z"
    },
    {
      "sequenceNo": 4,
      "stopType": "quarantine",
      "locationName": "Singapore Turf Club Quarantine Station",
      "country": "Singapore",
      "plannedArrival": "2026-10-17T15:00:00Z"
    }
  ]
}
```

### `PATCH /routes/:routeId/schedule` (Fleet Coordinator / Manager / Admin)
Modifies planned schedule times on stops. A mandatory `reason` is required for audit history.
- **Body:**
```json
{
  "reason": "Thời tiết xấu và ùn tắc tại cửa khẩu, lùi giờ khởi hành 2 tiếng",
  "stops": [
    {
      "stopId": 2,
      "plannedArrival": "2026-10-15T14:00:00Z",
      "plannedDeparture": "2026-10-15T16:00:00Z"
    }
  ]
}
```

### `POST /routes/shipment/:shipmentId/publish` (Logistics Manager / Coordinator / Admin)
Publishes the trip plan. Validates that the order is approved, route has >= 2 stops, assigned vehicles meet horse capacity, and staff is assigned. Changes shipment status to `in_transit` and route status to `active`. Notifies customer and operations team.
- **Body:** `{ "notes": "Xe đã chuẩn bị đầy đủ oxy và thuốc chống say" }`

### `POST /routes/stops/:stopId/progress` (Driver / Escort / Operations)
Records actual progress at a milestone stop (`arrived`, `customs_cleared`, `departed`, `delivered`) and notifies the coordinator and customer.
- **Body:**
```json
{
  "status": "arrived",
  "actualArrival": "2026-10-15T12:15:00Z",
  "notes": "Đã đến trạm Mộc Bài an toàn, kiểm tra sức khỏe ngựa ổn định"
}
```

## Contract rules

- Every mutation returns the updated resource status and an audit identifier.
- Status-changing endpoints must validate the actor's role and resource ownership.
- File upload endpoints must return attachment metadata, not expose local file paths.
- Tracking events are append-only; corrections are new events with a reason.
- Emergency route or cost changes require manager approval before publication.

Document request/response examples here as each module reaches an agreed contract.


## Payment gating after Flow 3

### `GET /orders/:id/payments/sepay`

Authenticated owner Customer; Manager/Admin may inspect. Ownership is checked before returning invoice or payment information. Response now includes:

```json
{
  "enabled": true,
  "provider": "sepay",
  "paymentUnlocked": false,
  "blockedReason": "Lộ trình và chuyến xe đang được bộ phận điều phối thiết lập chi tiết. Cổng thanh toán sẽ tự động mở sau khi lịch trình được xác nhận.",
  "invoice": null,
  "payment": null
}
```

After confirmation, `invoice` contains `id`, `code` (`INV-000001`), `shipmentId`, `routeId`, `amount`, `currency: VND`, `issuedAt` and an immutable `snapshot` of contact/route/legs. `paymentUnlocked` is computed from the latest route, staff confirmations and matching invoice/quote. Disabling SePay configuration does not delete an invoice. Existing paid receipts remain readable; pending QR URLs are suppressed whenever the gate closes.

### `POST /orders/:id/payments/sepay`

Customer only, owned shipment. `400` until Flow 3 confirmation and invoice issuance. Flow 1 approval or 100% compliance alone is insufficient. The server uses persisted integer VND amounts; client amounts are ignored. Repeated requests reuse the code. A stale QR received after the plan is invalidated is retained for reconciliation instead of being credited automatically. Historical sandbox payment initiation uses the same route gate, but sandbox success never satisfies real departure payment.

### `POST /routes/plan/:shipmentId/driver-confirm`

Driver/Escort confirms only their assigned role; Admin can name a `driverUserId`. The plan must already be approved. Last confirmation atomically issues the invoice, sets the plan/shipment to confirmed and notifies the customer. Repeated confirmation does not duplicate invoices or payment notifications. Missing vehicle/flight/schedule/quote is `400`.

### `GET /routes/plan/:shipmentId/readiness`

All three prerequisites: confirmed plan with invoice and staff, full legal compliance, verified real SePay payment for the current invoice amount. Customers may inspect only their own orders. Payment webhooks and legal reviews refresh readiness automatically. `POST /routes/shipment/:shipmentId/publish` and the first Flow 4 departure milestone enforce the same gate.

### Local migration and tests

From `backend`: `npm run migrate:payment-gate` (after existing migrations through 015). `npm run test:payment-gate` builds and starts a disposable MySQL 8 container and Nest test API, executes real HTTP/MySQL regression tests, then removes only the test container. It requires Docker and does not use the application's database. Frontend: `npm run test:sepay`.


## Equine value and insurance API

### `GET /orders/insurance-policy`

Authenticated callers receive `{ version, currency: "VND", usdToVnd: number | null, packages }`. Package rates and compensation use basis points. USD is selectable only when `INSURANCE_USD_TO_VND` is configured; empty means VND only. Invalid configured rates return 503 instead of silently applying a fabricated conversion.

### Create / resubmit

`POST /orders` and pre-approval `PUT /orders/:id` accept these fields per `horses[]` item:

```json
{
  "horseId": 1,
  "name": "Xích Thố",
  "quantity": 2,
  "declaredValue": 100000000,
  "declaredCurrency": "VND",
  "insurancePackage": "standard"
}
```

Defaults are `declaredValue: 0`, `declaredCurrency: VND`, `insurancePackage: basic`. Standard/Premium need value > 0. Negative, non-finite, more than two decimal places, unsupported currencies/packages, overflowing VND conversions/totals, duplicate or foreign/unavailable horses and inconsistent quantities return 400. Ownership is rechecked under the transaction. Client `insuranceFee`, `maxCompensation` or `exchangeRate` fields cannot override computed money/coverage.

Resubmission without `horses` preserves all saved policies/quantities and adds no insurance revision. With `horses`, include the selected identities and quantities; unchanged policies retain their saved rate/premium, changed policies use the current server rate. The former policy rows are recorded before replacement. Approval and change-request state transitions use conditional writes so simultaneous actions cannot reopen an approved policy.

Responses include per horse: the source value/currency, saved rate, `declaredValueVnd`, package, **unit** `insuranceFee`, **unit** `maxCompensation`, `emergencyVetCovered`, and `insurancePolicyVersion`. Order responses include `transportCost` (null until quoted), aggregate `insuranceFee`, and existing `totalCost` (0 until quoted). For the example above, insurance is 1,500,000 VND per horse, 3,000,000 VND for two; compensation limit is 80,000,000 VND per horse.

### `PATCH /orders/:id/approve`

Manager/Admin sends `{ "transportCost": 10000000 }` for base freight. The example above yields `transportCost: 10000000`, `insuranceFee: 3000000`, `totalCost: 13000000`. Legacy `totalCost` request field remains a base-freight alias. If both fields are sent with differing values, return 400; insurance is never added twice. The approved order JSON payload returned by `PATCH /orders/:id/approve` and `GET /orders/:id` (`requestCode`, `bookingType`, `stallUnitPrice`, `transportMode`, `requestedHorseCount`, `transportCost`, `insuranceFee`, `totalCost`, and per-horse `horses[]` policy details) serves as the quotation data source for client-side HTML/PDF printing; there is no server-side PDF quotation endpoint. Confirmation and SePay QR use the combined total. Customer insurance changes after approval are rejected.

### Migration / testing

From `backend`: `npm run migrate:insurance` applies rerunnable migration 017 to the configured database. Run existing migrations first. For this working branch, apply 016 as well if not yet present. `npm run test:insurance` builds and runs policy, real HTTP/MySQL and payment-regression tests in a disposable MySQL container. Frontend `npm run test:insurance` tests the selectable policies, previews, summary and persisted coverage rendering. No live insurance provider or claim-payout integration is introduced.

## Shared stall / dedicated charter API

> **Cập nhật Step 3 (review 11/2026): đã bỏ gom chuyến.** Đơn mới luôn là `dedicated_charter` (mỗi đơn đi xe riêng); gửi `shared_stall` khi tạo đơn trả `400`. `POST /fleet/road-trips` trả `410 Gone`. Đơn `shared_stall` cũ vẫn xem, báo giá, gửi lại và điều phối được; khi gửi lại, khách được chuyển sang bao chuyến nhưng không được chuyển ngược về ghép chuyến.

- `POST /orders`: optional `bookingType`, enum `shared_stall` / `dedicated_charter`, default shared. Unknown values return 400; no horse-count threshold is enforced. Values are accepted with either domestic/international or road/air scope. Prices supplied by Customer cannot quote the order.
- `PUT /orders/:id`: owned `change_requested` orders may set `bookingType`. Omitted type keeps the saved selection. A changed type appends a booking revision transactionally; the former freight, unit price and total are cleared for reapproval. Insurance is preserved unless changed explicitly. Other states return 400; other owners receive 403.
- Responses from order list/detail/create/update include `bookingType`, nullable `stallUnitPrice`, existing total `transportCost`, aggregate `insuranceFee`, combined `totalCost` and `requestedHorseCount`. Full trip plan's `order` includes these fields for Coordinator use.

### Approval examples

Shared, two horses (unit freight 2,000,000 VND, saved insurance 3,000,000 VND):

```json
{ "bookingType": "shared_stall", "quotedHorseCount": 2, "stallUnitPrice": 2000000 }
```

Backend stores `stallUnitPrice=2000000`, `transportCost=4000000`, `totalCost=7000000`. Unit and count must be integers; count/type must match the locked order. Missing count/type for a unit quote, stale count/type, charter with unit rate, mixed unit/total fields, negative/fractional amounts and DECIMAL overflow return 400. Authorization remains Manager/Admin only.

Dedicated, three horses:

```json
{ "bookingType": "dedicated_charter", "quotedHorseCount": 3, "transportCost": 9000000 }
```

Freight stays 9,000,000 VND, without multiplying by three. Add saved insurance once. Existing clients may still send `transportCost` or the legacy `totalCost` field as **total freight**, including shared orders; these requests do not store/invent a unit price or multiply their total. If both total aliases are present they must agree.

After Flow 3, invoice snapshot includes `bookingType`, nullable `stallUnitPrice`, horse count, total freight and insurance. SePay uses the unchanged combined invoice amount.

Apply migration 018 with `npm run migrate:booking` in `backend`, after existing migrations. `npm run test:booking` runs isolated HTTP/MySQL plus insurance/payment regressions; the frontend command of the same name tests cards, previews and quote payloads. No new environment variable is required.

## Controlled corrections and road-trip API (12/11/2026)

- Approval prices must be explicitly provided and positive whole VND. Omitted/null/empty/zero/negative/invalid prices return 400. This does not rewrite historical quotes. `totalCost = transportCost + insuranceFee` remains the response contract; the legacy approval input `totalCost` means base freight.
- On owned `change_requested` orders, omitted horse policy fields and quantity preserve saved values. Actual declaration changes recalculate the policy; unchanged declarations preserve saved FX rates. Approval mode never overwrites Domestic/International scope.
- `GET /fleet/road-trips`: Coordinator/Manager/Admin only. Returns id, vehicleId, vehiclePlate, bookingType, originLocation, destinationLocation, plannedDeparture, plannedArrival, capacity and bookedStalls. No other customers' identity or horses are included.
- `POST /fleet/road-trips`: **410 Gone since Step 3** (trip consolidation removed; hidden from Swagger). Road legs of new plans still create their own `road_trip` automatically when the plan is saved.
- Road capacity checks (plan save, vehicle assignment) count **stall slots**: a horse with `requiresPrivateStall` takes 2 slots; `stallsBooked` stores slots.
- `POST /routes/plan/:shipmentId/build-detail`: each road leg may send `roadTripId`. The backend uses that trip's vehicle/route/times, validates booking type, and sets `stallsBooked` from the shipment. Without an id, a timed road leg creates its own trip when saved. All leg/stop/vehicle changes and capacity checks are transactional. Insufficient slots or an overlapping exclusive/other trip return 400; the plan is not partially saved. No automatic compatibility tolerance is imposed.
- Flight legs cannot set roadTripId; existing air fields retain their meaning. Air operational shared/dedicated rules await approval.
- Customer route/full-plan reads enforce order ownership. `PATCH /orders/:id/complete` requires an in-transit order and Manager/Admin or an assigned Driver/Escort; completed retries do not duplicate notifications.
- MoMo confirm-atm requires sandbox enabled and non-production. Sandbox uses the exact stored VND amount and never updates official payment status or readiness. No live bank transaction is used in the regression suite.
- Apply 019 after existing migrations with `npm run migrate:road-trips`. `npm run test:controlled` runs focused regressions; the isolated backend runner includes real HTTP/MySQL road tests and upgrade/repeat checks. No new environment variable is added.
- Apply 020 with `npm run migrate:transport-mode` after 019. Order responses add nullable `transportMode` (`road`/`air`), set by Manager approval. Domestic/International and existing quotes are preserved. Customer, Manager and Coordinator prefer the typed mode; legacy note inference remains a UI fallback.

## Security, Compliance, Fleet CRUD & Reports Hardening

- **Documents (`backend/src/modules/documents`):**
  - `GET /documents/:id/file`: Streams uploaded compliance files only to authorized owners or staff roles (`TRANSPORT_SPECIALIST`, `LOGISTICS_MANAGER`, `FLEET_ROUTE_COORDINATOR`, `DRIVER_ESCORT`, `ADMIN`), with `Content-Security-Policy` sandbox headers. Static `/uploads/documents` directory serving is disabled.
  - `PATCH /documents/regulations/:id`: (`TRANSPORT_SPECIALIST`, `ADMIN`) Updates quarantine regulation fields (`country`, `documentType`, `description`, `effectiveDate`).
  - Document & horse image uploads validate both extension/MIME and file magic bytes (`verifyUploadedFileMagicBytes`).
- **Fleet (`backend/src/modules/fleet`):**
  - `PATCH /fleet/vehicles/:id` & `DELETE /fleet/vehicles/:id`: (`FLEET_ROUTE_COORDINATOR`, `LOGISTICS_MANAGER`, `ADMIN`) Update or remove fleet equipment.
  - `POST /fleet/staff`: Restricted to Manager/Admin for internal non-admin staff roles (`TRANSPORT_SPECIALIST`, `FLEET_ROUTE_COORDINATOR`, `DRIVER_ESCORT`).
- **Reports (`backend/src/modules/reports`):**
  - `GET /reports/performance`: Restricted to `LOGISTICS_MANAGER` / `ADMIN`; aggregates real MySQL shipment, revenue, corridor, and status breakdown metrics.
- **Database Migration Runner:** `023_drop_plain_password.sql` removes plaintext password columns from `user` and `otp_verification`; run all pending SQL migrations idempotently via `npm run migrate:all` in `backend/`.

## Spec v3.1 Endpoints (Waves 0–5: Governance, Compliance, SLA, Vitals, Flow 5 & Flow 6)

- **Orders Cutoff & Operational Governance (`OrdersController`, `OrdersOpsController`):**
  - `GET /orders/cutoff-policy`: Authenticated users query dynamic `Order Cutoff` minimum lead days (`MAX(2d charter | 3d shared, maxTierALead + 2d)`) and `earliestDepartureDate` (UTC) by `destinationLocation`, `originLocation`, `bookingType`, `transportMode`, `transportationType`.
  - `POST /orders` (`CUSTOMER`) & `PUT /orders/:id` (`CUSTOMER`): Enforce dynamic `Order Cutoff`; departures earlier than `earliestDepartureDate` return `422 Unprocessable Entity` with `code: 'ORDER_CUTOFF_VIOLATION'`. Wrong-state mutations and race conditions return `409 Conflict`.
  - `POST /orders/:id/operational-cancel` (`LOGISTICS_MANAGER`, `ADMIN`): Transitions shipment to `cancelled_operational` (forbidden once `in_transit` -> `409 Conflict`), computes refund/credit policy matrix, deducts logged disbursements, and creates `shipment_refund_record`.
  - `GET /orders/refunds` (`LOGISTICS_MANAGER`, `ADMIN`) & `GET /orders/:id/refunds` (authorized order viewers): Lists manual refund / 30-day credit records.
  - `PATCH /orders/refunds/:refundId/approve` (`LOGISTICS_MANAGER`, `ADMIN`): Approves refund or credit; `>= 20,000,000 VND` cash refunds require Dual Approval (`second_approved_by != approved_by`, else `403 Forbidden`).
  - `POST /orders/refunds/:refundId/transfer` (`ADMIN`): Multipart/JSON bank-transfer confirmation with `magic bytes` validation; enforces server-side SoD (`transferred_by != approved_by` / `second_approved_by`, else `403 Forbidden`).
  - `GET /orders/refunds/:refundId/receipt` & `GET /orders/disbursements/:disbursementId/receipt`: Authenticated receipt streams (`Cache-Control: private, no-store`, CSP sandbox).
  - `GET /orders/:id/disbursements` & `POST /orders/:id/disbursements` (`LOGISTICS_MANAGER`, `ADMIN`, `TRANSPORT_SPECIALIST`): Records reimbursable statutory fees with multipart receipt upload.
  - `POST /orders/:id/upgrade-charter` & `POST /orders/:id/reschedule-shared` (`LOGISTICS_MANAGER`, `ADMIN`, `CUSTOMER`): Handles `D-3` fallback (`void` + replacement invoice pre-payment or `supplemental_invoice` post-payment).
  - `POST /orders/:id/payment-grace` (`LOGISTICS_MANAGER`, `ADMIN`): Grants single payment grace (`MIN(granted + 10h, departure - 24h)`); subsequent attempts return `409 Conflict`.
  - `POST /orders/:id/sla-fallback` & `POST /orders/sla/run-sweep` (`LOGISTICS_MANAGER`, `ADMIN`): Executes `T-52h` fallback actions and SLA/grace expiry auto-cancellation sweep.

- **Compliance & Regulations (`DocumentsController`):**
  - `GET /documents/order/:orderId/checklist`: Evaluates horse ownership (`horse.owner_id`), multidimensional `regulation` matching (`borderGate`, `transportMode`, `docTier`, `leadTimeDays`, `requiresAuthorityApproval`, `minValidityBufferHours`), 2-tier authority approvals (`document_approval`), safety buffers (`24h` domestic / `48h` international), dynamic `orderCutoffDate` & `tierADeadline`, and non-blocking Tier-B `earlyIssuanceWarning`. Also exposes `BR-F2-06` `in_transit_compliance_alert` blocking `customs_cleared` (`422`) when compliance lapses mid-transit.

- **Routes & Fleet (`RoutesController`, `FleetController`):**
  - `GET /routes/shipment/:shipmentId/optional`: Non-404 read endpoint returning `{ route: RouteEntity | null }` (`200 OK`) for unplanned orders while preserving the same customer ownership check and `transfer_hub` / `roadTripId` redaction as `GET /routes/shipment/:shipmentId`.
  - `POST /routes/plan/:shipmentId/build-detail` (`FLEET_ROUTE_COORDINATOR`, `LOGISTICS_MANAGER`, `ADMIN`): Enforces `BR-F3-03` (unique `sequenceNo`, valid leg windows, chronological non-overlapping legs, and mandatory `border_check` or `quarantine` stop on International orders -> `400 Bad Request`), `BR-F3-04` LIFO `stall_number` auto-assignment (`S1`, `S2`, ...) on consolidated road trips, and returns `409 Conflict` when editing confirmed/locked plans (`setStrategicFramework`, `buildDetailedPlan`, legacy routes).
  - `PATCH /fleet/staff/:userId/shift` (`LOGISTICS_MANAGER`, `ADMIN`): Persists staff shift assignments and availability status in MySQL.

- **Tracking, Equine Vitals & Flow 6 Handover (`TrackingController`, `HandoverController`):**
  - `GET /tracking/vital-config` & `PATCH /tracking/vital-config` (`LOGISTICS_MANAGER`, `ADMIN`, `TRANSPORT_SPECIALIST`): Reads/updates 3-tier closed vital thresholds (`equine_vital_config`) with `<= 6h` consecutive escalatable-amber escalation.
  - `POST /tracking/shipments/:shipmentId/health-logs/upload` (`DRIVER_ESCORT`, `FLEET_ROUTE_COORDINATOR`, `LOGISTICS_MANAGER`, `ADMIN`): Multipart health-log creation (up to 5 images `<= 5MB` validated via magic bytes) replacing legacy base64 JSON; `GET /tracking/health-logs/attachments/:filename` streams files behind auth.
  - `POST /tracking/shipments/:shipmentId/coordinator-override` (`FLEET_ROUTE_COORDINATOR`, `LOGISTICS_MANAGER`, `ADMIN`): Append-only status override recording `updated_by_role` and `isBackdated` checks (`notes` mandatory if `> 30m` late).
  - `GET /tracking/handovers` (`LOGISTICS_MANAGER`, `FLEET_ROUTE_COORDINATOR`, `ADMIN`) & `GET /tracking/shipments/:shipmentId/handovers`: Lists Flow 6 per-horse handover records (`delivery_handover`).
  - `POST /tracking/shipments/:shipmentId/handovers` (`DRIVER_ESCORT`, `FLEET_ROUTE_COORDINATOR`, `LOGISTICS_MANAGER`, `ADMIN`), `POST /tracking/handovers/:handoverId/respond` (`CUSTOMER`, `ADMIN`), `POST /tracking/handovers/:handoverId/resolve-dispute` (`LOGISTICS_MANAGER`, `ADMIN`), and `GET /tracking/handovers/attachments/:filename`: Driver submission, Customer confirmation/dispute (with mandatory evidence on dispute), and Manager resolution capped at `maxCompensation`.

- **Flow 5 Incidents & Change Requests (`IncidentsController`):**
  - `GET /incidents`, `GET /incidents/:incidentId`, `GET /incidents/attachments/:filename`, `POST /incidents/shipments/:shipmentId` (`DRIVER_ESCORT`, `FLEET_ROUTE_COORDINATOR`, `LOGISTICS_MANAGER`, `ADMIN`), `PATCH /incidents/:incidentId/assess`, `POST /incidents/:incidentId/resolve` (`FLEET_ROUTE_COORDINATOR`, `LOGISTICS_MANAGER`, `ADMIN`).
  - `GET /incidents/change-requests`, `POST /incidents/:incidentId/change-requests` (`FLEET_ROUTE_COORDINATOR`, `LOGISTICS_MANAGER`, `ADMIN`), `POST /incidents/change-requests/:changeId/review` (`LOGISTICS_MANAGER`, `ADMIN`), `POST /incidents/change-requests/:changeId/publish` (`FLEET_ROUTE_COORDINATOR`, `LOGISTICS_MANAGER`, `ADMIN`): Two-step incident route/cost change workflow (`emergency_vet_covered` requires Premium package -> `422` otherwise; `operating_cost` approval records `shipment_operating_cost` without mutating `shipment_invoice`).

- **Reports & Operating Costs (`ReportsController`):**
  - `GET /reports/performance` (`LOGISTICS_MANAGER`, `ADMIN`): Live DB aggregations for Gross/Adjusted OTD, Quarantine pass rates, revenue, `retainedCancellationRevenue`, `creditLiabilityBalance`, `netRealizedCashRevenue`, operating costs, and gross profit.
  - `GET /reports/shipments/:shipmentId/operating-costs` & `POST /reports/shipments/:shipmentId/operating-costs` (`LOGISTICS_MANAGER`, `FLEET_ROUTE_COORDINATOR`, `ADMIN`), `DELETE /reports/operating-costs/:costId` (`LOGISTICS_MANAGER`, `ADMIN`), and `PATCH /reports/shipments/:shipmentId/excused-delay` (`LOGISTICS_MANAGER`, `ADMIN`; locked `409 Conflict` after 48h from arrival).

## Equine Insurance v2 & Claims Endpoints (Step 6 — Migration 033)

- **GET `/orders/:id/insurance/payout-table`**
  - **Access:** Authenticated (`CUSTOMER` owns the order, `LOGISTICS_MANAGER`, `ADMIN`).
  - **Description:** Returns the dynamic M1–M4 payout calculation table for each horse in the order, showing declared value, insurance package, fee paid, and maximum payable amount for M1 (minor injury / vet cost), M2 (minor permanent disability - 30%), M3 (severe permanent disability - 50%), M4 (death / humane destruction - 80% or 100%).
  - **Response 200:**
    ```json
    {
      "horses": [
        {
          "shipmentHorseId": 12,
          "horseName": "Thần Mã",
          "declaredValueVnd": 1000000000,
          "package": "standard",
          "insuranceFee": 15000000,
          "payoutRules": [
            { "severity": "M1", "payoutType": "vet_cost_capped", "capVnd": 100000000, "formula": "Chi phí thú y thực tế (tối đa 100,000,000 VNĐ)" },
            { "severity": "M2", "payoutType": "percent_of_value", "percentBps": 3000, "amountVnd": 300000000, "formula": "30% giá trị khai báo" },
            { "severity": "M3", "payoutType": "percent_of_value", "percentBps": 5000, "amountVnd": 500000000, "formula": "50% giá trị khai báo" },
            { "severity": "M4", "payoutType": "percent_of_value", "percentBps": 8000, "amountVnd": 800000000, "formula": "80% giá trị khai báo" }
          ]
        }
      ]
    }
    ```

- **POST `/orders/:id/horses/:shipmentHorseId/claims`**
  - **Access:** `CUSTOMER` (must be the order owner).
  - **Description:** Submits an insurance claim for a specific horse. Requires multipart form-data.
  - **Constraints:**
    - Order must be in `completed` status within 72 hours of completion (or `in_transit` if severity is `M4` death).
    - An active claim (status `submitted` or `under_review`) cannot exist concurrently for the same horse (`409 Conflict`).
    - At least one evidence file (photo, vet report) must be attached.
  - **Request (multipart/form-data):**
    - `severity`: `"M1"` | `"M2"` | `"M3"` | `"M4"` (mandatory)
    - `description`: string, min 10 chars (mandatory)
    - `requestedAmount`: number, >= 0 (mandatory)
    - `vetCostVnd`: number (optional, used for M1 calculations)
    - `files`: file attachments (JPEG, PNG, PDF <= 10MB each)
  - **Response 201:** Created `InsuranceClaimItem` with status `"submitted"` and auto-computed `suggestedAmount`.

- **GET `/orders/:id/claims`**
  - **Access:** `CUSTOMER` (order owner), `LOGISTICS_MANAGER`, `ADMIN`.
  - **Description:** Lists all insurance claims filed for horses within the specified order.

- **GET `/insurance/claims`**
  - **Access:** `LOGISTICS_MANAGER`, `ADMIN`.
  - **Description:** Manager console endpoint to query all claims across the system with optional filters (`status`, `severity`, `search`, pagination).

- **GET `/insurance/claims/:claimId`**
  - **Access:** Claim owner (`CUSTOMER`), `LOGISTICS_MANAGER`, `ADMIN`.
  - **Description:** Retrieves detailed claim record, including horse profile, evidence list, suggested amount, review notes, and audit event history.

- **GET `/insurance/claims/:claimId/evidence/:fileIndex`**
  - **Access:** Claim owner (`CUSTOMER`), `LOGISTICS_MANAGER`, `ADMIN`.
  - **Description:** Streams the uploaded evidence document/photo with secure sandbox headers.

- **PATCH `/insurance/claims/:claimId/review`**
  - **Access:** `LOGISTICS_MANAGER`, `ADMIN`.
  - **Description:** Reviews and decides on a claim (`approve` or `reject`).
  - **Constraints:**
    - Status must be `submitted` or `under_review`.
    - If `action = 'approve'`: `approvedAmount` is mandatory, must not exceed policy rule cap (`400 Bad Request`). If `approvedAmount != suggestedAmount`, `reason` is required. Automatically creates `shipment_refund_record` with category `insurance_claim`. If `approvedAmount >= 20,000,000 VND`, marks `requires_dual_approval = true`.
    - If `action = 'reject'`: `rejectionCode` and `reason` are mandatory.
  - **Request Body (JSON):**
    ```json
    {
      "action": "approve",
      "approvedAmount": 800000000,
      "notes": "Hồ sơ giám định tử vong hợp lệ từ phòng thú y chỉ định.",
      "reason": ""
    }
    ```
  - **Response 200:** Updated `InsuranceClaimItem`.

- **Migrations:** Run `024_wave0_schema_hotfixes.sql`, `025_wave1_g1_g2_reports_compliance.sql`, `026_wave2_g3_g4_ops_refunds_sla_vitals.sql`, and `027_wave3_flow5_incidents_and_flow6_handover.sql` (or `npm run migrate:all` in `backend/`).

## Step 9 — Phân bổ xe, giữ chỗ, giờ cấm đô thị, tham số nghỉ (Migration 036)

### `POST /quotes` (bổ sung)

Request thêm `pickupAt?: string` — `"YYYY-MM-DDTHH:mm"` (hiểu là giờ Việt Nam) hoặc ISO có múi giờ. Thiếu thì mặc định 08:00 giờ Việt Nam của `departureDate`. Giờ ở quá khứ → `400`.

Response bổ sung: `requestedPickupAt`, `pickupAt` (của phương án đề xuất), `jetStallsRequired` (air), `vesselPens` (sea vessel), `partnerDepot`, `shortage`, và mỗi phần tử `options[]`:

```json
{
  "optionCode": "cheapest",
  "label": "Rẻ nhất",
  "recommended": true,
  "vehicles": [{ "classCode": "truck_4", "className": "Xe tải ngựa 4 chỗ", "count": 1, "capacity": 4, "depotId": 1, "depotName": "Trạm Thủ Đức", "deadheadKm": 20, "isHeavyTruck": true, "trips": 1, "vehicleIds": [12], "plates": ["51C-123"] }],
  "vehicleIds": [12],
  "extraDays": 0,
  "requestedPickupAt": "2026-12-10T02:00:00.000Z",
  "pickupAt": "2026-12-10T15:00:00.000Z",
  "pickupShifted": true,
  "shiftReasonVi": "Xe tải nặng không được vào nội đô Hồ Chí Minh trong giờ cấm; dời sang 22:00 ngày 2026-12-10 (giờ Việt Nam).",
  "nightSurcharge": true,
  "deliveryAt": "2026-12-11T00:00:00.000Z",
  "etaHours": 9,
  "restStops": 1,
  "mandatoryRests": 0,
  "reservationWindow": { "start": "…", "end": "…" },
  "warnings": ["PICKUP_SHIFTED_CITY_BAN"],
  "outboundFreightTotal": 19750000,
  "freight": { "lines": [], "subtotal": 19750000, "rounding": 0, "total": 19750000 }
}
```

`optionCode`: `cheapest | fewest_vehicles | earliest | split_days | two_depots`. Khứ hồi: `freight.total` của mỗi phương án đã cộng cước chặng về (giảm 10%). Cảnh báo mới: `PICKUP_SHIFTED_CITY_BAN`, `DELIVERY_SHIFTED_CITY_BAN`, `NO_PARTNER_DEPOT`, `NO_PARTNER_TARIFF`, `VEHICLE_SHORTAGE`, `SPLIT_DAYS_DELAYED_DELIVERY`.

Không có phương án: `200` với `{ "quoteId": null, "options": [], "recommendedOptionCode": null, "shortage": { "slots": 3, "suggestedDates": ["2026-12-12", "2026-12-13", "2026-12-14"] } }`.

### `POST /orders` (bổ sung)

- `optionCode` phải thuộc `options[]` của báo giá (báo giá có phân bổ xe), sai → `400`.
- Giữ chỗ các xe của phương án trong transaction tạo đơn; xe đã bị đơn khác giữ → `409` "Xe trong phương án đã được đặt, vui lòng báo giá lại".
- Ghi `shipment.allocation_option_code`, `allocation_snapshot`, `pickup_at`, `night_surcharge_applied`.

### Giờ cấm xe tải nội đô

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/fleet/city-restrictions` | Manager, Admin | `{ rules, exceptions, disclaimerVi }` |
| GET | `/fleet/city-restrictions/check?lat=&lng=&date=YYYY-MM-DD&heavy=true` | Mọi user đã đăng nhập | `{ restricted, cities, allowedWindows: [{from,to}], holidayExceptions, legalReferences, isDemoData, messageVi }` |
| POST | `/fleet/city-restrictions` | Manager, Admin | Tạo quy tắc. `bannedFrom/bannedTo` dạng `HH:mm` (to < from = qua nửa đêm), `radiusKm` 1–50, `legalReference` bắt buộc, `daysOfWeek` ISO 1–7 |
| PATCH | `/fleet/city-restrictions/:id` | Manager, Admin | Sửa quy tắc (tắt bằng `isActive: false`). `404` nếu không có |
| POST | `/fleet/city-restrictions/exceptions` | Manager, Admin | Ngoại lệ ngày lễ `{ city, exceptionDate, bannedFrom, bannedTo, note }`; trùng `(city, date, bannedFrom)` → `409` |
| DELETE | `/fleet/city-restrictions/exceptions/:id` | Manager, Admin | Xóa ngoại lệ |

### Tham số nghỉ dọc đường (B4)

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/system-settings/journey-rules` | Mọi user đã đăng nhập | `{ maxDriveHoursBeforeRest, restMinutes, maxJourneyHours, mandatoryRestHours, nightWindow: { from, to } }` |
| PATCH | `/system-settings/journey-rules` | Manager, Admin | Cập nhật (validate khoảng giá trị, `HH:mm`) |

### Xe đã giữ chỗ của đơn

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/fleet/shipments/:id/reservations` | Đã đăng nhập; Customer chỉ đơn của mình (`403`) | `{ optionCode, pickupAt, nightSurchargeApplied, snapshot, reservations[] }` |
| POST | `/fleet/shipments/:id/reservations/swap` | Manager, Admin | `{ fromVehicleId, toVehicleId, reason }` — lý do ≥ 5 ký tự; tổng sức chứa phải đủ; xe mới bận → `409`; đơn đã kết thúc/đang chạy → `409` |

### `POST /routes/plan/:shipmentId/build-detail` (bổ sung)

`legs[].allocationOverrideReason` bắt buộc (≥ 5 ký tự) khi chặng bộ dùng xe khác nhóm xe đã giữ chỗ của đơn, nếu không → `400`. Chặng bay được server ghi `jet_stall_count`. Xe đang được đơn khác giữ chỗ trùng khung giờ → `409`.

## GPS Tracking, Geofence & Simulation API (Step 10 — Migration 037)

Base URL: `http://localhost:5000/api` (Tất cả endpoint yêu cầu `Authorization: Bearer <token>`)

### 1. `POST /tracking/shipments/:shipmentId/pings`
- **Quyền:** `DRIVER_ESCORT`, `LOGISTICS_MANAGER`, `ADMIN`.
- **Mô tả:** Tiếp nhận batch tối đa 100 ping tọa độ vị trí của phương tiện đang thực hiện chuyến đi.
- **Request Body:**
```json
{
  "pings": [
    {
      "latitude": 10.776889,
      "longitude": 106.700806,
      "speedKmh": 52.4,
      "headingDeg": 45.0,
      "accuracyM": 12.5,
      "source": "gps",
      "recordedAt": "2026-11-23T14:00:00Z"
    }
  ]
}
```
- **Quy tắc:**
  - Bỏ qua ping tương lai (> 2 phút) hoặc quá cũ (> 24 giờ). Gắn cờ `is_backdated = 1` nếu chậm > 5 phút.
  - Nếu `source = 'simulated'` và hệ thống đang tắt chế độ giả lập (`simulation_enabled = false`) → `403 Forbidden` (`SIMULATION_DISABLED`).

### 2. `GET /tracking/shipments/:shipmentId/live`
- **Quyền:** Đã đăng nhập; `CUSTOMER` chỉ xem chuyến của mình (`403 Forbidden`).
- **Mô tả:** Cung cấp dữ liệu viễn trắc trực tiếp cho bản đồ live tracking: vị trí xe, heading, tốc độ, vệt đường thực tế (giảm lấy mẫu tối đa 500 điểm qua RDP), tiến độ %, ETA, sinh hiệu mới nhất.
- **Bảo mật sinh hiệu:** Với `CUSTOMER`, nếu cờ hệ thống `tracking.customer_vitals_detail = false`, server tự động ẩn số đo thô `temperature_c` và `heart_rate_bpm`, chỉ trả về tầng trạng thái an toàn `condition_status`.

### 3. `GET /tracking/live-overview`
- **Quyền:** `LOGISTICS_MANAGER`, `ADMIN`, `DRIVER_ESCORT`.
- **Query params:** `?alertFilter=all|green|amber|red`
- **Mô tả:** Màn hình giám sát radar tổng thể toàn bộ các xe đang `in_transit`, kèm vị trí mới nhất, số lượng cảnh báo và phân tầng `alertTier`.

### 4. `GET /system-settings/tracking` & `PATCH /system-settings/tracking`
- **Quyền GET:** Mọi user đã đăng nhập.
- **Quyền PATCH:** Chỉ `ADMIN` (`403 Forbidden` đối với các role khác).
- **Mô tả:** Xem và cập nhật cấu hình định vị, bán kính geofence mặc định / khu lớn, cờ hiển thị sinh hiệu cho khách và cờ giả lập tuyến đường.
- **Request Body (PATCH):**
```json
{
  "simulationEnabled": true,
  "customerVitalsDetail": false,
  "geofenceRadiusDefaultM": 300,
  "geofenceRadiusLargeSiteM": 1000
}
```

### 5. `GET /tracking/shipments/:shipmentId/timeline` (Step 11 — Timeline Dọc Dùng Chung)
- **Quyền:** Đã đăng nhập. `CUSTOMER` chỉ xem đơn hàng của mình (`403 Forbidden` nếu truy cập đơn của khách khác).
- **Mô tả:** Trả về danh sách toàn bộ các mốc tiến độ chuẩn hóa theo thứ tự hành trình (`pre_trip`, `outbound`, `return`, `post_trip`), phục vụ component `VerticalTimeline`.
- **Phân quyền và che giấu dữ liệu (Privacy & SoD):**
  - Đối với `CUSTOMER`: Server tự động ẩn các trạm trung chuyển gom hàng nội bộ (`transfer_hub`) và ẩn tên nhân viên nội bộ (`actorLabel = undefined`).
  - Đối với `LOGISTICS_MANAGER`, `ADMIN`, `DRIVER_ESCORT`: Hiển thị đầy đủ nhãn người cập nhật, cờ can thiệp `flagged`, nguồn tọa độ (`gps`, `simulated`, `manual`, `override`).
- **Response Format:**
```json
{
  "shipmentId": 12,
  "requestCode": "TR-2026-F4",
  "isRoundTrip": false,
  "currentMilestoneId": "leg_start_1",
  "items": [
    {
      "id": "pre_paid",
      "group": "pre_trip",
      "kind": "payment",
      "title": "Thanh toán cước phí vận chuyển",
      "status": "done",
      "actualAt": "2026-11-23T08:00:00Z"
    },
    {
      "id": "stop_10",
      "group": "outbound",
      "kind": "quarantine",
      "title": "Trạm kiểm dịch Cửa khẩu Mộc Bài",
      "subtitle": "Bến Cầu, Tây Ninh",
      "status": "current",
      "plannedAt": "2026-11-23T10:00:00Z",
      "actualAt": null,
      "delayMinutes": 25,
      "progressPercent": 65,
      "locationSource": "gps",
      "vitals": [
        { "horseName": "Xích Thố", "tier": "green", "text": "38.2°C • 40 bpm (Ổn định)" }
      ]
    }
  ]
}
```
