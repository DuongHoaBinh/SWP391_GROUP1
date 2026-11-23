# PROMPT STEP 10: Check-in bằng GPS, chế độ giả lập vị trí, sinh hiệu bắt buộc, live tracking

## 0. Vai trò và mục tiêu

Bạn là kỹ sư full-stack trong repo EquiTransit. Nhiệm vụ: triển khai **Step 10** của `docs/dinh-huong-phat-trien-sau-review.md`.

Góp ý hội đồng (G8): *"Check-in các mốc bằng GPS của tài xế, có giả lập; nhập sức khỏe, nhịp tim → live tracking."*

Kết quả cuối:
- Tài xế check-in mốc bằng **vị trí GPS** của trình duyệt; server kiểm tra **geofence** (bán kính theo loại điểm). Ngoài bán kính: từ chối, hoặc check-in thủ công **bắt buộc lý do + ảnh** và bị gắn cờ cho Manager.
- **Chế độ giả lập** (bật/tắt bởi Admin) để demo: tài xế chọn "đang ở điểm X" hoặc bấm "Chạy giả lập" để xe tự chạy theo tuyến. Bản ghi giả lập luôn được đánh dấu, không lẫn với dữ liệu thật.
- Xe gửi **vị trí liên tục** khi đang chạy (hỗ trợ mất mạng gửi bù).
- Tại mỗi điểm nghỉ **bắt buộc nhập sinh hiệu** từng ngựa trước khi rời điểm; phân loại xanh/vàng/đỏ theo `vitals-policy.ts`; đỏ thông báo ngay.
- Khách và Manager xem **bản đồ live**: vị trí xe, tuyến đã đi/chưa đi, ETA, sinh hiệu mới nhất.

## 1. Bắt buộc đọc trước

1. `docs/antigravity-prompts/_COMMON.md`.
2. `AGENTS.md`.
3. File định hướng: **STEP 10**, **E/Q8** (polling 15 giây trước, SSE nếu còn thời gian), **E/Q9** (bán kính geofence 300 m / 1.000 m), **Phần F** (geolocation cần HTTPS hoặc localhost).
4. `docs/flows/flow-4-status-tracking.md` (toàn bộ: quy tắc offline/backdated, override của Manager, `updated_by_role`, driver vs escort `DEC-07`).
5. Code `backend/src/modules/tracking/` **toàn bộ**: `tracking.controller.ts` (start leg, stop status, complete leg, coordinator-override, health logs, vital-config), `tracking.service.ts`, `tracking.store.ts`, `vitals-policy.ts` (`evaluateEquineHealthAlert`: 3 tầng, leo thang sau 2 lần vàng trong 6 giờ), `tracking.types.ts`.
6. Bảng `route_stop` (chưa có tọa độ), `route_stop_update`, `trip_status_log`, `horse_health_log`, `equine_vital_config`, `master_stop` (có lat/lng), `airport` (có lat/lng), `depot` (Step 3), `seaport` (Step 4), `system_setting` (Step 9; tạo nếu chưa có).
7. `backend/src/modules/routes/routes.store.ts` (lưu `route_stop` khi dựng kế hoạch), `distance.service.ts` (Step 4).
8. Frontend: `app/driver/status/page.tsx`, `app/driver/trips/page.tsx`, `app/driver/health/page.tsx`, `features/tracking/*`, `app/customer/tracking/page.tsx`, `app/manager/monitoring/page.tsx` + `alerts`, `components/maps/DepotMap.tsx` (mẫu Leaflet), `components/maps/RoutePlanningMap.tsx`.

## 2. Điều kiện tiên quyết

- Không bắt buộc Step 9, nhưng nếu Step 9 chưa tạo `system_setting` thì Step này tạo (idempotent).
- Có module tracking hoạt động với các endpoint hiện tại.

## 3. Phạm vi

**Làm:** 10.1 GPS + geofence; 10.2 giả lập; 10.3 ping vị trí + sinh hiệu bắt buộc; 10.4 live tracking cho Customer và Manager.

