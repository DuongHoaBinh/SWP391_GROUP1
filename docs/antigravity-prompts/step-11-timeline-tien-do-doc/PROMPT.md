# PROMPT STEP 11: Timeline tiến độ dạng line dọc dùng chung cho 3 actor

## 0. Vai trò và mục tiêu

Bạn là kỹ sư frontend (có sửa nhỏ backend nếu thiếu dữ liệu) trong repo EquiTransit. Nhiệm vụ: triển khai **Step 11** của `docs/dinh-huong-phat-trien-sau-review.md`.

Góp ý hội đồng (G12): *"Timeline giao hàng dạng line tiến độ dọc."*

Kết quả cuối: một component dùng chung **`VerticalTimeline`** hiển thị toàn bộ tiến độ một đơn (thanh toán, duyệt, giấy tờ, từng mốc chặng đi, chặng về), với **giờ dự kiến và thực tế**, trễ/sớm, sinh hiệu, ảnh, nguồn vị trí (GPS/giả lập/thủ công). Customer, Manager, Driver xem **cùng một chuyến bằng cùng component**, tiến độ khớp check-in thực tế.

## 1. Bắt buộc đọc trước

1. `docs/antigravity-prompts/_COMMON.md` (đặc biệt mục 6.4 Frontend).
2. `AGENTS.md`.
3. File định hướng: **STEP 11**, sơ đồ **C2** (các trạng thái đơn).
4. `docs/flows/flow-4-status-tracking.md`.
5. Code:
   - `frontend/src/features/tracking/` (gồm `components/UpcomingTripCard.tsx`, `api/*`), `frontend/src/features/orders/components/BookingSummary.tsx` (đang có tiến trình theo bước).
   - Các trang đang có timeline/bảng tiến độ: `app/customer/requests/[id]/page.tsx`, `app/customer/tracking/page.tsx` + `[id]/page.tsx` (Step 10), `app/driver/page.tsx`, `app/driver/status/page.tsx`, `app/driver/trips/page.tsx`, `app/manager/monitoring/page.tsx`, `app/manager/requests/[id]/page.tsx`. Tìm chữ `Timeline` và các danh sách mốc.
   - API dữ liệu: `GET /tracking/shipments/:id/live` (Step 10), `GET /tracking/shipments/:shipmentId`, `GET /routes/shipment/:shipmentId/plan`, `GET /orders/:id`, `shipment_status_history` (Step 7, nếu có endpoint đọc).
   - `frontend/src/app/globals.css` (token màu, có biến dark mode hay không), `tailwind.config.*`.

## 2. Điều kiện tiên quyết

- Step 10 khuyến nghị đã xong (có `/live` với vị trí, ETA, sinh hiệu, nguồn vị trí). Nếu chưa, component vẫn làm được với dữ liệu kế hoạch + check-in hiện có; các trường thiếu thì ẩn. Ghi rõ.
- Step 5 (chặng về) và Step 7 (lịch sử trạng thái) nếu có thì hiển thị; nếu không thì bỏ nhóm tương ứng.

## 3. Phạm vi

**Làm:** 11.1 component + adapter dữ liệu; 11.2 dùng ở 4 nơi; 11.3 thay timeline/bảng cũ **chỉ ở các trang đó**; 1 endpoint backend gộp dữ liệu timeline nếu cần (mục 5).

**Không làm:** đổi thiết kế các trang khác; animation nặng.

## 4. Thiết kế component

### 4.1 File và API

```
frontend/src/features/tracking/timeline/
  timeline-types.ts        // kiểu dữ liệu
  build-timeline.ts        // hàm thuần: dữ liệu API → TimelineItem[] (không phụ thuộc React)
  VerticalTimeline.tsx     // component hiển thị
  TimelineItemCard.tsx     // một mốc
```

