# BỐI CẢNH CHUNG CHO MỌI PROMPT (Step 4 → Step 12)

> File này là phần bắt buộc đọc trước của mọi `PROMPT.md` trong thư mục `docs/antigravity-prompts/`.
> Nếu thông tin ở đây khác với code thực tế, **tin code thực tế** và ghi lại điểm khác biệt trong báo cáo cuối.

---

## 1. Dự án là gì

EquiTransit: hệ thống quản lý vận chuyển ngựa đua xuyên quốc gia (đồ án SWP391). Có các luồng: tạo đơn và báo giá (Flow 1), hồ sơ pháp lý/kiểm dịch (Flow 2), lập tuyến và điều phối xe (Flow 3), theo dõi chuyến (Flow 4), sự cố (Flow 5, optional), bàn giao (Flow 6, optional).

Sau buổi review với hội đồng (11/2026), nhóm đang làm lại hệ thống theo file **`docs/dinh-huong-phat-trien-sau-review.md`** (gọi tắt là "file định hướng"). File đó chia thành Step 0 → Step 12. Step 1, 2, 3 **đã xong**. Mỗi prompt trong thư mục này tương ứng với đúng một Step từ 4 đến 12.

## 2. Công nghệ, cổng, cấu trúc

| Phần | Công nghệ | Ghi chú |
|---|---|---|
| Backend | NestJS 10, TypeScript, REST, Swagger | Cổng `5000`, prefix `/api`. Truy vấn MySQL bằng `mysql2/promise` **raw SQL** (không ORM) |
| Frontend | Next.js 14 App Router, React 18, TypeScript, Tailwind, SWR, react-hook-form, zod, lucide-react, react-hot-toast, Leaflet | Cổng `3001`. Gọi backend qua `NEXT_PUBLIC_API_BASE_URL` |
| Database | MySQL 8, InnoDB, utf8mb4 | Schema: `database/schema.mysql.sql`. Migration: `database/migrations/NNN_*.sql`, chạy bằng `cd backend && npm run migrate:all` (script `database/migrate.cjs`, có bảng `schema_migrations`, `multipleStatements: true`) |
| Môi trường | Windows 11, Git Bash + PowerShell, Node 22 (có sẵn `fetch` toàn cục) | `.env.example` nằm ở **thư mục gốc repo** |

Cấu trúc chính:

```
backend/src/modules/<domain>/   controller · service · store · types · dto/ · *-policy.ts
backend/src/common/             guards, decorators, types, utils, shipment-lifecycle.ts
backend/test/*.test.cjs         test node:test, import từ ../dist (phải build trước)
frontend/src/app/<actor>/       route theo actor: (auth), customer, manager, driver
frontend/src/components/        UI dùng chung (ui/Modal, ui/Button, maps/...)
frontend/src/features/<domain>/ logic + UI dùng chung theo domain
frontend/src/lib/               api-client.ts, i18n/translations.ts, các store
database/                       schema.mysql.sql, seed.sql, migrations/
docs/                           requirements, actors-and-roles, api-documentation, erd, flows/
```

Module backend hiện có: `auth`, `documents`, `fleet`, `health`, `horses`, `incidents`, `notifications`, `orders`, `reports`, `routes`, `tracking`. **Không có module `compliance` riêng**: nghiệp vụ hồ sơ/kiểm dịch nằm trong `documents`.

## 3. Actor sau Step 1 (đã gộp)

Chỉ còn 4 actor: **Customer**, **Logistics Manager** (hiển thị "Quản lý vận hành", mã `LOGISTICS_MANAGER`), **Vehicle Driver / Escort** (`DRIVER_ESCORT`), **Admin** (`ADMIN`).

