# PROMPT STEP 12: Kiểm thử tổng, dữ liệu demo, kịch bản demo, rà tài liệu, chuẩn bị bảo vệ

## 0. Vai trò và mục tiêu

Bạn là kỹ sư QA + full-stack trong repo EquiTransit. Nhiệm vụ: triển khai **Step 12** (bước cuối) của `docs/dinh-huong-phat-trien-sau-review.md`: đảm bảo toàn bộ góp ý của hội đồng (G1–G12) **chạy được, có dữ liệu demo, có test, có tài liệu khớp code**, và chuẩn bị nội dung bảo vệ.

Step này **chủ yếu kiểm tra và bổ sung**, không thêm tính năng lớn. Nếu phát hiện lỗi nghiệp vụ ở Step trước: sửa lỗi nhỏ, rõ ràng (kèm test); lỗi lớn hoặc cần thiết kế lại → **ghi vào báo cáo, không tự viết lại**.

## 1. Bắt buộc đọc trước

1. `docs/antigravity-prompts/_COMMON.md`.
2. `AGENTS.md`.
3. File định hướng **toàn bộ**, đặc biệt **Phần A** (bảng G1–G12), **STEP 12**, **Phần F** (rủi ro), dòng "Trạng thái" dưới mỗi Step (cho biết Step nào đã làm, khác kế hoạch ở đâu).
4. Mọi `PROMPT.md` của Step 4–11 trong `docs/antigravity-prompts/` (để biết tiêu chí hoàn thành từng Step).
5. `docs/requirements.md`, `docs/actors-and-roles.md`, `docs/api-documentation.md`, `docs/erd.md`, `docs/flows/*`, `.env.example`, `database/seed.sql`, `database/schema.mysql.sql`, `database/migrations/*`.
6. `backend/package.json` (script `test`, `migrate:all`, các script test tích hợp), `backend/test/*`.

## 2. Bước 0: Kiểm kê (làm trước tiên, ghi kết quả vào báo cáo)

Lập bảng **"Step → trạng thái thực tế"** cho Step 1–11 bằng cách kiểm tra code (không chỉ tin dòng trạng thái): migration có chưa, endpoint chính có chưa, trang frontend có chưa, test có chưa. Step nào chưa làm hoặc làm dở → ghi rõ, **phần demo liên quan đánh dấu "chưa sẵn sàng"** thay vì giả lập kết quả.

## 3. Phạm vi

### 12.1 Dữ liệu demo

Tạo **`database/seed-demo-after-review.sql`** (idempotent, chạy lại không nhân đôi; dùng khóa tự nhiên: email, mã trạm, biển số, mã cảng, tên ngựa + chủ...). Không đụng dữ liệu thật. Thêm script `npm run seed:demo` trong `backend/package.json` gọi một file `database/seed-demo.cjs` (mẫu kết nối giống `database/migrate.cjs`, đọc `backend/.env`, **từ chối chạy** khi `NODE_ENV=production`).