**Không làm:** ứng dụng di động native; theo dõi nền khi tắt trình duyệt; SSE là **tùy chọn** (chỉ làm nếu polling đã xong và ổn định).

## 4. Dữ liệu (migration kế tiếp, dự kiến `037_gps_tracking.sql`)

### 4.1 Tọa độ điểm dừng

- `route_stop` thêm: `lat DECIMAL(10,6) NULL`, `lng DECIMAL(10,6) NULL`, `geofence_radius_m INT NULL` (NULL = dùng mặc định theo loại), `location_ref_type ENUM('master_stop','airport','seaport','depot','address','manual') NULL`, `location_ref_id INT NULL`.
- `route_leg` thêm: `origin_lat`, `origin_lng`, `destination_lat`, `destination_lng` (`DECIMAL(10,6) NULL`), `route_polyline MEDIUMTEXT NULL` (danh sách tọa độ JSON đã giản lược, tối đa ~500 điểm).
- Điền tọa độ khi dựng/lưu kế hoạch (`routes.store.ts`): điểm dừng chọn từ `master_stop` → lấy lat/lng của master stop; điểm đầu/cuối chặng bộ → tọa độ đón/giao của đơn (Step 4 lưu ở `shipment.origin_lat...`) hoặc sân bay/cảng/trạm tương ứng. Không có tọa độ → để NULL và **không áp geofence** cho điểm đó (chỉ gắn cờ "điểm chưa có tọa độ"). `route_polyline`: nếu Step 4 `DistanceService` lấy được geometry từ ORS thì lưu; nếu không, dùng đường thẳng qua các điểm dừng.

### 4.2 Bán kính mặc định (Q9)

| Loại điểm | Bán kính |
|---|---|
| `rest`, `refuel`, `transfer_hub`, `other`, điểm đón/giao theo địa chỉ, trạm | 300 m |
| `border_check`, `quarantine`, sân bay, cảng | 1.000 m |

Lưu thành cấu hình `system_setting` key `tracking.geofence` = `{ "defaultRadiusM": 300, "largeSiteRadiusM": 1000, "maxAccuracyM": 200 }` (độ chính xác GPS kém hơn `maxAccuracyM` thì yêu cầu thử lại hoặc check-in thủ công).

### 4.3 Bằng chứng vị trí cho mỗi check-in (append-only)

Thêm vào **`route_stop_update`** và **`trip_status_log`** (cả hai, vì bắt đầu/kết thúc chặng ghi vào `trip_status_log`):
`lat DECIMAL(10,6) NULL`, `lng DECIMAL(10,6) NULL`, `accuracy_m DECIMAL(8,2) NULL`, `location_source ENUM('gps','simulated','manual','override') NULL`, `distance_to_stop_m INT NULL`, `geofence_passed BOOLEAN NULL`, `manual_reason VARCHAR(500) NULL`, `evidence_url VARCHAR(500) NULL`, `flagged BOOLEAN NOT NULL DEFAULT FALSE`.

### 4.4 Vị trí liên tục

```sql
CREATE TABLE IF NOT EXISTS vehicle_position_ping (
  ping_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  shipment_id INT NOT NULL,
  leg_id INT NULL,
  vehicle_id INT NULL,
  reported_by INT NOT NULL,
  lat DECIMAL(10,6) NOT NULL,
  lng DECIMAL(10,6) NOT NULL,
  accuracy_m DECIMAL(8,2) NULL,
  speed_kmh DECIMAL(6,2) NULL,
  heading_deg DECIMAL(5,2) NULL,
  source ENUM('gps','simulated') NOT NULL,
  recorded_at DATETIME(3) NOT NULL,
  received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  is_backdated BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_ping_shipment FOREIGN KEY (shipment_id) REFERENCES shipment(shipment_id),
  INDEX idx_ping_shipment_time (shipment_id, recorded_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.5 Cấu hình

- `system_setting` key `tracking.simulation_enabled` = `false` (seed `INSERT IGNORE`).
- `system_setting` key `tracking.customer_vitals_detail` = `true` (false → khách chỉ thấy thông điệp trung tính khi có cảnh báo, không thấy số liệu).
- `.env.example`: `TRACKING_SIMULATION_ENABLED=false` — giá trị **mặc định ban đầu** khi DB chưa có setting; sau đó Admin bật/tắt trong hệ thống (DB là nguồn chính).

## 5. Hàm thuần `backend/src/modules/tracking/geofence-policy.ts`

```ts
export function distanceMeters(a: GeoPoint, b: GeoPoint): number;                     // haversine
export function radiusForStop(stop: { stopType: string; geofenceRadiusM: number | null; locationRefType: string | null }, cfg): number;
export function evaluateGeofence(input: { position: GeoPoint & { accuracyM?: number | null }; stop: GeoPoint | null; radiusM: number; maxAccuracyM: number }):
  { status: 'inside' | 'outside' | 'low_accuracy' | 'no_stop_coordinates'; distanceM: number | null };