- `TRANSPORT_SPECIALIST` và `FLEET_ROUTE_COORDINATOR` là role **cũ**, được chuẩn hóa thành `LOGISTICS_MANAGER` ở `normalizeUserRole` (`backend/src/modules/auth/auth.types.ts`). **Không dùng 2 role cũ trong code mới**, không viết `@Roles(UserRole.TRANSPORT_SPECIALIST...)`.
- Portal frontend chỉ còn `/customer`, `/manager`, `/driver`. Trang Manager: `/manager/compliance/*` (hồ sơ), `/manager/dispatch/*` (điều phối), `/manager/fleet/vehicles`, `/manager/fleet/depots`, `/manager/monitoring/*`, `/manager/requests`, `/manager/settings`... Menu nằm ở `frontend/src/app/manager/layout.tsx` (mảng `navGroups`), lệnh nhanh ở `frontend/src/components/ui/CommandPalette.tsx`.
- **Segregation of Duties tài chính vẫn giữ**: Manager duyệt hoàn tiền, Admin chuyển khoản, ràng buộc `transferred_by != approved_by` (trùng người trả `403`), khoản `>= 20.000.000 VND` cần duyệt kép. Xem `backend/src/modules/orders/refund-policy.ts` (`DUAL_APPROVAL_THRESHOLD_VND`) và `orders-ops.service.ts` (`approveRefund`, `transferRefund`).

## 4. Những gì Step 1–3 đã làm (để không làm lại, không phá)

| Step | Đã có | Ở đâu |
|---|---|---|
| 1 | Gộp actor, chuẩn hóa role cũ, chuyển hướng URL cũ `/specialist/*`, `/coordinator/*` | migration `028_merge_internal_roles.sql`, `auth.types.ts`, `jwt-auth.guard.ts`, `frontend/src/middleware.ts`, `frontend/src/lib/auth-redirect.ts` |
| 2 | Ngựa **bỏ giới tính và ngày sinh** (cột DB vẫn còn nhưng API không đọc/ghi). Thêm `horse.requires_private_stall`, `horse.temperament`. Danh mục `document_type`. Giấy tờ gắn với ngựa (`transport_document.regulation_id` cho phép NULL, có `document_type_code`). API kho giấy tờ `GET/POST /horses/:horseId/documents`, `.../:docId/history`, `.../:docId/file`, `GET /documents/types`. Trạng thái hạn tính khi đọc (`valid`, `expiring_soon` < 30 ngày, `expired`, `no_expiry`) | migration `029_horse_profile_after_review.sql`, `backend/src/modules/documents/horse-documents.controller.ts`, `document-validity.policy.ts`, `frontend/src/features/documents/components/HorseDocumentVault.tsx` |
| 3 | Bảng `depot` (trạm own/partner, có lat/lng), `vehicle_class` (`truck_1/2/4/6`, `jet_stall`, `ferry_slot`, `vessel_pen`; có `horse_capacity`, `price_coefficient`, `is_heavy_truck`). `vehicle.depot_id`, `vehicle.vehicle_class_code`. **Ngựa cần chuồng riêng chiếm 2 chỗ** khi kiểm tra sức chứa đường bộ. **Bỏ gom chuyến**: đơn mới luôn `dedicated_charter`, gửi `shared_stall` trả 400, `POST /fleet/road-trips` trả 410. Bảng `road_trip` vẫn dùng nội bộ (mỗi chặng đường bộ tự tạo một chuyến riêng) | migration `030_depots_vehicle_classes.sql`, `backend/src/modules/fleet/capacity-policy.ts` (`computeRequiredStallSlots`, `loadRequiredStallSlots`, `assertRoadCapacity`), `fleet.service.ts`, `orders/booking-policy.ts` (`assertNewBookingType`), `frontend/src/app/manager/fleet/depots/page.tsx`, `frontend/src/components/maps/DepotMap.tsx`, `frontend/src/features/fleet/fleet-catalog.ts` |

Một số sự thật quan trọng về hiện trạng (đã kiểm tra trong code):