Nội dung:
- **Tài khoản demo** (mật khẩu lấy từ biến môi trường `DEMO_ACCOUNT_PASSWORD`, không hard-code; thiếu biến thì script dừng và báo): 2 Customer (A, B), 2 Manager (để thử SoD duyệt kép), 1 Admin, 2 Driver, 1 Escort. Mật khẩu hash bằng cùng thuật toán backend đang dùng (đọc `auth` để dùng đúng `bcryptjs` và số vòng). Cập nhật `.env.example`: `DEMO_ACCOUNT_PASSWORD=`.
- **Trạm**: 4 trạm VN + 3 trạm đối tác (đã seed ở Step 3; chỉ bổ sung nếu thiếu).
- **12 xe đủ loại** phân bổ các trạm: ví dụ Thủ Đức: 2 truck_1, 1 truck_2, 1 truck_4, 1 truck_6; Long Biên: 1 truck_2, 1 truck_4; Đà Nẵng: 1 truck_4; Cần Thơ: 1 truck_2; Phnom Penh: 1 truck_4 (partner); Bangkok: 1 truck_4; Singapore: 1 truck_2. Biển số dạng demo rõ ràng (`DEMO-51C-001`...).
- **Bảng giá v1** (road VN, road PARTNER, air, sea) — chỉ thêm nếu chưa có.
- **7 quốc gia** có yêu cầu giấy tờ (Step 8) — chỉ thêm nếu thiếu.
- **Ngựa** của Customer A: ít nhất 4 con, trong đó 1 con `requires_private_stall = true`; giấy tờ:
  - Ngựa 1: hộ chiếu còn hạn 2030, tiêm cúm còn hạn, Coggins còn hạn → dùng lại được.
  - Ngựa 2: hộ chiếu còn hạn, tiêm cúm **hết hạn** tháng trước.
  - Ngựa 3: **thiếu** hộ chiếu.
  - Ngựa 4 (chuồng riêng): đủ giấy, 1 giấy sắp hết hạn trong 10 ngày.
  - Tệp giấy tờ: **không dùng file rỗng giả** (quy tắc AGENTS). Script tạo các tệp PDF nhỏ **hợp lệ** (vài trăm byte, có header `%PDF-1.4` và nội dung text "DEMO — không phải giấy tờ thật") vào `backend/uploads/documents/` bằng code, hoặc dùng `fileUrl` là URL `https://` công khai hợp lệ (ít ưu tiên). Ghi chú rõ đây là tài liệu demo.
- Ngựa của Customer B: 1 con (để thử phân quyền).
- (Tùy chọn) 1 đơn đang `in_transit` có tuyến + điểm dừng có tọa độ để demo live tracking ngay.

### 12.2 Kịch bản demo (mỗi kịch bản < 3 phút)

Viết **`docs/demo-scenarios.md`**: mỗi kịch bản gồm mục tiêu (góp ý G nào), tài khoản đăng nhập, **các bước bấm cụ thể** (trang nào, nút nào, nhập gì), kết quả mong đợi (ảnh chụp mô tả bằng chữ), điều kiện chuẩn bị (bật giả lập, chạy job...), cách khôi phục để chạy lại.

1. Nội địa HCM (Quận 1/Quận 7) → Đà Lạt, 3 ngựa: báo giá ra 3 phương án (1 xe 4 chỗ / 3 xe 1 chỗ / chia ngày); đón trong giờ cấm → dời 22h + phụ phí đêm. (G4, G7, G9, G11)
2. Quốc tế HCM → Singapore bằng máy bay, **khứ hồi**, gói **Toàn diện**: thấy bảng so sánh bảo hiểm bằng tiền; dùng lại hộ chiếu; nộp giấy chứng nhận sức khỏe; chặng giao dùng trạm đối tác Singapore; thanh toán, in hóa đơn PDF. (G3, G4, G4a, G4c, G5, G6, G7)
3. Đường thủy Rạch Giá → Phú Quốc (ferry). (G3)
4. Thanh toán xong nhưng không đáp ứng được → form hoàn tiền → Manager duyệt → Admin chuyển (thử Admin trùng người duyệt bị chặn). (G4b)
5. Live tracking giả lập: tài xế chạy giả lập, check-in tự động, nhập sinh hiệu vàng 2 lần → cảnh báo đỏ; khách thấy xe chạy và timeline dọc. (G8, G12)
6. No-show chặng về. (G5)
7. Claim bảo hiểm M3: khách gửi → Manager duyệt theo gợi ý → ≥ 20 triệu duyệt kép → Admin chuyển. (G6)
8. Gộp actor: đăng nhập tài khoản specialist/coordinator cũ vào thẳng `/manager`; menu 3 nhóm. Ngựa không còn giới tính/ngày sinh, giấy tờ nằm trên hồ sơ ngựa. Không còn ghép chuyến. (G1, G2, G10)

