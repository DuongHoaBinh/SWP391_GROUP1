# Flow 6: Handover and Trip Acceptance (Optional)

## Actors

Vehicle Driver / Escort, Customer or receiving representative, Logistics Manager

## Main path

1. Driver/escort presents the horse and required documents at the agreed handover location.
2. Receiving party checks horse identity, condition, document set, and delivered quantity.
3. Receiving party confirms acceptance or records an exception with evidence.
4. The system stores the handover time, location, parties, checklist, signature/evidence, and notes.
5. Logistics Manager resolves exceptions and closes the trip when acceptance requirements pass.

**Owner:** `backend/src/modules/tracking` with handover records

## Phạm vi Design-Ready (Release 2 Extension Specification — BA Spec v3.1)

> [!NOTE]
> Theo `DEC-01`, Flow 6 là luồng tùy chọn (**Release 2 — Design-Ready**). Khi chưa kích hoạt, Flow 4 vẫn hoàn tất chuyến đi bình thường. Phân quyền tách biệt 2 dòng trên Ma trận RACI tại [actors-and-roles.md](file:///f:/SWP/Project/SWP391_GROUP1/docs/actors-and-roles.md): Dòng 18 (Customer `A` khi ký nhận/mở tranh chấp) và Dòng 19 (Logistics Manager `A` khi giải quyết tranh chấp & đóng hồ sơ).

### Quy tắc Nghiệp vụ & Điểm Nối Kiến trúc

1. **Checklist Bàn giao cấp Cá thể Ngựa (`delivery_handover` gắn `shipment_horse_id`):** Biên bản nghiệm thu bắt buộc kiểm đếm theo từng con ngựa (khớp tên, Microchip, Hộ chiếu, số lượng, tình trạng `healthy` | `minor_issue` | `needs_attention`, và đủ bộ hồ sơ pháp lý/thú y bản gốc) để làm căn cứ bảo hiểm.
2. **Bằng chứng Bắt buộc khi Tranh chấp (`disputed`):** Người nhận chỉ được chọn `disputed` khi có mô tả ngoại lệ chi tiết và tối thiểu 1 tệp bằng chứng (ảnh/biên bản).
3. **Mốc Chấm dứt Trách nhiệm (`confirmed`) & Giải quyết Ngoại lệ:** Thời điểm `confirmed` kèm chữ ký/xác nhận là mốc pháp lý chốt chuyển giao rủi ro vận chuyển. Nếu `disputed`, Logistics Manager đối chiếu nhật ký sức khỏe (Flow 4), hồ sơ sự cố (Flow 5) và hạn mức bảo hiểm đã chụp trên `shipment_horse` (`max_compensation`, `emergency_vet_covered`) để chốt phương án xử lý và đóng chuyến.