- `shipment.status` hiện là `ENUM('requested','change_requested','approved','rejected','planning','confirmed','ready_to_depart','in_transit','completed','cancelled','cancelled_operational')`.
- `shipment.transport_mode` là `ENUM('road','air') NULL`. `regulation.transport_mode` là `ENUM('road','air','both')`.
- Luồng giá hiện tại: Customer tạo đơn (`POST /orders`) → Manager **nhập cước bằng tay** khi duyệt (`PATCH /orders/:id/approve`, xem `orders/booking-policy.ts` → `calculateBookingQuote`) → lập tuyến → xác nhận kế hoạch → **sau đó** mới phát hành hóa đơn và mở thanh toán SePay (`orders/payment-gate.ts`, `CONFIRMED_PLAN_STATUSES`). Step 4 và Step 7 sẽ thay đổi luồng này.
- `shipment_invoice.route_id` đang `NOT NULL` (hóa đơn gắn với tuyến). Bảng có `invoice_type ENUM('primary','supplemental')`, `snapshot JSON`, cột sinh `active_primary_route_id`.
- `shipment_refund_record` có đầy đủ cột duyệt/duyệt kép/chuyển khoản/biên nhận.
- Bảo hiểm: `orders/insurance-policy.ts` (gói `basic`/`standard`/`premium`, version `equine-v1`), snapshot từng ngựa ở `shipment_horse` (migration 017).
- Theo dõi chuyến: `tracking` module. Bảng `route_stop_update` (append-only, có `is_backdated`), `trip_status_log`, `horse_health_log` (có `temperature_c`, `heart_rate_bpm`, `alert_tier`). Phân loại sinh hiệu ở `tracking/vitals-policy.ts`.
- `route_leg` có `leg_type ENUM('road','flight')`, `vehicle_id`, `stalls_booked`, `road_trip_id`. `route_stop` có `stop_type ENUM('rest','quarantine','refuel','border_check','transfer_hub','other')`, **chưa có tọa độ**. `master_stop` và `airport` có `lat`, `lng`.
- Tác vụ định kỳ: backend **không có** `@nestjs/schedule`. Mẫu có sẵn là `setInterval` trong `orders/sla-monitor.service.ts`. Dùng lại mẫu này, không cài thêm thư viện.
- Gửi email: `auth/mail.service.ts` chỉ có hàm gửi OTP. Thông báo trong app dùng `notifications` module (`NotificationsService.createNotification`, `notifyRole`).
- Frontend `frontend/src/lib/geo-corridors.ts` (~2.600 dòng) đang tính tuyến/khoảng cách **ở trình duyệt** (Haversine, sân bay gần nhất, geocode Photon). Giá phải chuyển sang server (Step 4).

## 5. Quy tắc bắt buộc (rút từ `AGENTS.md`, phải tuân thủ)

1. **Đọc trước khi code**: `AGENTS.md`, `docs/requirements.md`, `docs/actors-and-roles.md`, file flow liên quan trong `docs/flows/`, mục Step tương ứng trong file định hướng.
2. **Chỉ sửa module sở hữu nghiệp vụ.** Sửa module khác chỉ khi bắt buộc (shared type, API contract, migration). Mọi chỗ sửa ngoài module chính phải được **nêu lý do** trong báo cáo cuối.
3. **Không đổi tên module, cấu trúc thư mục, public API hiện có** nếu prompt không yêu cầu. Không refactor ngoài phạm vi.
4. **Phân quyền kiểm tra ở server.** Customer chỉ truy cập dữ liệu của chính mình (khác chủ trả `403`). Driver/Escort chỉ thao tác chuyến được phân công. Route frontend không phải ranh giới bảo mật.
5. **Lịch sử là append-only**: tracking event, audit, lịch sử giấy tờ, lịch sử trạng thái. Không sửa đè bản ghi cũ.
6. **Flow 5 và 6 là optional**, không được chặn Flow 1–4.
7. **Không hard-code secret/API key/mật khẩu.** Thêm biến môi trường thì cập nhật **`.env.example` ở thư mục gốc**.
8. **Tài liệu**: đổi business rule → cập nhật `docs/flows/*`; đổi quyền → `docs/actors-and-roles.md`; đổi API → `docs/api-documentation.md`; đổi entity → `docs/erd.md` + migration + `database/schema.mysql.sql`.
9. **Git**: **KHÔNG commit, KHÔNG push** trừ khi người dùng yêu cầu rõ. Không dùng `git reset --hard`, `git checkout --`, `git clean`. Không đụng file người dùng đang sửa dở không liên quan (hiện có `frontend/package.json`, `frontend/package-lock.json`, `filethongtin.md` chưa commit: **đừng stage, đừng sửa** trừ khi prompt nói rõ).
10. **Không cài thêm npm package** trừ khi prompt cho phép rõ ràng. Ưu tiên dùng cái đã có.
11. Không dùng file rỗng giả làm asset hợp lệ (ảnh, PDF giả).