### 12.3 Test

**A. Rà test đơn vị** cho mọi `*-policy.ts`: `pricing-policy`, `insurance-policy`, `return-policy`, `allocation-policy`, `city-restriction-policy`, `journey-time-policy`, `geofence-policy`, `requirement-policy`, `document-validity.policy`, `capacity-policy`, `order-state-machine`, `refund-policy`, `vitals-policy`. Mỗi file phải có test cho các **biên** chính (theo tiêu chí ở prompt Step tương ứng). Thiếu thì bổ sung.

**B. Ma trận phân quyền** — file mới `backend/test/authorization-matrix.test.cjs` (đăng ký `npm test`), kiểm tra bằng `RolesGuard` + metadata `@Roles` (mẫu `merge-actors.test.cjs`) và bằng service với store giả cho kiểm tra theo chủ sở hữu:
- Customer A **không** xem/sửa được: đơn, ngựa, giấy tờ, báo giá, hóa đơn, claim, live tracking của Customer B (403).
- Driver **không** check-in / gửi ping / đánh no-show chuyến không được phân công (403).
- Customer/Driver không gọi được endpoint chỉ dành cho Manager/Admin (bảng giá, trạm, giờ cấm, duyệt giấy tờ, duyệt khả thi, duyệt claim).
- Chỉ Admin bật/tắt giả lập; chỉ Admin chuyển khoản; `transferred_by != approved_by`.
- Liệt kê toàn bộ controller và kiểm tra **không endpoint nào còn dùng role cũ** `TRANSPORT_SPECIALIST`/`FLEET_ROUTE_COORDINATOR`.

**C. Kiểm tra tĩnh endpoint**: test duyệt qua metadata các controller, đảm bảo mọi route (trừ public như health, đăng nhập, webhook SePay) có `JwtAuthGuard`.

**D. Test tích hợp** (`*.integration*.cjs`, `test/qa-spec/*`): nếu có MySQL local và người dùng cho phép, chạy và báo cáo kết quả. Test nào lỗi vì hành vi đã thay đổi có chủ đích (vd tạo đơn `shared_stall`, tạo đơn không có báo giá) → **cập nhật test** cho đúng hành vi mới và ghi lý do; lỗi thật → ghi vào báo cáo.

**E. Smoke test thủ công** theo `docs/demo-scenarios.md` (nếu chạy được app); ghi kết quả từng kịch bản: Đạt / Không đạt / Chưa chạy được.

### 12.4 Rà tài liệu (docs phải khớp code)

Đối chiếu và sửa:
- `docs/requirements.md`: phản ánh đủ G1–G12; xóa yêu cầu đã bỏ (ghép chuyến, giới tính/ngày sinh, nhập giá tay cho đơn mới, 3 actor nội bộ).
- `docs/actors-and-roles.md`: 4 actor, RACI cập nhật mọi nghiệp vụ mới (báo giá, duyệt khả thi, form hoàn tiền, claim, giả lập, trạm, giờ cấm).
- `docs/api-documentation.md`: mọi endpoint mới có trong code đều có trong docs (viết script nhỏ hoặc test liệt kê route từ metadata controller để so sánh; báo cáo endpoint thiếu docs).
- `docs/erd.md` + `database/schema.mysql.sql`: khớp tất cả migration 028 → mới nhất. Kiểm tra bằng cách: tạo DB trống từ `schema.mysql.sql`, và DB khác chạy schema gốc cũ + toàn bộ migration — so sánh danh sách bảng/cột (nếu có MySQL; nếu không, so sánh bằng đọc file và ghi rõ).
- `docs/flows/*`: banner "Cập nhật sau review" đã có từ Step 1; nội dung phải khớp luồng mới (đặc biệt flow 1, 2, 3, 4).
- `.env.example`: đủ mọi biến môi trường code đang đọc (`grep -r "process.env\." backend/src frontend/src`), có comment, không chứa secret thật.
- Swagger: mọi endpoint mới có `@ApiOperation` mô tả tiếng Việt; DTO có `@ApiProperty` + ví dụ.
- Xóa banner/ghi chú "sẽ làm ở Step X" đã lỗi thời.

