# PROMPT STEP 4: Khoảng cách, bảng giá cấu hình, thêm đường thủy, API báo giá

## 0. Vai trò và mục tiêu

Bạn là kỹ sư full-stack làm việc trong repo EquiTransit (NestJS + Next.js + MySQL). Nhiệm vụ: triển khai **Step 4** trong `docs/dinh-huong-phat-trien-sau-review.md`.

Góp ý hội đồng cần đáp ứng (G3, G4):
- "Thêm đường thủy; nghiên cứu lại đường hàng không."
- "Nhập địa chỉ đi, đến → tính khoảng cách → tính tiền theo khung giá bộ, không, thủy → báo giá."

Kết quả cuối: khách nhập điểm đón, điểm giao, chọn phương thức (bộ / không / thủy), chọn ngựa → **server** tính khoảng cách và giá theo **bảng giá cấu hình có phiên bản**, trả báo giá có breakdown từng dòng và hạn 30 phút. Đơn có thể tạo từ báo giá còn hạn và **khóa giá** theo báo giá đó. Manager sửa bảng giá trên giao diện; sửa bảng giá **không** làm đổi giá của báo giá cũ.

## 1. Bắt buộc đọc trước khi code

1. `docs/antigravity-prompts/_COMMON.md` (toàn bộ).
2. `AGENTS.md`.
3. `docs/dinh-huong-phat-trien-sau-review.md`: mục **B1, B2, B6, C3** (công thức giá + ví dụ), **STEP 4**.
4. `docs/flows/flow-1-request-approval.md`, `docs/flows/flow-3-route-planning.md`.
5. Code:
   - `backend/src/modules/orders/` toàn bộ: `orders.controller.ts`, `orders.service.ts`, `orders.store.ts` (đặc biệt `createShipment`, phần insert `shipment_horse`), `booking-policy.ts`, `insurance-policy.ts`, `dto/create-order.dto.ts`, `dto/approve-order.dto.ts`, `orders.module.ts`.
   - `backend/src/modules/routes/` (`routes.service.ts`, `routes.store.ts`, `routes.module.ts`, `routes.types.ts`).
   - `backend/src/modules/fleet/capacity-policy.ts`, `fleet.store.ts` (bảng `depot`, `vehicle_class`).
   - `frontend/src/lib/geo-corridors.ts` (các hàm `calculateHaversine`, `getNearestAirportForCoords`, `VIETNAM_AIRPORTS`, `INTERNATIONAL_EQUINE_AIRPORTS`, `estimateLegDistanceAndDuration`, `buildEquineRoute`, `geocodeAddress`).
   - `frontend/src/app/customer/requests/new/page.tsx` (form tạo đơn, đang dùng `RoutePlanningMap`).
   - `frontend/src/components/maps/RoutePlanningMap.tsx`.
   - `frontend/src/app/manager/settings/page.tsx`, `frontend/src/app/manager/layout.tsx`.
   - Bảng `airport`, `master_stop`, `depot`, `vehicle_class`, `shipment`, `shipment_horse` trong `database/schema.mysql.sql`.

## 2. Điều kiện tiên quyết (kiểm tra trước, thiếu thì dừng và báo)

- Có migration `030_depots_vehicle_classes.sql`, bảng `depot` và `vehicle_class` trong schema.
- Có `computeRequiredStallSlots` trong `backend/src/modules/fleet/capacity-policy.ts`.
- `horse.requires_private_stall` tồn tại (migration 029).

## 3. Phạm vi

**Làm:**
- 4.1 Thêm mode `sea` (2 dạng `ferry`, `vessel`), bảng cảng và tuyến biển, seed demo.
- 4.2 `DistanceService` ở backend (OpenRouteService + cache 24 giờ + dự phòng Haversine).
- 4.3 Bảng giá `pricing_tariff` có version, hàm thuần `pricing-policy.ts`, trang Manager sửa bảng giá.
- 4.4 API báo giá `POST /quotes`, bảng `shipment_quote`, tạo đơn từ `quoteId` (khóa giá).
- 4.5 Unit test.
- Frontend: form tạo đơn gọi báo giá từ server và hiện breakdown; thêm lựa chọn đường thủy.

**Không làm trong Step 4** (để Step sau):
- Khứ hồi (Step 5): chỉ chừa chỗ trong input (`tripType` mặc định `one_way`, chưa xử lý `round_trip`; nếu client gửi `round_trip` thì trả `400` "Khứ hồi sẽ hỗ trợ ở bước sau").
- Bảo hiểm mới (Step 6): dùng **nguyên** `calculateInsurance` hiện có.
- Thanh toán ngay, state machine mới, bỏ hẳn nhập giá tay (Step 7). Ở Step 4, đơn tạo từ báo giá vẫn ở trạng thái `requested` như cũ, nhưng **giá đã khóa**.
- Phân bổ nhiều xe, trạm gần nhất cho chặng giao nước ngoài, giờ cấm đô thị (Step 9). Ở Step 4 chỉ tạo **một phương án xe mặc định** (mục 6.4).