## 6. Quy ước code (làm theo đúng mẫu đang có)

### 6.1 Backend

- **Module pattern**: `xxx.controller.ts` (route + `@Roles` + Swagger `@ApiOperation`) → `xxx.service.ts` (nghiệp vụ, ném `BadRequestException`/`ForbiddenException`/`NotFoundException`/`ConflictException`/`GoneException`...) → `xxx.store.ts` (SQL). Store nhận pool qua `constructor(@Optional() @Inject(MYSQL_POOL) private readonly injectedPool?: Pool)` và tự tạo pool trong `onModuleInit` nếu không có. Xem `fleet/fleet.store.ts` làm mẫu.
- **Guard**: controller dùng `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)`; lấy user bằng `@CurrentUser() user: AuthenticatedUser` (`user.id` là string, dùng `Number(user.id)`).
- **DTO**: `class-validator` + `@ApiProperty`. `ValidationPipe({ whitelist: true, transform: true })` toàn cục, nên field không khai báo trong DTO **bị loại bỏ im lặng**. Với multipart form, chuyển chuỗi rỗng thành `undefined` bằng `@Transform` (mẫu: `documents/dto/upload-horse-document.dto.ts`).
- **Thứ tự route**: route tĩnh (`@Get('types')`) phải khai báo **trước** route động (`@Get(':id')` có `ParseIntPipe`) trong cùng controller.
- **Nghiệp vụ tính toán đặt trong hàm thuần** `*-policy.ts` (không truy cập DB), có unit test. Mẫu: `orders/insurance-policy.ts`, `orders/refund-policy.ts`, `fleet/capacity-policy.ts`, `documents/document-validity.policy.ts`, `tracking/vitals-policy.ts`.
- **Tiền**: số nguyên VND (`BIGINT` trong DB, `number` an toàn trong TS; dùng `BigInt` nếu nhân/chia có nguy cơ tràn, như `insurance-policy.ts`). Không dùng số thực cho tiền lưu trữ.
- **Giờ**: lưu `DATETIME` theo UTC như code hiện có; hiển thị cho người Việt theo `Asia/Ho_Chi_Minh` (UTC+7). Mọi quy tắc theo giờ địa phương (giờ cấm xe, ngày làm việc) phải quy đổi rõ ràng.
- **Transaction**: `const db = await this.pool.getConnection(); await db.beginTransaction(); ... commit/rollback; finally db.release()`. Khóa xe theo `vehicle_id ASC` + `FOR UPDATE` (mẫu `fleet/road-trips.store.ts` → `prepareLegs`).
- **Gọi API ngoài**: dùng `fetch` toàn cục của Node 22 + `AbortController` để timeout. Không cài axios.

### 6.2 Migration (rất quan trọng)

- Số migration: lấy **số lớn nhất hiện có trong `database/migrations/` + 1** (sau Step 3 là `030`, nên Step 4 dự kiến `031`). Kiểm tra lại trước khi tạo, vì Step trước có thể đã thêm.
- **Idempotent**: chạy lại không lỗi, không đổi kết quả. Mẫu thêm cột:

```sql
SET @m031_x = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment' AND COLUMN_NAME = 'trip_type') = 0,
  'ALTER TABLE shipment ADD COLUMN trip_type ENUM(''one_way'',''round_trip'') NOT NULL DEFAULT ''one_way''',
  'SELECT 1'
);
PREPARE m031_x_stmt FROM @m031_x;
EXECUTE m031_x_stmt;
DEALLOCATE PREPARE m031_x_stmt;
```

- Thêm khóa ngoại: kiểm tra `information_schema.TABLE_CONSTRAINTS` theo `CONSTRAINT_NAME` rồi mới `ALTER TABLE ... ADD CONSTRAINT`.
- Bảng mới: `CREATE TABLE IF NOT EXISTS ... ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`. Seed: `INSERT ... ON DUPLICATE KEY UPDATE` hoặc `INSERT IGNORE` theo khóa duy nhất.
- Mở rộng ENUM: `ALTER TABLE t MODIFY COLUMN c ENUM(<toàn bộ giá trị cũ>, <giá trị mới>) ...` (giữ nguyên NULL/DEFAULT cũ). MODIFY chạy lại vẫn an toàn.
- **Không DROP cột/bảng có dữ liệu.** Không đổi tên giá trị ENUM cũ.
- Đồng thời cập nhật `database/schema.mysql.sql` (schema tạo mới từ đầu phải khớp kết quả sau migration) và `docs/erd.md`.
- Ghi chú đầu file migration: Step nào, làm gì, "Idempotent".

### 6.3 Test backend

- Test viết bằng `node:test` + `node:assert/strict`, file `.cjs` trong `backend/test/`, `require('../dist/...')`. **Phải `npm run build` trước khi chạy** (script `npm test` đã gồm build).
- Thêm test mới vào script `"test"` trong `backend/package.json` (nối vào danh sách file). Mẫu: `backend/test/depots-capacity.test.cjs`, `horse-documents.test.cjs`, `merge-actors.test.cjs`.
- Test service bằng **store giả** (object chỉ có các method cần). Khởi tạo đúng thứ tự tham số constructor của service (đọc constructor trước). Khi service mới gọi method store mà test cũ chưa giả lập, dùng mẫu phòng thủ `typeof this.store.fn === 'function' ? await ... : fallback` **hoặc** cập nhật fake trong test cũ. Không xóa test cũ; chỉ sửa khi hành vi thay đổi có chủ đích và ghi lý do.
- Test tích hợp cần MySQL (`*.integration*.cjs`, `test/qa-spec/*`) **không nằm trong `npm test`**. Không bắt buộc chạy, nhưng nếu thay đổi làm chúng lỗi theo dự kiến thì ghi vào báo cáo.
- `npm test` chạy vài phút; có thể chạy nền.

### 6.4 Frontend