export function interpolateAlongPolyline(points: GeoPoint[], fraction: number): GeoPoint;   // dùng cho giả lập
export function decimatePath(points: Array<GeoPoint & { t: number }>, maxPoints: number): typeof points;
```

- Cho phép sai số: coi là `inside` nếu `distance ≤ radius + min(accuracy, 100)`.

## 6. API

### 6.1 Check-in có vị trí

Mở rộng **các endpoint hiện có** (không tạo endpoint song song): `POST /tracking/shipments/:shipmentId/legs/:legId/start`, `POST /tracking/shipments/:shipmentId/stops/:stopId/status`, `POST /tracking/shipments/:shipmentId/legs/:legId/complete`. DTO thêm (tùy chọn để không vỡ client cũ):

```json
{ "location": { "lat": 10.85, "lng": 106.75, "accuracyM": 15, "source": "gps" }, "manualReason": null, "evidenceUrl": null }
```

Quy tắc:
- `source = 'gps'`: tính `evaluateGeofence`.
  - `inside` → ghi bình thường, `geofence_passed = true`.
  - `outside` → **409** `{ code: 'OUTSIDE_GEOFENCE', distanceM, radiusM }`. Client cho phép gửi lại với `source = 'manual'`.
  - `low_accuracy` → **409** `{ code: 'LOW_GPS_ACCURACY' }`.
  - `no_stop_coordinates` → cho qua, `flagged = true`, ghi chú "Điểm chưa có tọa độ".
- `source = 'manual'`: bắt buộc `manualReason` (≥ 10 ký tự) và `evidenceUrl` (ảnh đã tải qua endpoint upload ảnh sẵn có của tracking, kiểm tra magic bytes) → ghi `flagged = true`, thông báo Manager "Check-in thủ công ngoài vị trí".
- `source = 'simulated'`: chỉ khi `tracking.simulation_enabled = true` (ngược lại **403** `{ code: 'SIMULATION_DISABLED' }`); vẫn tính geofence với vị trí giả lập; ghi `location_source = 'simulated'`.
- Không gửi `location` (client cũ): giữ hành vi cũ nhưng ghi `location_source = NULL`, `flagged = true` (Manager thấy "không có vị trí"). Ghi rõ trong docs.
- Manager override (`coordinator-override`): ghi `location_source = 'override'`, giữ quy tắc hiện có.
- **Phân quyền giữ nguyên**: chỉ Driver/Escort được phân công (và Manager override); khác → 403. Append-only: không sửa bản ghi cũ.

### 6.2 Ping vị trí

- `POST /tracking/shipments/:shipmentId/pings` — Driver/Escort được phân công, đơn ở `in_transit` (hoặc `return_pending` nếu Step 5 có và chặng về đang chạy). Body: `{ pings: [{ lat, lng, accuracyM?, speedKmh?, headingDeg?, source: 'gps'|'simulated', recordedAt }] }` tối đa 100 điểm/lần (gửi bù khi mất mạng).
  - `recordedAt` không ở tương lai (> now + 2 phút → bỏ), không cũ hơn 24 giờ; cũ hơn 5 phút → `is_backdated = true`.
  - `simulated` khi giả lập tắt → 403.
  - Giới hạn tần suất: mỗi user tối thiểu 10 giây giữa 2 ping **cùng thời điểm thực** (ping gửi bù có `recordedAt` khác nhau thì nhận); quá dày → bỏ qua điểm thừa (không lỗi).
  - Trả `{ accepted, skipped }`.

### 6.3 Live

- `GET /tracking/shipments/:shipmentId/live` — Customer chủ đơn, Manager/Admin, Driver/Escort được phân công. Trả:

```json
{
  "shipmentId": 7, "status": "in_transit", "simulation": true,
  "vehicle": { "lat": 11.2, "lng": 107.1, "recordedAt": "...", "source": "simulated", "speedKmh": 52 },
  "path": [ { "lat": 10.85, "lng": 106.75, "t": "..." } ],
  "legs": [ { "legId": 1, "direction": "outbound", "type": "road", "status": "active", "polyline": [ [10.85,106.75] ] } ],
  "stops": [ { "stopId": 3, "name": "Trạm nghỉ Bảo Lộc", "type": "rest", "lat": 11.54, "lng": 107.80, "status": "pending", "plannedArrival": "...", "actualArrival": null, "etaAt": "..." } ],
  "progress": { "completedKm": 120.4, "totalKm": 300.2, "percent": 40 },
  "etaFinalAt": "...",
  "latestVitals": [ { "horseId": 12, "horseName": "Thunder", "temperatureC": 37.9, "heartRateBpm": 40, "alertTier": "green", "recordedAt": "..." } ]
}
```

  - `path` giản lược tối đa 500 điểm (`decimatePath`).
  - ETA: khoảng cách còn lại / tốc độ trung bình (tham số tariff road `averageSpeedKmh` hoặc 50) + thời gian nghỉ còn lại theo `journey.rules` nếu có (Step 9).
  - Khách: nếu `tracking.customer_vitals_detail = false` thì `latestVitals` chỉ có `alertTier` + thông điệp trung tính ("Ngựa đang được nhân viên thú y theo dõi"), không có số đo.
  - Khách chỉ thấy đơn của mình (403); áp lại quy tắc ẩn dữ liệu của tuyến (vd ẩn `transfer_hub`) đang có ở `routes.service.ts` (`redactRouteForCustomer`).
- `GET /tracking/live-overview` — Manager/Admin: mọi đơn đang chạy với vị trí mới nhất, tuyến, cảnh báo đỏ/vàng gần nhất, cờ check-in thủ công, nguồn giả lập. Lọc `?alert=red|amber|flagged`.

### 6.4 Sinh hiệu bắt buộc tại điểm nghỉ

- Khi đổi trạng thái điểm dừng loại `rest` (và `quarantine`) sang `departed`: mọi ngựa của đơn phải có `horse_health_log` (có `temperature_c` **và** `heart_rate_bpm`) ghi **sau** thời điểm `arrived` tại điểm đó. Thiếu → **409** `{ code: 'VITALS_REQUIRED', missingHorses: [...] }`.
- `POST /tracking/shipments/:id/health-logs` (đã có): thêm trường tùy chọn `respiratoryRate` (lưu vào cột mới `respiratory_rate_bpm INT NULL` của `horse_health_log`), `routeStopId` (cột mới `route_stop_id INT NULL`) để biết sinh hiệu đo ở điểm nào; vị trí đo (`lat`, `lng`, `location_source`) — thêm cột tương ứng.
- Phân loại dùng nguyên `evaluateEquineHealthAlert` (không viết lại). Tầng `red` → thông báo **ngay** cho Manager (`notifyRole`) và khách (thông điệp theo cấu hình chi tiết/trung tính). Giữ quy tắc leo thang sau 2 lần vàng trong 6 giờ.

### 6.5 Bật/tắt giả lập

- `GET /system-settings/tracking` — đã đăng nhập: `{ simulationEnabled, customerVitalsDetail }`.
- `PATCH /system-settings/tracking` — **chỉ Admin**: `{ simulationEnabled?, customerVitalsDetail? }`. Ghi `updated_by`. (Manager không đổi được: kiểm tra server-side.)
- Đặt controller/service cấu hình hệ thống ở chỗ hợp lý (nếu Step 9 đã tạo `system-settings` thì dùng lại, không tạo trùng).

## 7. Frontend

### 7.1 Tài xế `app/driver/status/page.tsx`

- Nút **"Check-in mốc"**: gọi `navigator.geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })` → gửi vị trí. Hiện độ chính xác và khoảng cách đến điểm.
  - Lỗi `OUTSIDE_GEOFENCE` → Modal: "Bạn đang cách [điểm] 1,2 km (cho phép 300 m)". Lựa chọn: "Thử lại" hoặc "Check-in thủ công" (bắt buộc lý do + chụp/tải ảnh).
  - Trình duyệt từ chối quyền vị trí / không có HTTPS → hướng dẫn bật quyền; gợi ý dùng `localhost` hoặc HTTPS; cho phép check-in thủ công.
- Khi đơn `in_transit`: tự gửi ping mỗi 30–60 giây bằng `watchPosition` (dừng khi rời trang/đơn kết thúc). Mất mạng: lưu hàng đợi trong `localStorage` (bọc try/catch), gửi bù khi có mạng (theo quy tắc offline hiện có của Flow 4).
- **Chế độ giả lập** (chỉ hiện khi `simulationEnabled = true`, có badge "GIẢ LẬP" nổi bật):
  - Dropdown "Giả lập: đang ở [điểm dừng X]" → dùng tọa độ điểm đó làm vị trí khi check-in (`source = 'simulated'`).
  - Nút **"Chạy giả lập"** / "Dừng": nội suy vị trí dọc `route_polyline` của chặng hiện tại mỗi 5 giây (tốc độ giả lập chọn được: ×1, ×10, ×60 so với thực tế), gửi ping `simulated`; khi vào bán kính điểm dừng kế tiếp thì **tự check-in `arrived`**; tại điểm nghỉ dừng lại chờ nhập sinh hiệu rồi mới tiếp tục.
  - Logic giả lập đặt trong `frontend/src/features/tracking/simulation.ts` (hook `useRouteSimulation`), không viết dồn vào page.
- Form sinh hiệu tại điểm nghỉ: mỗi ngựa thân nhiệt, nhịp tim, nhịp thở (tùy chọn), hành vi (`condition_status`), ảnh; hiện màu phân loại ngay sau khi gửi. Nút "Rời điểm" bị khóa cho tới khi đủ sinh hiệu (hiển thị danh sách ngựa còn thiếu).

### 7.2 Khách `app/customer/tracking/[id]/page.tsx` (trang mới; trang danh sách `customer/tracking/page.tsx` link sang)

- Bản đồ Leaflet (component mới `frontend/src/components/maps/LiveTrackingMap.tsx`, import động như `DepotMap.tsx`): marker xe (icon xe tải/máy bay theo chặng), đường đã đi (nét liền màu đồng) và chưa đi (nét đứt xám), marker điểm dừng theo trạng thái, tự giữ khung nhìn theo xe (có nút tắt "theo xe").
- Polling **15 giây** `GET /tracking/shipments/:id/live` (dừng khi tab ẩn — `document.visibilityState`, chạy lại khi hiện).
- Thẻ ETA còn lại, % tiến độ, sinh hiệu mới nhất từng ngựa (chip màu + giá trị, hoặc thông điệp trung tính), badge "Dữ liệu giả lập" khi `source = 'simulated'`.
- Danh sách mốc tạm thời dùng danh sách đơn giản; **Step 11** sẽ thay bằng `VerticalTimeline`.

### 7.3 Manager `app/manager/monitoring/page.tsx`

- Bản đồ tất cả chuyến đang chạy từ `/tracking/live-overview`, marker màu theo cảnh báo; bộ lọc Đỏ / Vàng / Check-in thủ công / Giả lập; bấm marker mở panel chi tiết (vị trí, ETA, sinh hiệu, check-in gần nhất với nguồn vị trí và khoảng cách đến điểm, ảnh bằng chứng nếu thủ công).
- Badge "Giả lập" cho bản ghi giả lập; badge "Thủ công" cho check-in ngoài geofence.

### 7.4 Cấu hình

- Trang cài đặt (`manager/settings` — khối chỉ hiện với `ADMIN`): công tắc **Chế độ giả lập vị trí**, công tắc **Cho khách xem số liệu sinh hiệu**. Không phải Admin thì chỉ xem trạng thái.
- i18n en/vi cho mọi chuỗi.

## 8. Test bắt buộc (`backend/test/gps-tracking.test.cjs`, đăng ký `npm test`)

1. `distanceMeters` đúng (sai số < 1%) với 2 điểm biết trước; `evaluateGeofence`: inside / outside / low_accuracy / no_stop_coordinates; biên `radius + accuracy`.
2. `radiusForStop`: rest 300; border_check 1.000; override `geofenceRadiusM`.
3. `interpolateAlongPolyline` fraction 0 / 0,5 / 1; `decimatePath` giữ điểm đầu, cuối, ≤ maxPoints.
4. Check-in GPS ngoài bán kính → 409 `OUTSIDE_GEOFENCE`; manual thiếu lý do/ảnh → 400; manual hợp lệ → `flagged = true` + thông báo Manager; simulated khi tắt → 403; Driver không được phân công → 403.
5. Ping: tương lai bị bỏ; > 24 giờ bị bỏ; cũ hơn 5 phút → `is_backdated`; simulated khi tắt → 403.
6. Rời điểm nghỉ thiếu sinh hiệu → 409 `VITALS_REQUIRED` với danh sách ngựa thiếu; đủ thì cho qua.
7. Sinh hiệu đỏ → gọi `notifyRole` Manager và thông báo khách.
8. `GET live`: khách khác chủ → 403; `customer_vitals_detail = false` → không có số đo trong response của khách.
9. `PATCH /system-settings/tracking` bởi Manager → 403; Admin → OK.

## 9. Tài liệu

- `docs/flows/flow-4-status-tracking.md`: GPS + geofence (bảng bán kính), check-in thủ công có cờ, giả lập (luôn đánh dấu), ping + offline, sinh hiệu bắt buộc tại điểm nghỉ, live tracking, cấu hình cho khách xem số liệu.
- `docs/actors-and-roles.md`: Admin bật/tắt giả lập; Driver check-in GPS; Customer xem live đơn của mình.
- `docs/api-documentation.md`, `docs/erd.md`, `docs/requirements.md`, `.env.example`, file định hướng (trạng thái Step 10).

## 10. Tiêu chí hoàn thành

- [ ] Bật giả lập, chạy một chuyến từ đầu đến cuối: khách thấy xe chạy trên bản đồ, mốc tự tick, sinh hiệu cập nhật.
- [ ] Check-in sai vị trí bị chặn hoặc gắn cờ; Manager thấy cờ.
- [ ] Không rời điểm nghỉ được khi thiếu sinh hiệu.
- [ ] Dữ liệu giả lập luôn có badge, không lẫn dữ liệu thật.
- [ ] Mọi lệnh kiểm tra đạt; báo cáo theo mẫu (ghi rõ đã thử geolocation thật trên `localhost` chưa).

## 11. Bẫy thường gặp

- Geolocation chỉ chạy trên HTTPS hoặc `localhost`; truy cập qua IP LAN sẽ bị chặn.
- `watchPosition` tiếp tục chạy sau khi rời trang nếu quên `clearWatch`.
- Leaflet + Next.js: luôn import động, `ssr: false`; gỡ map khi unmount.
- Đừng sửa bản ghi `route_stop_update` cũ để thêm vị trí; chỉ bản ghi mới có vị trí.
- Polling nhiều tab: dừng khi tab ẩn để giảm tải.
