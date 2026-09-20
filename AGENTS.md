# AGENTS.md

## 1. Mục đích dự án

Đây là hệ thống quản lý vận chuyển ngựa đua xuyên quốc gia, bao gồm các luồng tạo đơn, hồ sơ pháp lý/kiểm dịch, lập tuyến và theo dõi chuyến đi.

Trước khi triển khai tính năng mới, Agent phải đọc:

- `docs/requirements.md`
- `docs/actors-and-roles.md`
- File flow liên quan trong `docs/flows/`

## 2. Công nghệ và cấu trúc

- Frontend: TypeScript, React, Next.js.
- Backend: TypeScript, NestJS, REST API.
- Database: PostgreSQL.
- API documentation: OpenAPI/Swagger.
- Backend API development port: `5000`.
- Frontend development port: `3001`.
- Frontend gọi Backend qua `NEXT_PUBLIC_API_BASE_URL`.

Cấu trúc chính:

- `frontend/src/app/`: route theo actor.
- `frontend/src/components/`: component UI dùng chung.
- `frontend/src/features/`: logic và UI dùng chung theo domain.
- `frontend/src/lib/`: API client và utility dùng chung.
- `backend/src/modules/`: module theo business domain.
- `backend/src/common/`: guard, decorator, DTO/type và utility dùng chung.
- `backend/src/config/`: cấu hình backend.
- `database/`: schema, seed và migrations.
- `docs/`: requirements, actor/role, API và flow documentation.

## 3. Phạm vi thay đổi của Agent

- Chỉ sửa code trong module liên quan trực tiếp đến task được giao.
- Không tự ý chỉnh sửa lan sang module khác.
- Chỉ thay đổi module khác khi thật sự cần để hoàn thành task, ví dụ:
  - shared type hoặc DTO đặt ở `backend/src/common/`;
  - API contract cần cập nhật ở `docs/api-documentation.md`;
  - migration/schema bắt buộc để hỗ trợ nghiệp vụ mới.
- Khi phải sửa ngoài module chính, Agent phải nêu rõ lý do trong phần tóm tắt.
- Không tự ý đổi cấu trúc thư mục, tên module, public API hoặc convention hiện có.
- Không thực hiện refactor không liên quan đến task.
- Không xóa hoặc hoàn tác thay đổi của người dùng.

## 4. Quy tắc domain và backend

- Backend module được tổ chức theo domain: `auth`, `orders`, `documents`, `compliance`, `fleet`, `routes`, `tracking`, `incidents`, `notifications`, `reports`.
- Mỗi business rule phải nằm ở module sở hữu domain đó.
- Authorization phải được kiểm tra ở server-side; route frontend không phải boundary bảo mật.
- Customer chỉ được truy cập dữ liệu thuộc tài khoản của mình.
- Driver/Escort chỉ được cập nhật chuyến đi được phân công.
- Tracking event và audit history phải giữ lịch sử; không sửa đè event cũ nếu không có lý do và audit record.
- Flow 5 và Flow 6 là optional, không được làm hỏng hoặc chặn Flow 1 đến Flow 4.
- Logic kiểm dịch, hải quan và hồ sơ theo quốc gia/cửa khẩu phải giữ được thứ tự trạng thái, thời hạn, người xử lý và lý do từ chối.
- Không hard-code secret, API key, password hoặc thông tin nhạy cảm.

## 5. Quy tắc route theo actor (frontend)

Mỗi thư mục trong `frontend/src/app/` ứng với một actor và chỉ chứa UI/logic phục vụ actor đó:

- `(auth)/`: đăng nhập và xác thực.
- `manager/`: Logistics Manager.
- `specialist/`: Transport Specialist.
- `coordinator/`: Fleet & Route Coordinator.
- `driver/`: Vehicle Driver / Escort.
- `customer/`: Customer.

Component dùng chung đặt ở `frontend/src/components/`. Logic nghiệp vụ dùng chung đặt ở `frontend/src/features/`. API client và utility dùng chung đặt ở `frontend/src/lib/`.

Không đặt business logic dùng chung vào một route actor cụ thể.

## 6. Quy tắc tài liệu và môi trường

- Khi thêm hoặc thay đổi business rule, cập nhật flow document tương ứng trong `docs/flows/`.
- Khi thay đổi actor hoặc quyền hạn, cập nhật `docs/actors-and-roles.md`.
- Khi thay đổi API contract, cập nhật `docs/api-documentation.md`.
- Khi thay đổi entity hoặc quan hệ dữ liệu, cập nhật `docs/erd.md` và migration/schema liên quan.
- Khi thêm biến môi trường, luôn cập nhật `.env.example`.
- Không commit file `.env` thật hoặc secret.
- Không dùng file rỗng giả làm asset hợp lệ, ví dụ ảnh ERD giả.

## 7. Git workflow

- Nhánh làm việc chính của nhóm là `dev`.
- Không push thẳng lên `main`.
- Tạo branch tính năng từ `dev`, ví dụ:

```bash
git switch dev
git pull origin dev
git switch -c feature/orders
```

- Commit message theo dạng `<scope>: <mô tả ngắn>`, ví dụ:

```text
config: run backend on port 5000
feat(orders): add create transport request API
fix(tracking): correct status enum
```

- Agent tạo commit rõ ràng, không gộp nhiều thay đổi không liên quan vào một commit.
- Trước khi push, Agent phải kiểm tra `git status`, kiểm tra diff và tóm tắt các file đã đổi cho người dùng xác nhận, đặc biệt khi thay đổi lớn hơn 5 file.
- Không commit hoặc push nếu người dùng chỉ yêu cầu phân tích, trừ khi người dùng nói rõ cần thực hiện.

## 8. Nguyên tắc khi Agent thực hiện task

1. Đọc kỹ `docs/requirements.md` và file flow liên quan trước khi code tính năng mới.
2. Xác định module sở hữu behavior trước khi chỉnh sửa.
3. Không tự ý đổi cấu trúc thư mục, tên module hoặc convention đặt tên đã có.
4. Nếu yêu cầu mơ hồ hoặc có thể ảnh hưởng nhiều module, hỏi lại người dùng trước khi triển khai.
5. Luôn cập nhật `.env.example` khi thêm biến môi trường; không hard-code secret/API key trong code.
6. Ưu tiên code đơn giản, dễ đọc, giữ public API ổn định nếu task không yêu cầu đổi.
7. Chỉ thêm comment cho logic nghiệp vụ phức tạp; đặc biệt là luồng kiểm dịch/hải quan có nhiều bước theo quốc gia.
8. Sau lần chỉnh sửa đầu tiên, chạy một kiểm tra tập trung ngay khi có thể: test liên quan, typecheck, lint hoặc build hẹp nhất.
9. Trước khi hoàn tất, kiểm tra lỗi compile/lint nếu project đã có tool tương ứng và chạy test liên quan.
10. Cuối task, tóm tắt ngắn gọn: đã đổi gì, đổi ở đâu, đã kiểm tra gì và người dùng cần làm gì tiếp theo nếu có.

## 9. Quy tắc an toàn thay đổi

- Không dùng lệnh phá hủy như `git reset --hard` hoặc `git checkout --` nếu chưa được người dùng yêu cầu rõ ràng.
- Không sửa các file thay đổi không liên quan.
- Nếu phát hiện thay đổi chưa commit của người dùng trong file cần sửa, đọc và làm việc cùng thay đổi đó; không ghi đè mù.
- Nếu không thể chạy test do project chưa cài dependency hoặc chưa có script, phải nói rõ trong kết quả cuối.
