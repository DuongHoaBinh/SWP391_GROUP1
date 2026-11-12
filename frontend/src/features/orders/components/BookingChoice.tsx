'use client';

import { bookingName, type BookingType } from '../booking-policy';

export function BookingChoice({ value, onChange, horseCount }: {
  value: BookingType; onChange: (value: BookingType) => void; horseCount: number;
}) {
  return <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
    <legend className="px-1 font-semibold text-slate-900">Hình thức đặt chỗ vận chuyển</legend>
    <p className="text-sm text-slate-600">Áp dụng cho cả đường bộ và hàng không. Gợi ý theo số ngựa, bạn có thể chọn cả hai hình thức.</p>
    {(['shared_stall', 'dedicated_charter'] as const).map(type => <label key={type}
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${value === type ? 'border-blue-500 bg-blue-50' : 'border-slate-200'}`}>
      <input type="radio" name="bookingType" value={type} checked={value === type} onChange={() => onChange(type)} className="mt-1 h-4 w-4 shrink-0" />
      <span className="text-sm"><strong className="block text-slate-900">{type === 'shared_stall' ? '🟢' : '🔵'} {bookingName(type)}</strong>
        <span className="mt-1 block text-slate-600">{type === 'shared_stall'
          ? 'Tiết kiệm chi phí, ghép theo số ô chuồng trên tuyến cố định. Đi cùng ngựa của các chủ khác trên cùng hành lang. Cước = đơn giá mỗi ô × số ngựa.'
          : 'Dành riêng cho đoàn ngựa của bạn, xuất phát theo giờ yêu cầu. Ưu tiên đi thẳng, lịch trình linh hoạt. Cước trọn gói toàn chuyến.'}</span>
        <span className="mt-2 block font-medium text-blue-700">{type === 'shared_stall'
          ? `Khuyên dùng cho 1–2 ngựa${horseCount > 0 && horseCount <= 2 ? ' · Phù hợp với số lượng đang chọn' : ''}`
          : `Thích hợp từ 3 ngựa hoặc ngựa cần chăm sóc đặc biệt${horseCount >= 3 ? ' · Gợi ý cho đoàn của bạn' : ''}`}</span>
      </span>
    </label>)}
  </fieldset>;
}