```ts
export type TimelineStatus = 'done' | 'current' | 'upcoming' | 'skipped' | 'failed';
export type TimelineKind = 'payment' | 'approval' | 'documents' | 'pickup' | 'depot' | 'rest' | 'border' | 'quarantine'
  | 'airport' | 'seaport' | 'transfer' | 'delivery' | 'handover' | 'return_start' | 'no_show' | 'refund' | 'other';
export interface TimelineItem {
  id: string;
  group: 'pre_trip' | 'outbound' | 'return' | 'post_trip';
  kind: TimelineKind;
  title: string;                 // đã dịch
  subtitle?: string;             // địa điểm / mô tả ngắn
  status: TimelineStatus;
  plannedAt?: string | null;     // ISO
  actualAt?: string | null;
  delayMinutes?: number | null;  // > 0 trễ, < 0 sớm
  progressPercent?: number;      // chỉ với mốc 'current': % quãng đường từ mốc trước đến mốc này
  locationSource?: 'gps' | 'simulated' | 'manual' | 'override' | null;
  flagged?: boolean;
  vitals?: Array<{ horseName: string; tier: 'green' | 'amber_observational' | 'amber_escalatable' | 'red'; text: string }>;
  photos?: Array<{ url: string; alt: string }>;   // ảnh mở qua cơ chế có xác thực sẵn có
  actorLabel?: string;           // "Tài xế Nguyễn A (driver)"
  note?: string;
}
export interface VerticalTimelineProps {
  items: TimelineItem[];
  viewer: 'customer' | 'manager' | 'driver';
  compact?: boolean;             // dùng trong thẻ nhỏ: ẩn ảnh, gộp mốc done
  showGroups?: boolean;          // mặc định true
  emptyText?: string;
}
```

### 4.2 Hình thức

- Đường dọc bên trái, mỗi mốc có **chấm tròn + icon theo `kind`** (lucide: `CreditCard`, `ShieldCheck`, `FileCheck2`, `MapPin`, `Warehouse`, `Coffee`, `Flag`, `Stethoscope`, `Plane`, `Ship`, `Repeat`, `PackageCheck`, `Handshake`, `RotateCcw`, `UserX`...).
- Trạng thái:
  - `done`: chấm đặc màu xanh lục; đoạn nối phía dưới **tô đầy** màu đồng `#A67C2E`.
  - `current`: chấm có **vòng nhấp nháy** (`animate-ping` lớp phía sau), đoạn nối phía dưới **tô dần theo `progressPercent`** (gradient hoặc 2 lớp chồng, chiều cao theo %), viền nổi bật, `aria-current="step"`.
  - `upcoming`: chấm rỗng, đoạn nối **nét đứt**, chữ mờ.
  - `skipped`: gạch ngang tiêu đề, chấm xám; `failed`: chấm đỏ (vd no-show, hoàn tiền).