- Trang là client component: dòng đầu `'use client';`.
- Gọi API: `import { apiClient } from '@/lib/api-client'` → `apiClient<T>('/path', { method, body: JSON.stringify(...) })` (tự gắn token, tự xử lý 401; `FormData` thì không đặt Content-Type). Mở file có xác thực: `openAuthenticatedDocument`.
- i18n: `const { t, language } = useLanguage()` từ `@/lib/i18n/LanguageContext`; `t('key', 'fallback')`. Thêm key mới vào **cả hai** khối `en: {` và `vi: {` trong `frontend/src/lib/i18n/translations.ts` (file rất lớn; chèn gần key cùng nhóm; không tạo key trùng). Có thể dùng `language === 'en' ? ... : ...` cho chuỗi dài như các trang hiện có.
- UI dùng chung: `@/components/ui/Modal` (props `isOpen, onClose, title, subtitle, maxWidth, closeDisabled`), `@/components/ui/Button` (`variant="primary|outline|danger"`), `toast` từ `react-hot-toast`. Màu chủ đạo: `#181A17` (đen), `#A67C2E`/`#C4B38E` (vàng đồng), `#FAF8F4` (nền nhạt), viền `#D8CEBE`/`#E5DDD0`; token Tailwind `text-text-primary`, `bg-surface`, `border-border`, `text-danger`, `text-warning`.
- Bản đồ: Leaflet import động trong `useEffect` (`(await import('leaflet')).default`), component bọc bằng `next/dynamic` với `ssr: false`. Tile Esri: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}`. Mẫu: `frontend/src/components/maps/DepotMap.tsx`. CSS Leaflet đã import trong `globals.css`.
- Logic dùng chung đặt ở `frontend/src/features/<domain>/`, **không** đặt trong một route actor.
- Responsive: dùng được trên điện thoại (bảng có `overflow-x-auto`), có trạng thái loading / lỗi + nút thử lại / rỗng như các trang hiện có.

### 6.5 Dòng kết thúc tệp (CRLF)

Nhiều file trong repo dùng xuống dòng **CRLF**. Khi sửa, giữ nguyên kiểu xuống dòng của file. Nếu dùng script thay chuỗi, chuẩn hóa về `\n` để so khớp rồi trả lại `\r\n` khi ghi. Một số dòng cũ có khoảng trắng cuối dòng: so khớp cẩn thận.

## 7. Lệnh kiểm tra (chạy sau mỗi sub-step quan trọng và trước khi báo xong)

```bash
# Backend
cd backend
npx tsc --noEmit -p tsconfig.json
npm test                      # build + toàn bộ test đơn vị (vài phút)

# Frontend
cd frontend
npx tsc --noEmit
npx eslint src                # chấp nhận warning có sẵn, KHÔNG được thêm error
npm run build                 # build production phải thành công

# Database (nếu có MySQL local và người dùng cho phép)
cd backend && npm run migrate:all
```

Nếu không chạy được lệnh nào (thiếu MySQL, thiếu dependency...), **ghi rõ trong báo cáo**, không được nói là đã kiểm tra.

## 8. Điều kiện dừng và hỏi lại

Dừng và báo cáo (không tự đoán) khi:

- Step phụ thuộc chưa được làm (mỗi prompt có mục "Điều kiện tiên quyết"; kiểm tra bằng cách tìm file/bảng/endpoint được nêu).
- Yêu cầu mâu thuẫn với code hiện tại theo cách có thể làm hỏng dữ liệu hoặc phân quyền.
- Cần cài thư viện mới hoặc cần secret thật.
- Thay đổi buộc phải sửa lan sang > 3 module ngoài dự kiến của prompt.

## 9. Mẫu báo cáo cuối (bắt buộc)

Viết bằng tiếng Việt, ngắn gọn, theo thứ tự:

1. **Kết quả kiểm tra**: lệnh nào đã chạy, kết quả (số test pass/fail, tsc, eslint, build). Lệnh nào chưa chạy được và vì sao.
2. **Đã làm gì**: theo từng sub-step của prompt, kèm đường dẫn file chính.
3. **Khác với prompt/kế hoạch**: điểm nào làm khác và lý do.
4. **Sửa ngoài module chính**: file nào, lý do.
5. **Migration**: tên file, nội dung chính, đã chạy trên DB chưa.
6. **Rủi ro / việc còn lại / test tích hợp có thể lỗi.**
7. **Người dùng cần làm gì tiếp**: chạy migration, kịch bản thử tay từng bước, đề xuất chia commit theo dạng `<scope>: <mô tả ngắn>` (không tự commit).
8. Cập nhật dòng **"> Trạng thái: đã triển khai (ngày), chưa commit..."** ngay dưới tiêu đề Step tương ứng trong `docs/dinh-huong-phat-trien-sau-review.md` (giống Step 1–3 đã làm).