## 4. Thiết kế dữ liệu (migration `031_pricing_distance_sea.sql`; kiểm tra số kế tiếp)

### 4.1 Mode đường thủy

- `shipment.transport_mode`: mở rộng thành `ENUM('road','air','sea') NULL DEFAULT NULL` (giữ NULL/DEFAULT hiện có; đọc schema để chép đúng).
- Thêm `shipment.sea_mode ENUM('ferry','vessel') NULL` (chỉ có giá trị khi `transport_mode = 'sea'`).
- `regulation.transport_mode`: mở rộng thành `ENUM('road','air','sea','both')`. **Không đổi ý nghĩa** của `'both'` (đang hiểu là áp dụng mọi mode). Kiểm tra code `documents.service.ts` đang lọc `transportMode` thế nào; nếu có so sánh `=== 'both'` thì vẫn đúng. Nếu code giả định chỉ có road/air (ví dụ type `RegulationTransportMode = 'road' | 'air' | 'both'` trong `documents.types.ts`), mở rộng type cho đủ và để `'both'` khớp cả `sea`.

### 4.2 Cảng và tuyến biển

```sql
CREATE TABLE IF NOT EXISTS seaport (
  port_id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  country VARCHAR(100) NOT NULL,
  city VARCHAR(100) NULL,
  lat DECIMAL(10,6) NOT NULL,
  lng DECIMAL(10,6) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sea_route (
  sea_route_id INT AUTO_INCREMENT PRIMARY KEY,
  from_port_id INT NOT NULL,
  to_port_id INT NOT NULL,
  sea_mode ENUM('ferry','vessel') NOT NULL,
  distance_km DECIMAL(10,2) NOT NULL,
  typical_hours DECIMAL(6,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes VARCHAR(255) NULL,
  UNIQUE KEY uq_sea_route (from_port_id, to_port_id, sea_mode),
  CONSTRAINT fk_sea_route_from FOREIGN KEY (from_port_id) REFERENCES seaport(port_id),
  CONSTRAINT fk_sea_route_to FOREIGN KEY (to_port_id) REFERENCES seaport(port_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- Tuyến biển dùng được **cả hai chiều** (truy vấn `(from=A AND to=B) OR (from=B AND to=A)`); seed một chiều là đủ.
- Seed (ghi rõ "dữ liệu demo, tọa độ gần đúng"; seed cảng bằng `ON DUPLICATE KEY UPDATE` theo `code`, tuyến bằng `INSERT IGNORE` theo unique key, lấy `port_id` qua subquery theo `code`):

| code | name | country | city | lat | lng |
|---|---|---|---|---|---|
| VN-RGI | Cảng Rạch Giá | Vietnam | Kiên Giang | 10.0125 | 105.0809 |
| VN-PQC | Cảng Bãi Vòng (Phú Quốc) | Vietnam | Phú Quốc | 10.1557 | 104.0402 |
| VN-CLI | Cảng Cát Lái | Vietnam | Hồ Chí Minh | 10.7617 | 106.7894 |
| SG-PSA | Cảng Pasir Panjang | Singapore | Singapore | 1.2737 | 103.7909 |
| TH-LCB | Cảng Laem Chabang | Thailand | Chonburi | 13.0827 | 100.8830 |

| from → to | sea_mode | distance_km | typical_hours |
|---|---|---|---|
| VN-RGI → VN-PQC | ferry | 115 | 2.5 |
| VN-CLI → SG-PSA | vessel | 1300 | 60 |
| VN-CLI → TH-LCB | vessel | 1250 | 66 |

### 4.3 Bảng giá có phiên bản

```sql
CREATE TABLE IF NOT EXISTS pricing_tariff (
  tariff_id INT AUTO_INCREMENT PRIMARY KEY,
  mode ENUM('road','air','sea') NOT NULL,
  region VARCHAR(20) NOT NULL DEFAULT 'VN',
  version INT NOT NULL,
  params JSON NOT NULL,
  effective_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  notes VARCHAR(255) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tariff_version (mode, region, version),
  CONSTRAINT fk_tariff_creator FOREIGN KEY (created_by) REFERENCES `user`(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- `region` để Step 9 thêm bảng giá đối tác nước ngoài (`PARTNER`). Step 4 chỉ seed `VN`.
- **Mỗi (mode, region) chỉ có đúng 1 bản `is_active = TRUE`.** Sửa bảng giá = tạo **version mới** (version cũ + 1), bật bản mới, tắt bản cũ, trong **một transaction**. Không bao giờ UPDATE `params` của version đã tạo.
- Seed version 1 (`is_active = TRUE`, `created_by = NULL`, `notes = 'Bảng giá demo v1 theo file định hướng C3'`), dùng `INSERT IGNORE` theo unique key. Nội dung `params` ở mục 5.

### 4.4 Báo giá

```sql
CREATE TABLE IF NOT EXISTS shipment_quote (
  quote_id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  transport_mode ENUM('road','air','sea') NOT NULL,
  sea_mode ENUM('ferry','vessel') NULL,
  input_json JSON NOT NULL,
  result_json JSON NOT NULL,
  tariff_versions_json JSON NOT NULL,
  freight_total BIGINT NOT NULL,
  insurance_total BIGINT NOT NULL DEFAULT 0,
  total BIGINT NOT NULL,
  status ENUM('active','used','expired') NOT NULL DEFAULT 'active',
  expires_at DATETIME NOT NULL,
  used_by_shipment_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_quote_customer FOREIGN KEY (customer_id) REFERENCES `user`(user_id),
  CONSTRAINT fk_quote_shipment FOREIGN KEY (used_by_shipment_id) REFERENCES shipment(shipment_id),
  INDEX idx_quote_customer (customer_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- Thêm vào `shipment`: `quote_id INT NULL` (FK tới `shipment_quote`), `pricing_snapshot JSON NULL`, `distance_km DECIMAL(10,2) NULL`, `distance_source ENUM('ors','estimated','table') NULL`, `origin_lat`, `origin_lng`, `destination_lat`, `destination_lng` (`DECIMAL(10,6) NULL`). Kiểm tra trước, có cột tương tự rồi thì dùng lại, không thêm trùng.
- Cập nhật `database/schema.mysql.sql` và `docs/erd.md` khớp với migration.

## 5. Tham số bảng giá (`params` JSON) — giá trị demo theo C3

```jsonc
// mode = road, region = VN, version 1
{
  "openingFeePerVehicle": 2000000,
  "distanceTiers": [
    { "upToKm": 100, "pricePerKm": 45000 },
    { "upToKm": 500, "pricePerKm": 35000 },
    { "upToKm": null, "pricePerKm": 28000 }
  ],
  "careFeePerHorse": 500000,
  "deadheadPerKm": 15000,
  "nightSurchargePerVehicle": 1000000,
  "borderCrossingFee": 3000000,
  "roundingUnit": 1000,
  "averageSpeedKmh": 50
}
// mode = air, region = VN, version 1
{
  "baseFeePerHorse": 60000000,
  "pricePerKmPerHorse": 25000,
  "airportHandlingPerHorse": 5000000,
  "privateStallMultiplier": 1.5,
  "roundingUnit": 1000,
  "averageSpeedKmh": 700
}
// mode = sea, region = VN, version 1
{
  "ferry": { "ticketPerVehicle": 3000000 },
  "vessel": { "baseFeePerHorse": 15000000, "pricePerKmPerHorse": 8000 },
  "roundingUnit": 1000
}
```

**Hệ số loại xe không nằm trong tariff**: lấy từ `vehicle_class.price_coefficient` (Step 3: truck_1 1.00, truck_2 1.00, truck_4 1.30, truck_6 1.60).

## 6. Công thức (hàm thuần `backend/src/modules/orders/pricing-policy.ts`)

Mọi số tiền là **số nguyên VND**. Mỗi dòng breakdown làm tròn bằng `Math.round` về đồng. **Tổng cước** làm tròn **lên** bội `roundingUnit` (1.000), phần chênh hiển thị thành dòng `rounding`.

### 6.1 Bậc km (lũy tiến, giống thuế)

`tieredDistanceCost(km, tiers)`: 100 km đầu × 45.000, phần từ km 101 đến 500 × 35.000, phần trên 500 × 28.000. `km` có thể lẻ (giữ 2 chữ số thập phân), nhân xong làm tròn.

### 6.2 Đường bộ (`calculateRoadFreight`)

```
Cước_bộ = Σ_xe [ openingFee + tieredDistanceCost(km_tuyến) × hệ_số_xe + deadheadPerKm × km_từ_trạm_đến_điểm_đón + (nightPickup ? nightSurcharge : 0) ]
        + Số_ngựa × careFeePerHorse
        + Số_cửa_khẩu × borderCrossingFee
```

- `Số_ngựa` = tổng `quantity` của các ngựa (không nhân 2 với ngựa chuồng riêng; chuồng riêng chỉ ảnh hưởng **số chỗ** để chọn xe).
- `Số_cửa_khẩu`: Step 4 tính đơn giản: quốc gia điểm đón ≠ quốc gia điểm giao → 1, cùng quốc gia → 0. (Step 9 có thể tính chính xác hơn.)
- `nightPickup` luôn `false` ở Step 4 (Step 9 bật).
- Breakdown mỗi xe có dòng riêng: `opening_fee`, `distance` (ghi km và hệ số), `deadhead` (ghi km). Dòng chung: `care_fee`, `border_crossing`, `rounding`.

### 6.3 Đường hàng không (`calculateAirFreight`)

```
Phần_bay_mỗi_ngựa = baseFeePerHorse + km_bay × pricePerKmPerHorse
Nếu ngựa cần chuồng riêng: Phần_bay_mỗi_ngựa × privateStallMultiplier   (chỉ nhân phần bay, KHÔNG nhân phí sân bay)
Cước_không = Σ_ngựa (Phần_bay + airportHandlingPerHorse) + Cước_bộ(điểm đón → sân bay đi) + Cước_bộ(sân bay đến → điểm giao)
```

- Ghi rõ quyết định "chuồng riêng chỉ nhân phần bay" trong comment và trong `docs/flows/flow-1-request-approval.md` (file định hướng có 2 cách diễn đạt khác nhau; ta chọn theo bảng C3.3).
- Hai chặng bộ tính **riêng từng chặng** bằng `calculateRoadFreight` (mỗi chặng có phí mở chuyến riêng). Phí chăm sóc `careFeePerHorse` chỉ tính **một lần** cho cả đơn (ở chặng bộ đầu), tránh tính 2 lần.

### 6.4 Đường thủy (`calculateSeaFreight`)

- `ferry` (ngựa ở nguyên trên xe, xe lên phà): cước bộ tính như **một chuyến bộ liên tục** trên tổng km bộ (điểm đón → cảng đi + cảng đến → điểm giao) + `ticketPerVehicle × số_xe`. Hạn chế: chỉ cho phép khi `typical_hours ≤ 12`.
- `vessel` (ngựa đi ô chuồng trên tàu): `Σ_ngựa (baseFeePerHorse + km_biển × pricePerKmPerHorse)` + 2 chặng bộ tính riêng như đường hàng không. Kèm `warnings: ['SEA_VESSEL_HEALTH_RISK']` để UI hiện cảnh báo B2.

### 6.5 Hàm tổng

```ts
export interface FreightInput {
  mode: 'road' | 'air' | 'sea';
  seaMode?: 'ferry' | 'vessel';
  horses: Array<{ horseId: number; quantity: number; requiresPrivateStall: boolean }>;
  vehicles: Array<{ classCode: string; priceCoefficient: number; capacity: number; deadheadKm: number }>; // phương án xe đã chọn cho chặng bộ chính
  roadLegs: Array<{ key: 'main' | 'to_hub' | 'from_hub'; distanceKm: number; borderCrossings: number }>;
  airKm?: number;
  seaKm?: number;
  nightPickup?: boolean;
}
export interface FreightLine { code: string; label: string; quantity: number; unit: string; unitPrice: number; amount: number; meta?: Record<string, unknown>; }
export interface FreightResult { lines: FreightLine[]; subtotal: number; rounding: number; total: number; tariffVersions: Record<string, number>; warnings: string[]; }
export function calculateFreight(input: FreightInput, tariffs: { road: RoadTariff; air?: AirTariff; sea?: SeaTariff }): FreightResult
```

- `label` viết tiếng Việt dễ hiểu (vd `Phí mở chuyến — Xe tải ngựa 4 chỗ`), UI hiển thị nguyên.
- Validate đầu vào (km âm, không có ngựa, thiếu tariff cho mode) → ném `BadRequestException`.

### 6.6 Phương án xe mặc định ở Step 4 (tạm, Step 9 thay)

Cho chặng bộ chính (hoặc chặng ra hub với air/sea vessel; với ferry thì là toàn tuyến):
1. `slots = computeRequiredStallSlots(horses)` (Step 3).
2. Lấy các `vehicle_class` mode `road` sắp theo `horse_capacity` tăng dần. Chọn **loại nhỏ nhất có `horse_capacity ≥ slots`**. Nếu `slots > 6` thì dùng `ceil(slots/6)` xe `truck_6`.
3. `deadheadKm` = khoảng cách từ **trạm `own` đang hoạt động gần điểm đón nhất** (theo Haversine đến `depot.lat/lng`) đến điểm đón, tính bằng `DistanceService` (cho phép dùng ước lượng). Không có trạm → `deadheadKm = 0` và thêm warning `NO_DEPOT`.
4. Chặng bộ phía nước ngoài (sau sân bay/cảng đến): Step 4 dùng cùng phương án xe và `deadheadKm = 0` (Step 9 sẽ dùng trạm đối tác).

Kiểm tra lại bằng ví dụ C3 Phương án A (phải ra đúng **18.750.000**): 3 ngựa thường → slots 3 → truck_4 (×1,3); km tuyến 300; deadhead 20 km:
`2.000.000 + (100×45.000 + 200×35.000)×1,3 + 3×500.000 + 20×15.000 = 18.750.000`.

## 7. DistanceService (module `routes`)

File `backend/src/modules/routes/distance.service.ts`, export trong `RoutesModule` để `orders` dùng (`OrdersModule` import `RoutesModule`; kiểm tra để **không tạo phụ thuộc vòng**. Nếu `RoutesModule` đã import `OrdersModule`, hãy tách `DistanceService` sang một module nhỏ `routes/distance.module.ts` chỉ export service này, rồi cả hai cùng import).

```ts
export interface GeoPoint { lat: number; lng: number }
export interface DistanceResult { distanceKm: number; durationHours: number; source: 'ors' | 'estimated' | 'table' }
getRoadDistance(from: GeoPoint, to: GeoPoint): Promise<DistanceResult>
haversineKm(from: GeoPoint, to: GeoPoint): number   // export riêng ở geo-policy.ts (hàm thuần) để test
```

- Gọi OpenRouteService: `POST ${ORS_BASE_URL}/v2/directions/driving-hgv` với header `Authorization: <ORS_API_KEY>`, `Content-Type: application/json`, body `{ "coordinates": [[from.lng, from.lat], [to.lng, to.lat]] }` (**thứ tự lng, lat**). Kết quả: `routes[0].summary.distance` (mét), `routes[0].summary.duration` (giây). Đọc tài liệu ORS nếu cần xác nhận định dạng; nếu định dạng khác, xử lý theo tài liệu và ghi chú.
- Timeout **5 giây** bằng `AbortController`.
- **Cache trong bộ nhớ** (Map) 24 giờ, khóa = tọa độ làm tròn 4 chữ số thập phân của 2 điểm (sắp xếp để A→B và B→A dùng chung). Giới hạn kích thước cache (vd 5.000 mục, xóa mục cũ nhất).
- Dự phòng (không có key, lỗi mạng, HTTP lỗi, timeout, dữ liệu sai): `distanceKm = haversine × DISTANCE_FALLBACK_FACTOR (1.3)`, `durationHours = distanceKm / averageSpeedKmh (50)`, `source = 'estimated'`. Log cảnh báo **một lần** khi thiếu key (không spam log).
- Không bao giờ log API key.
- `.env.example` (gốc repo) thêm, có comment tiếng Việt:

```
# OpenRouteService (khoảng cách đường bộ cho xe tải, profile driving-hgv). Để trống thì dùng ước lượng Haversine × hệ số.
ORS_API_KEY=
ORS_BASE_URL=https://api.openrouteservice.org
DISTANCE_FALLBACK_FACTOR=1.3
# Thời gian giữ giá của một báo giá (phút)
QUOTE_TTL_MINUTES=30
```

- **Sân bay gần nhất** (air): đọc bảng `airport` (có `lat`, `lng`, `iata_code`). Nếu nhiều sân bay chưa có tọa độ, viết migration cập nhật `lat/lng` cho các sân bay đang seed (lấy số liệu từ `VIETNAM_AIRPORTS` và `INTERNATIONAL_EQUINE_AIRPORTS` trong `frontend/src/lib/geo-corridors.ts`; **sao chép dữ liệu**, không import code frontend vào backend). Chọn sân bay có `has_equine_cargo_ramp = TRUE` gần nhất (Haversine). `airKm` = Haversine giữa 2 sân bay.
- **Cảng** (sea): chọn cặp (cảng đi, cảng đến) có `sea_route` đang hoạt động với `sea_mode` đã chọn sao cho `haversine(điểm đón, cảng đi) + haversine(cảng đến, điểm giao)` nhỏ nhất. Không có cặp nào mà mỗi chặng bộ ≤ 400 km → `422` (`UnprocessableEntityException`) với thông báo "Chưa có tuyến biển phù hợp cho hai địa điểm này". `seaKm = sea_route.distance_km` (`source = 'table'`).

## 8. API

### 8.1 Bảng giá (module `orders`, file mới `pricing.controller.ts`, `pricing.store.ts`, `pricing.service.ts`)

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/pricing/tariffs/active` | mọi user đã đăng nhập | Bảng giá đang áp dụng cho từng mode (region VN) |
| GET | `/pricing/tariffs?mode=road` | Manager, Admin | Lịch sử version của một mode, mới nhất trước, kèm tên người tạo |
| POST | `/pricing/tariffs` | Manager, Admin | Body `{ mode, params, notes? }` → tạo version mới, bật nó, tắt bản cũ (transaction). Trả bản mới |
| POST | `/pricing/preview` | Manager, Admin | Body `{ mode, seaMode?, params?, sample: { origin, destination, horses: [{quantity, requiresPrivateStall}] } }` → tính thử bằng `params` gửi lên (chưa lưu) hoặc bản đang áp dụng. Trả `FreightResult` + khoảng cách |

- Validate `params` theo từng mode (DTO lồng hoặc hàm `validateTariffParams(mode, params)` trong `pricing-policy.ts`): số nguyên dương, `distanceTiers` tăng dần, bậc cuối `upToKm = null`, `privateStallMultiplier` trong [1, 3], `roundingUnit` ∈ {1, 100, 1000, 10000}. Sai → `400` kèm thông báo rõ field nào sai.

### 8.2 Báo giá (module `orders`, `quotes.controller.ts`)

`POST /quotes` — Customer (Manager/Admin cũng được để thử, nhưng `customerId` luôn là user hiện tại).

Request:

```json
{
  "origin": { "address": "Quận 7, TP.HCM", "lat": 10.7340, "lng": 106.7216, "country": "Vietnam" },
  "destination": { "address": "Đà Lạt, Lâm Đồng", "lat": 11.9404, "lng": 108.4583, "country": "Vietnam" },
  "departureDate": "2026-12-10",
  "transportMode": "road",
  "seaMode": null,
  "tripType": "one_way",
  "horses": [
    { "horseId": 12, "quantity": 1, "declaredValue": 2000000000, "declaredCurrency": "VND", "insurancePackage": "standard" }
  ]
}
```

Kiểm tra ở server:
- `lat ∈ [-90, 90]`, `lng ∈ [-180, 180]`, thêm ràng buộc vùng phục vụ: `lat ∈ [-11, 29]`, `lng ∈ [92, 141]` (Đông Nam Á + Hồng Kông). Ngoài vùng → `400`. Địa chỉ không rỗng, ≤ 255 ký tự. Điểm đón và giao không trùng (< 1 km → `400`).
- `departureDate` không ở quá khứ (so theo ngày `Asia/Ho_Chi_Minh`).
- Mỗi `horseId` thuộc **customer hiện tại**, trạng thái `active` (khác chủ → `403`; không tồn tại → `404`). Lấy `requires_private_stall` từ DB, **không** tin client.
- `seaMode` bắt buộc khi `transportMode = 'sea'`.
- Bảo hiểm: gọi `calculateInsurance` hiện có cho từng ngựa, `insuranceTotal = totalInsuranceFee(...)`.

Response `201`:

```json
{
  "quoteId": 501,
  "expiresAt": "2026-11-24T03:30:00.000Z",
  "transportMode": "road",
  "seaMode": null,
  "legs": [ { "key": "main", "type": "road", "from": "Quận 7, TP.HCM", "to": "Đà Lạt, Lâm Đồng", "distanceKm": 300.4, "durationHours": 6.6, "source": "ors" } ],
  "requiredStallSlots": 3,
  "options": [
    { "optionCode": "default", "label": "1 xe tải ngựa 4 chỗ", "vehicles": [ { "classCode": "truck_4", "count": 1, "depotName": "Trạm Thủ Đức", "deadheadKm": 20 } ],
      "freight": { "lines": [], "subtotal": 18750000, "rounding": 0, "total": 18750000 } }
  ],
  "recommendedOptionCode": "default",
  "insurance": { "total": 30000000, "horses": [] },
  "total": 48750000,
  "tariffVersions": { "road": 1 },
  "warnings": []
}
```

- Lưu vào `shipment_quote` (`input_json` = request đã chuẩn hóa, `result_json` = response, `expires_at = now + QUOTE_TTL_MINUTES`).
- `GET /quotes/:id`: chủ báo giá (hoặc Manager/Admin) xem lại; tự đánh dấu `expired` nếu quá hạn khi đọc.

### 8.3 Tạo đơn từ báo giá

- `CreateOrderDto` thêm `quoteId?: number` và `optionCode?: string` (mặc định `recommendedOptionCode`).
- Khi có `quoteId` (trong **transaction**, khóa dòng quote `FOR UPDATE`):
  - Quote thuộc user hiện tại (`403` nếu không), `status = 'active'`, `expires_at > NOW()` (hết hạn → `410 Gone` "Báo giá đã hết hạn, vui lòng báo giá lại"; đã dùng → `409`).
  - Danh sách ngựa và địa điểm của đơn **lấy từ quote**, bỏ qua giá trị client gửi lại nếu khác (hoặc trả `409` nếu client gửi khác — chọn cách trả `409` để tránh nhầm lẫn).
  - Ghi `shipment.quote_id`, `pricing_snapshot` (= option đã chọn + tariffVersions + legs), `transport_cost = freight.total`, `insurance_fee`, `total_cost = freight.total + insurance.total`, `transport_mode`, `sea_mode`, `distance_km`, `distance_source`, tọa độ.
  - Đặt quote `status = 'used'`, `used_by_shipment_id`.
- Không có `quoteId`: giữ hành vi cũ (để không vỡ test và dữ liệu cũ). Step 7 sẽ bắt buộc `quoteId`.
- **Manager duyệt đơn có `quote_id`**: `PATCH /orders/:id/approve` **không được ghi đè giá**. Nếu body gửi `transportCost`/`stallUnitPrice`/`totalCost` cho đơn có `quote_id` → bỏ qua phần giá, dùng giá snapshot (ghi chú trong code và docs). Frontend Manager ẩn ô nhập giá với đơn có báo giá và hiện breakdown snapshot.
- `GET /orders/:id` trả thêm `quoteId`, `pricingSnapshot`, `seaMode`, `distanceKm`, `distanceSource`.

## 9. Frontend

### 9.1 Form tạo đơn `frontend/src/app/customer/requests/new/page.tsx`

- Lựa chọn phương thức thêm **Đường thủy** với 2 lựa chọn con: "Phà RoRo (ngựa ở trên xe, ra đảo/chặng ngắn)" và "Tàu chở gia súc (quốc tế, lâu hơn)". Chọn `vessel` hiện cảnh báo nguyên văn: *"Đường thủy rẻ hơn nhưng lâu hơn và rủi ro sức khỏe cao hơn. Khuyến nghị đường hàng không cho ngựa đua thi đấu."*
- Khi đã có tọa độ hai điểm + ngày đi + ngựa + mode: gọi `POST /quotes` (debounce 600 ms, hủy request cũ khi input đổi). Hiện thẻ **Báo giá** gồm: các chặng (km, thời gian, nguồn: "đường đi thực tế" hoặc "ước lượng"), breakdown từng dòng, phí bảo hiểm, **tổng**, đồng hồ đếm ngược đến `expiresAt`, nút "Báo giá lại" khi hết hạn.
- Giữ bản đồ `RoutePlanningMap` để **hiển thị**; mọi con số giá hiển thị phải lấy từ response server (xóa hoặc ẩn mọi ước tính giá phía client nếu có).
- Gửi đơn: truyền `quoteId` và `optionCode`. Nếu nhận `410` → thông báo hết hạn và tự gọi báo giá lại.
- Logic gọi báo giá và kiểu dữ liệu đặt ở `frontend/src/features/orders/` (vd `quote-api.ts`, `components/QuoteBreakdown.tsx`), không viết dồn vào page.

### 9.2 Trang bảng giá Manager `frontend/src/app/manager/settings/pricing/page.tsx`

- 3 tab Bộ / Không / Thủy. Mỗi tab: form sửa tham số (ô số có định dạng nghìn `1.000`), bảng bậc km thêm/xóa dòng, nút **"Xem trước"** (gọi `/pricing/preview` với tuyến mẫu chọn sẵn: "Q7 TP.HCM → Đà Lạt, 3 ngựa", "TP.HCM → Singapore, 2 ngựa", "Rạch Giá → Phú Quốc, 1 ngựa"), nút **"Lưu thành phiên bản mới"** (xác nhận trong Modal: "Báo giá cũ không đổi giá"), bảng **lịch sử version** (version, ngày hiệu lực, người tạo, ghi chú, đang áp dụng).
- Thêm mục menu "Bảng giá" vào `navGroups` trong `manager/layout.tsx` (nhóm điều hành hoặc thêm nhóm "Cấu hình") và vào `CommandPalette.tsx`. Thêm key i18n en + vi.

### 9.3 Manager xem đơn

`frontend/src/app/manager/requests/page.tsx` và `[id]/page.tsx`: đơn có `quoteId` thì hiện breakdown snapshot, ẩn ô nhập cước. Đơn cũ giữ nguyên.

## 10. Test bắt buộc (`backend/test/pricing-quotes.test.cjs`, đăng ký vào `npm test`)

1. `tieredDistanceCost`: 0, 100, 101, 500, 501, 1000 km (tính tay từng giá trị, so khớp chính xác).
2. Ví dụ C3 phương án A = **18.750.000**; phương án B (3 xe truck_1, mỗi xe deadhead 20 km, hệ số 1,0) = **42.900.000**.
3. Ví dụ 2 C3 (air, 2 ngựa thường, 1.090 km, chỉ phần bay + phí sân bay) = **184.500.000** trước 2 chặng bộ; 1 ngựa chuồng riêng tăng đúng 50% phần bay.
4. Sea ferry: tổng km bộ liên tục + vé phà × số xe; sea vessel có warning `SEA_VESSEL_HEALTH_RISK`.
5. Làm tròn lên 1.000: subtotal 18.750.001 → total 18.751.000, rounding = 999.
6. `validateTariffParams`: bậc không tăng dần → lỗi; bậc cuối khác null → lỗi; số âm → lỗi.
7. `haversineKm` HCM–Hà Nội ≈ 1.137 km (sai số ±5 km).
8. `DistanceService` với `fetch` giả: thành công → `source 'ors'`; timeout/lỗi → `source 'estimated'` = haversine × 1,3; lần gọi thứ 2 cùng cặp tọa độ dùng cache (fetch chỉ gọi 1 lần); không có key → không gọi fetch.
9. Service báo giá (store giả): ngựa của người khác → `ForbiddenException`; `tripType: 'round_trip'` → `BadRequestException`; ngựa có `requires_private_stall` làm slots tăng và chọn xe lớn hơn.
10. Tạo đơn từ quote: hết hạn → `GoneException`; đã dùng → `ConflictException`; của người khác → `ForbiddenException`; thành công thì giá đơn = giá quote.
11. Tạo version bảng giá mới không đổi `result_json` của quote cũ (kiểm tra ở mức service: quote lưu snapshot, không đọc lại tariff).

## 11. Tài liệu phải cập nhật

- `docs/api-documentation.md`: mục mới "Pricing & Quotes (Step 4)" với đủ request/response, mã lỗi.
- `docs/erd.md`: `seaport`, `sea_route`, `pricing_tariff`, `shipment_quote`, cột mới của `shipment`, ENUM mở rộng.
- `docs/flows/flow-1-request-approval.md`: mục "Báo giá tự động (Step 4)": công thức, bảng giá có version, khóa giá 30 phút, quyết định chuồng riêng chỉ nhân phần bay, Manager không ghi đè giá của đơn có báo giá.
- `docs/flows/flow-3-route-planning.md`: đường thủy (ferry/vessel), cảng, giới hạn ferry ≤ 12 giờ.
- `docs/requirements.md`: thêm yêu cầu báo giá tự động và mode thủy (ngắn gọn).
- `.env.example`.
- File định hướng: dòng trạng thái Step 4.

## 12. Trình tự thực hiện gợi ý

1. Migration + schema + seed → `npm run migrate:all` nếu có DB.
2. `geo-policy.ts` + `pricing-policy.ts` + test thuần → build + chạy test này.
3. `DistanceService` + test.
4. Pricing store/service/controller.
5. Quotes + tạo đơn từ quote + chặn ghi đè giá khi duyệt.
6. Frontend form tạo đơn → trang bảng giá → màn Manager.
7. Docs. Chạy toàn bộ lệnh kiểm tra ở `_COMMON.md` mục 7.

## 13. Tiêu chí hoàn thành

- [ ] Nhập 2 địa chỉ → báo giá đúng công thức cho road, air, sea ferry, sea vessel.
- [ ] Không có `ORS_API_KEY` vẫn báo giá được (nguồn "ước lượng"), không lỗi.
- [ ] Đổi bảng giá → báo giá mới đổi giá, báo giá cũ và đơn cũ **không đổi**.
- [ ] Đơn tạo từ quote có giá khóa; Manager không ghi đè được.
- [ ] Customer không báo giá được với ngựa của người khác (403).
- [ ] `npm test` pass toàn bộ; tsc + eslint (không thêm error) + build frontend thành công.
- [ ] Báo cáo cuối theo mẫu `_COMMON.md` mục 9.

## 14. Bẫy thường gặp

- ORS dùng thứ tự `[lng, lat]`, không phải `[lat, lng]`.
- `Number` trong JSON từ MySQL: cột `DECIMAL` trả về **string** trong mysql2 → luôn `Number(...)`.
- Cột `JSON` có thể trả về object hoặc string tùy cấu hình → viết helper `parseJson` an toàn.
- Đừng để `orders` import `routes` và `routes` import `orders` cùng lúc (phụ thuộc vòng). Kiểm tra `routes.module.ts` trước.
- Không xóa `geo-corridors.ts`; frontend vẫn dùng để vẽ bản đồ và gợi ý địa chỉ.
- `CreateOrderDto` đang có nhiều field; đừng làm vỡ client cũ không gửi `quoteId`.