- Mỗi mốc hiển thị: tiêu đề, phụ đề, **giờ dự kiến** và **giờ thực tế** (định dạng `HH:mm dd/MM`, múi giờ `Asia/Ho_Chi_Minh`), badge **"Trễ 25 phút"** (vàng nếu ≤ 60 phút, đỏ nếu > 60) hoặc **"Sớm 10 phút"** (xanh), chip sinh hiệu (màu theo tầng + chữ, **không chỉ dùng màu**), ảnh nhỏ (bấm để mở), badge nguồn vị trí: "GPS" / "Giả lập" / "Thủ công" (thủ công có biểu tượng cảnh báo khi `flagged`).
- Nhóm: tiêu đề nhóm **"Trước chuyến"**, **"Chặng đi"**, **"Chặng về"**, **"Sau chuyến"** (chỉ hiện nhóm có mốc).
- `viewer = 'customer'`: ẩn `actorLabel` nội bộ, ẩn mốc `transfer` của đơn khác (dữ liệu đã được backend ẩn), ẩn số liệu sinh hiệu nếu API trả dạng trung tính.
- `viewer = 'driver'`: mốc `current` có vùng gắn nút hành động do trang cha truyền vào (prop `renderCurrentActions?: (item) => ReactNode`) để tài xế check-in ngay trên timeline.
- **Responsive**: trên màn ≤ 640 px timeline chiếm toàn chiều rộng, giờ xuống dòng dưới tiêu đề; không cuộn ngang.
- **Dark mode**: nếu dự án đã có cơ chế dark mode (kiểm tra `globals.css` có biến/selector dark, hoặc class `dark:` được dùng rộng rãi) thì hỗ trợ đầy đủ bằng cùng cơ chế; nếu dự án **không** có dark mode thì chỉ dùng token/biến màu sẵn có để dễ bật sau, và ghi rõ trong báo cáo (không tự dựng hệ dark mode mới).
- **Giảm chuyển động**: mọi animation (`animate-ping`, chuyển tô đoạn nối) dùng `motion-safe:`; `prefers-reduced-motion` thì tắt.
- **Truy cập**: danh sách là `<ol>`, mỗi mốc là `<li>` có text trạng thái ẩn cho trình đọc màn hình ("Đã hoàn thành", "Đang diễn ra", "Sắp tới"); ảnh có `alt`; độ tương phản chữ mờ vẫn ≥ 4.5:1.

### 4.3 Hàm `build-timeline.ts` (thuần, viết kỹ)

- Đầu vào: dữ liệu đơn (`GET /orders/:id`), kế hoạch tuyến (legs + stops có `direction`), check-in (`route_stop_update`/`trip_status_log` mà API trả), live (Step 10), lịch sử trạng thái (Step 7) nếu có, và `language`.
- Đầu ra: `TimelineItem[]` đã sắp theo thứ tự hành trình (theo `sequence_no` của chặng → điểm dừng), gồm:
  - **Trước chuyến**: Đã thanh toán (từ lịch sử `paid_pending_review` hoặc ngày thanh toán hóa đơn), Đã duyệt (`approved`), Giấy tờ đầy đủ (khi checklist `isFullyCompliant`), Xe & tài xế xác nhận (`ready_to_depart`).
  - **Chặng đi / Chặng về**: điểm đón → các điểm dừng → sân bay/cảng → điểm giao. Mốc `current` = mốc đầu tiên chưa hoàn tất khi đơn đang chạy; `progressPercent` = `completedKm` giữa mốc trước và mốc hiện tại (từ `/live` nếu có, nếu không tính theo thời gian dự kiến).
  - **Sau chuyến**: Bàn giao (Flow 6), Hoàn tất; hoặc Không giao ngựa (no-show), Hoàn tiền.
  - `delayMinutes` = `actualAt − plannedAt` (phút) khi có cả hai; với mốc `current`/`upcoming` có ETA thì trễ dự kiến = `etaAt − plannedAt`.
- Không có dữ liệu → trả mảng rỗng (component hiện `emptyText`).

### 4.4 (Nếu cần) endpoint gộp

Nếu việc ghép từ 3–4 API ở frontend quá phức tạp hoặc lộ dữ liệu nội bộ cho khách, thêm `GET /tracking/shipments/:id/timeline` (module `tracking`) trả sẵn danh sách sự kiện đã chuẩn hóa (cùng quy tắc phân quyền và ẩn dữ liệu như `/live`), và `build-timeline.ts` chỉ còn ánh xạ + dịch. Quyết định và ghi lý do trong báo cáo.

## 5. Dùng ở đâu (11.2) và thay thế gì (11.3)