### 12.5 Nội dung bảo vệ

Viết **`docs/bao-ve-do-an.md`** (dùng làm nguồn cho slide):
1. Bảng **"Góp ý hội đồng → Đã làm → Ở đâu (trang + API + bảng DB) → Demo kịch bản số"** cho G1–G12 (dùng bảng Phần A làm khung).
2. Kiến trúc tổng quan (sơ đồ mermaid: actor → frontend → backend modules → MySQL; dịch vụ ngoài: OpenRouteService, SePay, SMTP).
3. State machine đơn hàng mới (mermaid) và giải thích ngắn 2 luồng (trả trước mới / trả sau cũ).
4. Công thức giá + 1 ví dụ tính tay; bảng bảo hiểm M1–M4 + ví dụ "ngựa 2 tỷ".
5. Thuật toán phân bổ xe (5 bước) + ví dụ 3 ngựa.
6. Giờ cấm đô thị, geofence, giả lập — và **giới hạn/giả định** (dữ liệu demo, cần đối chiếu văn bản pháp lý, ORS có quota...).
7. Bảo mật và phân quyền: server-side, SoD tài chính, append-only, Customer isolation; số test và loại test.
8. Hạn chế đã biết và hướng phát triển.
9. Câu hỏi hội đồng có thể hỏi + câu trả lời ngắn (ít nhất 12 câu: vì sao trả trước, nếu ORS sập, nếu 2 khách đặt cùng xe, vì sao không ghép chuyến, đường thủy có an toàn không, bảo hiểm đền bao nhiêu, ai duyệt hoàn tiền, giả lập có lẫn dữ liệu thật không...).

Không tạo file `.pptx` (nếu người dùng muốn, họ sẽ yêu cầu riêng).

## 4. Tiêu chí hoàn thành

- [ ] Bảng kiểm kê Step 1–11 (trạng thái thực tế) có trong báo cáo.
- [ ] `npm run seed:demo` tạo được dữ liệu demo, chạy lại không nhân đôi, từ chối chạy ở production, không có mật khẩu hard-code, không có file giả rỗng.
- [ ] `docs/demo-scenarios.md` đủ 8 kịch bản, bấm theo được.
- [ ] Test đơn vị + ma trận phân quyền + kiểm tra guard đều pass trong `npm test`.
- [ ] Docs khớp code (danh sách endpoint thiếu docs = 0 hoặc được liệt kê lý do).
- [ ] `docs/bao-ve-do-an.md` hoàn chỉnh.
- [ ] Toàn bộ lệnh kiểm tra ở `_COMMON.md` mục 7 đạt; báo cáo theo mục 9, kèm **danh sách việc còn lại trước ngày bảo vệ** sắp theo mức ưu tiên.
- [ ] Cập nhật dòng trạng thái Step 12 trong file định hướng.

## 5. Bẫy thường gặp

- Seed dùng `INSERT` thẳng → nhân đôi khi chạy lại. Luôn có khóa tự nhiên + `ON DUPLICATE KEY UPDATE`/`WHERE NOT EXISTS`.
- Hash mật khẩu sai thuật toán → tài khoản demo không đăng nhập được.
- Ngày tháng trong seed cố định (vd "2026-12-10") sẽ thành quá khứ: tính tương đối theo `CURDATE()` / `NOW()` (vd hạn giấy tờ = `DATE_ADD(CURDATE(), INTERVAL 10 DAY)`).
- Đừng "sửa" test để pass khi hành vi thực sự sai; ghi lỗi vào báo cáo.
