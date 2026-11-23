# PROMPT STEP 9: Phân bổ nhiều xe, điều xe từ trạm gần nhất (cả nước ngoài), giờ cấm xe tải đô thị, ETA có nghỉ

## 0. Vai trò và mục tiêu

Bạn là kỹ sư full-stack trong repo EquiTransit. Nhiệm vụ: triển khai **Step 9** của `docs/dinh-huong-phat-trien-sau-review.md`.

Góp ý hội đồng:
- G7: *"Quản lý trạm xe, điều xe ở trạm gần khách nhất; cả khi giao ở nước ngoài."*
- G9: *"Xe thùng trong trung tâm HCM, HN: khung giờ nào được chạy."*
- G11: *"Mỗi xe, máy bay, tàu chở tối đa bao nhiêu ngựa; 3 ngựa mà xe chỉ chở 1 thì sao."*

Kết quả cuối:
- Báo giá trả **tối đa 3 phương án xe** (Rẻ nhất · Ít xe nhất · Đến sớm nhất) với giá từng phương án; thiếu xe thì có phương án **chia nhiều ngày** hoặc **ghép xe từ 2 trạm**; không có phương án thì gợi ý ngày gần nhất có đủ xe.
- Xe được **giữ chỗ** khi tạo đơn (chống đặt trùng).
- Chặng đón dùng **trạm `own` gần điểm đón nhất**; chặng giao ở nước ngoài dùng **trạm `partner` gần điểm giao nhất** với bảng giá đối tác.
- Điểm đón/giao trong vùng cấm (HN, HCM) rơi vào giờ cấm với xe tải nặng → **tự dời giờ** sang khung hợp lệ gần nhất, cộng phụ phí đêm; khách thấy khung giờ hợp lệ khi chọn giờ.
- ETA có chèn thời gian nghỉ theo tham số cấu hình (B4).

## 1. Bắt buộc đọc trước

1. `docs/antigravity-prompts/_COMMON.md`.
2. `AGENTS.md`.
3. File định hướng: **B3, B4, B5**, **C3** (ví dụ 1: 3 phương án A/B/C), **STEP 9**.
4. `docs/flows/flow-3-route-planning.md` (mục 0 của Step 3), `docs/flows/flow-1-request-approval.md` (báo giá Step 4).
5. Code:
   - `backend/src/modules/fleet/capacity-policy.ts`, `fleet.store.ts` (depot, vehicle_class, `findAllVehicles` với truy vấn xe bận), `fleet.service.ts`, `road-trips.store.ts` (`prepareLegs`: khóa xe `vehicle_id ASC` + `FOR UPDATE`, phát hiện trùng giờ).
   - `backend/src/modules/orders/pricing-policy.ts`, service báo giá, `shipment_quote`, `pricing_tariff` (có cột `region`) — Step 4.
   - `backend/src/modules/routes/distance.service.ts` (Step 4), `routes.service.ts` (`buildDetailedPlan`, `requiredStalls` cho chặng bay), `routes.store.ts`.
   - Luồng tạo đơn `prepaid` (Step 7) và trạng thái hủy/hết hạn/hoàn tiền (để nhả xe).
   - Frontend: `features/orders` (báo giá), `app/customer/requests/new/page.tsx`, `app/manager/dispatch/routes/page.tsx`, `app/manager/settings/*`.

## 2. Điều kiện tiên quyết

- Step 3 (trạm, loại xe, chuồng riêng 2 chỗ), Step 4 (báo giá, bảng giá, DistanceService), Step 7 (tạo đơn từ quote, trạng thái hủy/hoàn). Thiếu Step 3 hoặc 4 → dừng và báo. Thiếu Step 7 → phần giữ chỗ xe gắn vào luồng tạo đơn hiện có, ghi rõ.

## 3. Phạm vi

**Làm:** 9.1 thuật toán phân bổ + giữ chỗ xe; 9.2 trạm gần nhất + trạm đối tác + bảng giá đối tác; 9.3 giờ cấm đô thị + ngoại lệ ngày lễ + dời giờ + phụ phí đêm; ETA có nghỉ; UI.