| Trang | Việc cần làm |
|---|---|
| `app/customer/tracking/[id]/page.tsx` | Thay danh sách mốc tạm của Step 10 bằng `VerticalTimeline viewer="customer"`, đặt cạnh bản đồ (desktop 2 cột, mobile xếp dọc: bản đồ trên, timeline dưới) |
| `app/customer/requests/[id]/page.tsx` | Thay khối tiến độ/timeline ngang hoặc bảng mốc hiện có bằng `VerticalTimeline` (`compact` nếu đơn chưa chạy) |
| `app/manager/monitoring/page.tsx` | Panel chi tiết chuyến dùng `VerticalTimeline viewer="manager"` (có `actorLabel`, cờ thủ công) |
| Trang chi tiết chuyến của tài xế | `app/driver/trips/[id]/page.tsx` **chưa tồn tại** (chỉ có `app/driver/trips/page.tsx`). Tạo trang chi tiết mới hoặc dùng trong `app/driver/status/page.tsx` cho chuyến đang chạy, với `viewer="driver"` + `renderCurrentActions` gắn nút check-in/sinh hiệu sẵn có. Liên kết từ danh sách chuyến |

- Chỉ thay ở các trang trên. Không xóa component cũ nếu còn được dùng ở nơi khác; nếu không còn ai dùng, có thể xóa và ghi trong báo cáo.
- Polling: dùng lại cơ chế 15 giây của Step 10 ở trang tracking; các trang khác tải một lần + nút làm mới.

## 6. Kiểm tra

- Frontend chưa có framework test đơn vị: **không cài thêm**. Thay vào đó:
  - Viết `build-timeline.ts` thuần, và tạo file kiểm tra nhanh `frontend/src/features/tracking/timeline/__checks__/build-timeline.check.ts` **chỉ khi** dự án có cách chạy (vd `npx tsx` có sẵn trong `node_modules`); nếu không có, bỏ qua file này và mô tả trong báo cáo các ca đã thử tay.
  - Nếu Step này thêm endpoint backend (4.4), viết test backend `backend/test/timeline.test.cjs` (phân quyền: khách khác chủ 403; khách không thấy dữ liệu nội bộ) và đăng ký vào `npm test`.
- Chạy: `npx tsc --noEmit`, `npx eslint src` (không thêm error), `npm run build` (frontend); nếu có sửa backend thì `npx tsc --noEmit -p tsconfig.json` + `npm test`.
- Thử tay (ghi trong báo cáo): một chuyến giả lập (Step 10) đang chạy → mở cùng lúc 3 tài khoản Customer, Manager, Driver → mốc `current` giống nhau, đoạn nối tô dần, sau khi tài xế check-in thì cả 3 cập nhật (sau lần polling).
- Kiểm tra mobile (DevTools 375 px), `prefers-reduced-motion` (DevTools Rendering → emulate), chế độ tối nếu có.

## 7. Tài liệu

- `docs/flows/flow-4-status-tracking.md`: mục "Timeline tiến độ dọc (Step 11)": các nhóm, trạng thái, quy tắc trễ/sớm, khác biệt theo actor.
- `docs/api-documentation.md` nếu thêm endpoint timeline.
- File định hướng: trạng thái Step 11.

## 8. Tiêu chí hoàn thành

- [ ] Một component duy nhất dùng ở 4 nơi cho 3 actor.
- [ ] Hiển thị đúng done/current (nhấp nháy + tô dần)/upcoming (nét đứt); giờ dự kiến và thực tế; trễ/sớm; sinh hiệu; nguồn vị trí.
- [ ] Có nhóm Chặng đi/Chặng về với đơn khứ hồi.
- [ ] Responsive, tắt animation khi giảm chuyển động, có text cho trình đọc màn hình.
- [ ] Tiến độ khớp check-in thực tế giữa 3 actor.
- [ ] Lệnh kiểm tra đạt; báo cáo theo mẫu `_COMMON.md`.

## 9. Bẫy thường gặp

- Lệch múi giờ khi so giờ dự kiến/thực tế: chuyển hết về `Date` rồi mới tính phút.
- Đoạn nối của mốc cuối không được vẽ.
- Tô màu chỉ bằng màu sắc → khó đọc với người mù màu; luôn kèm chữ/icon.
- Customer nhìn thấy tên nhân viên nội bộ hoặc điểm trung chuyển của đơn khác.