**Không làm:** tối ưu tuyến nhiều điểm (VRP); giờ cấm theo từng tuyến đường cụ thể (chỉ dùng vùng tròn quanh trung tâm).

## 4. Dữ liệu (migration kế tiếp, dự kiến `036_allocation_city_restrictions.sql`)

### 4.1 Giữ chỗ xe

```sql
CREATE TABLE IF NOT EXISTS vehicle_reservation (
  reservation_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  vehicle_id INT NOT NULL,
  direction ENUM('outbound','return') NOT NULL DEFAULT 'outbound',
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  status ENUM('active','released','consumed') NOT NULL DEFAULT 'active',
  released_reason VARCHAR(50) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at DATETIME NULL,
  CONSTRAINT fk_vr_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  CONSTRAINT fk_vr_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicle(vehicle_id),
  INDEX idx_vr_vehicle_time (vehicle_id, status, start_at, end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- `shipment` thêm `allocation_option_code VARCHAR(30) NULL`, `allocation_snapshot JSON NULL`, `pickup_at DATETIME NULL` (giờ đón đã chốt sau khi dời giờ cấm), `night_surcharge_applied BOOLEAN NOT NULL DEFAULT FALSE`.
- `route_leg` thêm `jet_stall_count INT NULL` (chặng bay) và `allocation_override_reason VARCHAR(255) NULL`.

### 4.2 Giờ cấm đô thị

```sql
CREATE TABLE IF NOT EXISTS city_truck_restriction (
  restriction_id INT AUTO_INCREMENT PRIMARY KEY,
  city VARCHAR(100) NOT NULL,
  center_lat DECIMAL(10,6) NOT NULL,
  center_lng DECIMAL(10,6) NOT NULL,
  radius_km DECIMAL(6,2) NOT NULL,
  applies_to_heavy_truck BOOLEAN NOT NULL DEFAULT TRUE,
  banned_from TIME NOT NULL,             -- giờ địa phương Asia/Ho_Chi_Minh
  banned_to TIME NOT NULL,               -- có thể qua nửa đêm (banned_from > banned_to)
  days_of_week VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5,6,7',   -- 1 = Thứ 2 ... 7 = Chủ nhật (ISO)
  legal_reference VARCHAR(255) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  is_demo_data BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS city_restriction_exception (
  exception_id INT AUTO_INCREMENT PRIMARY KEY,
  city VARCHAR(100) NOT NULL,
  exception_date DATE NOT NULL,
  banned_from TIME NOT NULL,
  banned_to TIME NOT NULL,
  note VARCHAR(255) NULL,
  UNIQUE KEY uq_city_exception (city, exception_date, banned_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Seed (dữ liệu demo, `legal_reference` ghi rõ "cần đối chiếu văn bản gốc"):

| city | tâm | radius_km | banned | legal_reference |
|---|---|---|---|---|
| Hà Nội | 21.0285, 105.8542 (Hoàn Kiếm) | 10 | 06:00 → 21:00 | "QĐ 01/2026/QĐ-UBND Hà Nội (hiệu lực 15/01/2026) — dữ liệu demo, cần đối chiếu văn bản gốc" |
| Hồ Chí Minh | 10.7769, 106.7009 (Quận 1) | 12 | 06:00 → 22:00 | "Quy định cấm xe tải nặng nội đô TP.HCM 6h–22h — dữ liệu demo, cần đối chiếu Sở GTVT" |

Ngoại lệ mẫu: `Hồ Chí Minh, 2026-04-30, 04:00 → 11:30, "Lịch cấm dịp lễ 30/4 (demo)"`.

### 4.3 Cấu hình hệ thống (dùng chung, Step 10 dùng tiếp)

```sql
CREATE TABLE IF NOT EXISTS system_setting (
  setting_key VARCHAR(100) PRIMARY KEY,
  value_json JSON NOT NULL,
  updated_by INT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Seed `journey.rules`: `{ "maxDriveHoursBeforeRest": 8, "restMinutes": 60, "maxJourneyHours": 24, "mandatoryRestHours": 24, "nightWindow": { "from": "22:00", "to": "06:00" } }` (B4: EU 1/2005 làm tham chiếu). Nếu bảng đã tồn tại (Step khác đã tạo) thì chỉ seed bằng `INSERT IGNORE`.

### 4.4 Bảng giá đối tác

Seed `pricing_tariff` mode `road`, `region = 'PARTNER'`, version 1, active: giống params road VN nhưng `openingFeePerVehicle: 3000000`, các bậc km × 1,2 (54.000 / 42.000 / 33.600), `deadheadPerKm: 18000`, `notes: 'Bảng giá đối tác nước ngoài (demo)'`.

## 5. Hàm thuần

### 5.1 `backend/src/modules/fleet/allocation-policy.ts`

```ts
export interface AllocationVehicle { vehicleId: number; plate: string; classCode: string; capacity: number; priceCoefficient: number; isHeavyTruck: boolean }
export interface AllocationDepot { depotId: number; depotName: string; deadheadKm: number; vehicles: AllocationVehicle[] }   // chỉ xe rảnh trong khung giờ
export interface AllocationInput {
  requiredSlots: number;            // computeRequiredStallSlots (Step 3)
  horseCount: number;
  depots: AllocationDepot[];        // đã sắp gần → xa theo deadheadKm
  priceVehicleSet: (vehicles: Array<AllocationVehicle & { deadheadKm: number }>) => number;   // gọi pricing-policy (đường bộ) để ra tổng cước
  maxVehiclesPerOption?: number;    // mặc định 4
}
export interface AllocationOption {
  optionCode: 'cheapest' | 'fewest_vehicles' | 'earliest' | 'split_days' | 'two_depots';
  labelVi: string;
  vehicles: Array<AllocationVehicle & { depotId: number; depotName: string; deadheadKm: number; trips: number }>;
  totalFreight: number;
  maxDeadheadKm: number;
  extraDays: number;                // > 0 với split_days
}
export function generateAllocationOptions(input: AllocationInput): { options: AllocationOption[]; recommended: string | null; shortageSlots: number }
```

Thuật toán (ghi comment):
1. Với từng trạm (gần → xa): liệt kê **tổ hợp xe tối thiểu** của trạm đó có tổng `capacity ≥ requiredSlots` (tối thiểu = bỏ bất kỳ xe nào thì không đủ chỗ). Giới hạn `maxVehiclesPerOption`. `requiredSlots ≤ 12` nên duyệt tổ hợp được; nếu trạm có nhiều xe cùng loại, coi xe cùng loại là tương đương để tránh nổ tổ hợp.
2. Nếu không trạm nào đủ một mình: thử **ghép 2 trạm gần nhất** (`two_depots`).
3. Nếu vẫn thiếu: **chia nhiều ngày** (`split_days`) với xe lớn nhất của trạm gần nhất: số lượt = `ceil(requiredSlots / capacity)`, cước = (cước một lượt × số lượt) + chạy rỗng quay đầu giữa các lượt (`deadhead` 2 chiều × (số lượt − 1)), `extraDays = số lượt − 1`.
4. Định giá mỗi tổ hợp qua `priceVehicleSet`.
5. Chọn: `cheapest` (tổng cước nhỏ nhất), `fewest_vehicles` (ít xe nhất, hòa thì rẻ hơn), `earliest` (`maxDeadheadKm` nhỏ nhất → xe đến điểm đón sớm nhất, hòa thì rẻ hơn). Gộp phương án trùng nhau (cùng tập xe) và giữ **tối đa 3**; luôn kèm `split_days`/`two_depots` nếu đó là phương án duy nhất khả thi.
6. `recommended` = `cheapest` nếu có; không có phương án → `options: []`, `shortageSlots` > 0.

Kiểm chứng bằng ví dụ C3: trạm Thủ Đức có 1 xe `truck_1` và 1 xe `truck_4`, 3 ngựa thường, 300 km, deadhead 20 km → phương án `cheapest` = 1 xe truck_4 = **18.750.000**; nếu trạm có 3 xe truck_1 thì có phương án 3 xe truck_1 = **42.900.000**; nếu chỉ có 1 xe truck_1 → `split_days` 3 lượt (extraDays 2).

### 5.2 Hàng không và đường thủy (trong `allocation-policy.ts` hoặc `capacity-policy.ts`)

```ts
export function jetStallCount(horses: Array<{ quantity: number; requiresPrivateStall: boolean }>): number
// = số ngựa chuồng riêng (mỗi con 1 stall) + ceil(số ngựa thường / 3)
export function vesselPenCount(horses): number   // = tổng số ngựa
```

- `routes.service.ts`: chặng bay ghi `jet_stall_count = jetStallCount(...)`; giữ `stalls_booked` theo nghĩa cũ (số chỗ ngựa) để không vỡ dữ liệu.
- Báo giá air hiển thị "Cần N jet stall".

### 5.3 `backend/src/modules/fleet/city-restriction-policy.ts`

```ts
export function isInsideZone(point: GeoPoint, rule: { centerLat; centerLng; radiusKm }): boolean   // haversine ≤ radius
export function isBannedAt(localDateTime: { date: string; time: string; isoWeekday: number }, rules, exceptions): { banned: boolean; rule?: ...; until?: string }
export function nextAllowedTime(utc: Date, point: GeoPoint, isHeavy: boolean, rules, exceptions, tz = 'Asia/Ho_Chi_Minh'): { allowedAt: Date; shifted: boolean; reasonVi: string; isNight: boolean }
export function allowedWindowsForDate(date: string, point: GeoPoint, isHeavy: boolean, rules, exceptions): Array<{ from: string; to: string }>
```

- Khung cấm có thể qua nửa đêm (`banned_from > banned_to`).
- Xe không nặng (`isHeavy = false`) không bị cấm với quy tắc `applies_to_heavy_truck = true`.
- Quy đổi UTC ↔ `Asia/Ho_Chi_Minh` bằng `Intl.DateTimeFormat` (không cài thư viện ngày tháng).
- `isNight` = giờ được phép rơi vào `nightWindow` (22:00–06:00) → bật `nightPickup` cho `pricing-policy` (phụ phí đêm mỗi xe).

### 5.4 `backend/src/modules/fleet/journey-time-policy.ts`

```ts
export function estimateJourney(input: { driveHours: number; rules: JourneyRules }): { totalHours: number; restStops: number; mandatoryRests: number; breakdownVi: string[] }
```

- Mỗi `maxDriveHoursBeforeRest` giờ lái chèn `restMinutes`; tổng thời gian vượt `maxJourneyHours` thì chèn `mandatoryRestHours`. Trả số điểm nghỉ để UI và lập tuyến gợi ý điểm dừng (`master_stop` loại `rest` gần tuyến — gợi ý, không bắt buộc).

## 6. Tích hợp

### 6.1 Báo giá (`POST /quotes`, Step 4)

- Thêm input `pickupAt` (ngày + giờ mong muốn, local) thay vì chỉ ngày (giữ `departureDate` tương thích: thiếu giờ thì mặc định 08:00 local).
- Đường bộ (và chặng bộ đầu của air/sea): lấy xe **rảnh** trong khung `[pickupAt − 2h, pickupAt + thời gian chuyến ước tính + 2h]` theo từng trạm `own` đang hoạt động (xe `available`, không trùng `vehicle_reservation` active, không trùng `route_leg`/`shipment_vehicle` của đơn đang hoạt động — tái sử dụng truy vấn trùng giờ trong `road-trips.store.ts`/`fleet.store.ts` qua một store method mới `findAvailableVehiclesByDepot(window)`), tính `deadheadKm` bằng `DistanceService` (dùng ước lượng nếu nhiều trạm để tránh gọi ORS quá nhiều: chỉ gọi ORS cho 3 trạm gần nhất theo Haversine).
- Gọi `generateAllocationOptions` → `options[]` thay cho phương án `default` của Step 4 (giữ `optionCode` trong response). Mỗi option có breakdown cước riêng.
- Giờ cấm: với từng option, nếu có xe nặng và điểm đón/giao trong vùng cấm tại giờ dự kiến → dời giờ bằng `nextAllowedTime`, cộng phụ phí đêm, trả `pickupAt` đã dời + `warnings: ['PICKUP_SHIFTED_CITY_BAN']` + câu giải thích. Option chỉ dùng xe không nặng có thể **không phải dời** → đây là lợi thế hiển thị cho khách.
- Air/sea: chặng giao ở nước ngoài dùng **trạm `partner` gần điểm giao nhất** (`deadheadKm` từ trạm đối tác đến sân bay/cảng đến) và **tariff `region = 'PARTNER'`**; không có trạm đối tác trong 300 km → dùng tariff VN, `warnings: ['NO_PARTNER_DEPOT']`.
- Không có option nào → `200` với `options: []`, `shortage`: `{ slots, suggestedDates: [3 ngày gần nhất có đủ xe] }` (tìm bằng cách thử các ngày tiếp theo, tối đa 14 ngày).
- ETA: `estimateJourney` cho chặng bộ; trả `etaHours`, `restStops`.

### 6.2 Giữ chỗ xe khi tạo đơn

- Tạo đơn từ quote + `optionCode`: trong **transaction của tạo đơn**, khóa các `vehicle` của option theo `vehicle_id ASC` (`SELECT ... FOR UPDATE`), kiểm tra lại không trùng (reservation active + leg đang hoạt động), tạo `vehicle_reservation` (`active`). Xe đã bị người khác giữ → `409` "Xe trong phương án đã được đặt, vui lòng báo giá lại".
- Ghi `shipment.allocation_option_code`, `allocation_snapshot`, `pickup_at`, `night_surcharge_applied`.
- Nhả (`released`) khi đơn hết hạn thanh toán / hủy / `refund_requested` → `refunded` / `cancelled_operational`; chuyển `consumed` khi kế hoạch chi tiết lưu chặng dùng đúng xe đó. Tìm mọi chỗ chuyển sang các trạng thái này (ưu tiên trong `order-state-machine.ts` của Step 7) để gọi nhả xe.
- Truy vấn "xe bận" hiện có (`findAllVehicles` computed_status, `prepareLegs` conflicts) phải tính cả `vehicle_reservation` active của **đơn khác**.

### 6.3 Lập tuyến Manager

- Khi mở dựng kế hoạch chi tiết cho đơn có `allocation_snapshot`: điền sẵn chặng bộ với xe/trạm đã giữ.
- Manager đổi xe/trạm: bắt buộc nhập `allocation_override_reason` (lưu ở `route_leg`), nhả reservation xe cũ, tạo reservation xe mới (cùng cơ chế khóa). Ghi `trip_status_log` hoặc log tương đương.

## 7. API cấu hình

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/fleet/city-restrictions` | Manager, Admin | Danh sách quy tắc + ngoại lệ |
| POST/PATCH | `/fleet/city-restrictions[/:id]` | Manager, Admin | Tạo/sửa quy tắc (validate giờ `HH:mm`, bán kính 1–50 km, `legal_reference` bắt buộc) |
| POST/DELETE | `/fleet/city-restrictions/exceptions[/:id]` | Manager, Admin | Ngoại lệ ngày lễ |
| GET | `/fleet/city-restrictions/check?lat=&lng=&date=&heavy=true` | mọi user đã đăng nhập | Trả `allowedWindows` cho ngày đó (UI chọn giờ) |
| GET/PATCH | `/system-settings/journey-rules` | GET: đã đăng nhập; PATCH: Manager, Admin | Tham số nghỉ B4 |

## 8. Frontend

- `customer/requests/new`: chọn **ngày + giờ đón**. Khi điểm đón trong vùng cấm, hiện ngay "Xe tải nặng chỉ được vào nội đô [thành phố] trong các khung: 22:00–06:00" (từ API `check`) và gợi ý giờ hợp lệ.
- Thẻ báo giá hiển thị **các phương án** dạng thẻ chọn (radio): tên phương án ("Rẻ nhất", "Ít xe nhất", "Đến sớm nhất", "Chia 3 ngày", "Ghép xe 2 trạm"), danh sách xe (loại × số lượng, trạm, km chạy rỗng), giá, nhãn "Đề xuất" cho phương án khuyến nghị, cảnh báo dời giờ + phụ phí đêm, ETA và số điểm nghỉ. Đây là phần trả lời trực tiếp câu hỏi "3 ngựa mà xe chỉ chở 1 thì sao" → thêm 1 dòng giải thích ngắn phía trên các phương án.
- Không có phương án → khối "Chưa đủ xe ngày này" + nút chọn nhanh các ngày gợi ý.
- Gửi đơn kèm `optionCode`; nhận `409` → báo và tự báo giá lại.
- `manager/dispatch/routes`: hiển thị xe đã giữ chỗ, nút đổi xe bắt buộc lý do.
- `manager/settings/city-restrictions/page.tsx`: bảng quy tắc + ngoại lệ, bản đồ vòng tròn vùng cấm (dùng Leaflet như `DepotMap.tsx`), cảnh báo đỏ cố định "Dữ liệu demo — cần đối chiếu văn bản gốc của UBND/Sở GTVT trước khi dùng thật".
- `manager/settings` (hoặc trang con): form tham số nghỉ (B4).
- Menu + CommandPalette + i18n en/vi.

## 9. Test bắt buộc (`backend/test/allocation-city-ban.test.cjs`, đăng ký `npm test`)

1. Ví dụ C3: đúng 3 kịch bản ở 5.1 (18.750.000; 42.900.000; split_days 3 lượt).
2. Ngựa chuồng riêng: 2 ngựa thường + 1 chuồng riêng = 4 chỗ → xe 4 chỗ; xe 3 chỗ không được chọn.
3. Không trạm nào đủ → `two_depots`; vẫn không đủ → `split_days`; không có xe → `options: []`.
4. Gộp phương án trùng; tối đa 3 phương án.
5. `jetStallCount`: 3 thường → 1; 4 thường → 2; 2 thường + 1 chuồng riêng → 2; 1 chuồng riêng → 1.
6. `isBannedAt` / `nextAllowedTime`: đón Quận 1 lúc 09:00 → dời 22:00 cùng ngày, `isNight = true`; 23:00 → không dời; ngoài bán kính → không dời; xe không nặng → không dời; khung qua nửa đêm; ngày lễ 30/4 04:00–11:30 áp dụng ngoại lệ.
7. Quy đổi múi giờ: 02:00 UTC = 09:00 Asia/Ho_Chi_Minh.
8. `estimateJourney`: 10 giờ lái → 1 điểm nghỉ; 30 giờ → có nghỉ bắt buộc 24 giờ.
9. Giữ chỗ: tạo 2 đơn cùng xe cùng khung giờ (store/db giả mô phỏng khóa) → đơn thứ 2 `409`; đơn hết hạn → reservation `released`.
10. Chặng giao nước ngoài dùng trạm partner + tariff `PARTNER`.

## 10. Tài liệu

- `docs/flows/flow-3-route-planning.md`: phân bổ xe, giữ chỗ, trạm own/partner, đổi xe có lý do.
- `docs/flows/flow-1-request-approval.md`: báo giá nhiều phương án, giờ cấm + phụ phí đêm.
- `docs/api-documentation.md`, `docs/erd.md`, `docs/requirements.md`, file định hướng (trạng thái Step 9).

## 11. Tiêu chí hoàn thành

- [ ] Đơn 3 ngựa ra tối đa 3 phương án đúng giá như ví dụ C3.
- [ ] Đón ở Quận 1 lúc 9h sáng với xe tải nặng được gợi ý dời sang 22h, có phụ phí đêm.
- [ ] Giao ở Singapore dùng trạm đối tác Singapore và bảng giá đối tác.
- [ ] Hai khách không thể giữ cùng một xe cùng khung giờ.
- [ ] Manager đổi xe phải ghi lý do.
- [ ] Mọi lệnh kiểm tra đạt; báo cáo theo mẫu.

## 12. Bẫy thường gặp

- Nổ tổ hợp khi trạm có nhiều xe: gom theo loại xe.
- Gọi ORS cho mọi trạm × mọi lần gõ phím → hết quota. Chỉ gọi cho vài trạm gần nhất, có cache (Step 4).
- Quên nhả reservation khi đơn hết hạn → xe bị khóa vĩnh viễn.
- Khung giờ qua nửa đêm và múi giờ là nguồn lỗi chính: viết test kỹ.
