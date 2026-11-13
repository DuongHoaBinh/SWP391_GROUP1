'use client';

import { bookingName, type BookingType } from '../booking-policy';
import { Calendar, FileCheck, Truck, ShieldCheck, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

export function BookingChoice({ value, onChange, horseCount }: {
  value: BookingType; onChange: (value: BookingType) => void; horseCount: number;
}) {
  return (
    <fieldset className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <legend className="px-2 text-base font-bold text-slate-900">Hình thức đặt chỗ vận chuyển (Booking Type)</legend>
      <p className="text-sm text-slate-600">
        Áp dụng linh hoạt cho cả đường bộ liên tỉnh và đường bay chuyên dụng. Vui lòng chọn hình thức phù hợp với nhu cầu vận chuyển của bạn.
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(['shared_stall', 'dedicated_charter'] as const).map(type => {
          const isSelected = value === type;
          return (
            <label
              key={type}
              className={`flex cursor-pointer flex-col justify-between rounded-xl border-2 p-4 transition-all ${
                isSelected
                  ? 'border-blue-600 bg-blue-50/70 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="bookingType"
                  value={type}
                  checked={isSelected}
                  onChange={() => onChange(type)}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-slate-900">
                      {type === 'shared_stall' ? '🟢 Ghép chuồng (Shared Stall)' : '🔵 Bao trọn chuyến (Dedicated Charter)'}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                    {type === 'shared_stall'
                      ? 'Tiết kiệm chi phí bằng cách ghép ô chuồng cùng các chủ ngựa khác trên cùng hành lang vận chuyển. Cước tính theo từng ô chuồng.'
                      : 'Xe thùng hoặc khoang bay chuyên dụng dành riêng 100% cho đoàn ngựa của bạn. Ưu tiên đi thẳng, giờ xuất phát theo lịch hẹn riêng.'}
                  </p>
                </div>
              </div>

              <div className="mt-3 border-t border-slate-200/80 pt-2 text-xs font-semibold text-blue-800">
                {type === 'shared_stall'
                  ? `💡 Khuyên dùng cho 1–2 ngựa ${horseCount > 0 && horseCount <= 2 ? '(Phù hợp với số lượng bạn đang chọn)' : ''}`
                  : `⭐ Thích hợp từ 3 ngựa trở lên hoặc ngựa đua ưu tiên thi đấu ${horseCount >= 3 ? '(Gợi ý lý tưởng cho đoàn của bạn)' : ''}`}
              </div>
            </label>
          );
        })}
      </div>

      {/* POLICY & SLA BOX FOR SHARED STALL */}
      {value === 'shared_stall' && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-slate-800">
          <div className="flex items-center gap-2 font-bold text-amber-900">
            <Clock className="h-5 w-5 text-amber-600" />
            <span>Quy định thời gian & Điều kiện Ghép chuồng (Shared Stall SLA)</span>
          </div>
          <p className="mt-1 text-xs text-amber-800">
            Vận chuyển ghép chuồng đòi hỏi quy trình gom đơn và xin cấp phép kiểm dịch thú y liên tỉnh (24–48h). Quý khách vui lòng lưu ý các mốc thời gian sau:
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-amber-200/80 bg-white p-3 shadow-xs">
              <div className="flex items-center gap-1.5 font-bold text-amber-900 text-xs">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-800 font-bold text-[11px]">1</span>
                <span>Đặt chỗ trước ≥ 7 ngày</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-600 leading-normal">
                Hệ thống mở chuyến gom các đơn hàng đi chung trục đường (Bắc - Nam hoặc chuyến bay cố định).
              </p>
            </div>

            <div className="rounded-lg border border-amber-200/80 bg-white p-3 shadow-xs">
              <div className="flex items-center gap-1.5 font-bold text-amber-900 text-xs">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-800 font-bold text-[11px]">2</span>
                <span>Nộp hồ sơ trước ≥ 5 ngày</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-600 leading-normal">
                Upload sổ tiêm cúm & xét nghiệm máu để cơ quan Thú y thẩm định và cấp Giấy kiểm dịch động vật.
              </p>
            </div>

            <div className="rounded-lg border border-amber-200/80 bg-white p-3 shadow-xs">
              <div className="flex items-center gap-1.5 font-bold text-amber-900 text-xs">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-800 font-bold text-[11px]">3</span>
                <span>Chốt sổ trước 72h (3 ngày)</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-600 leading-normal">
                Khóa nhận đơn; Coordinator lên lộ trình đón/trả multi-stop, gán xe và phát hành hóa đơn (Invoice).
              </p>
            </div>

            <div className="rounded-lg border border-amber-200/80 bg-white p-3 shadow-xs">
              <div className="flex items-center gap-1.5 font-bold text-amber-900 text-xs">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-800 font-bold text-[11px]">4</span>
                <span>Thanh toán trong 24h</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-600 leading-normal">
                Quét mã QR SePay thanh toán cước chuyến đi trước giờ xe lăn bánh tối thiểu 24h để khóa slot chuồng.
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-100/70 p-2.5 text-xs text-amber-950">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <strong>Chính sách linh hoạt khi chưa đủ số lượng ghép:</strong> Nếu đến ngày chốt sổ (72h trước giờ chạy) chưa gom đủ người ghép, quý khách có thể:
              <span className="ml-1 font-medium text-slate-800">
                (1) <strong>Lùi ngày khởi hành</strong> sang chuyến ghép kế tiếp hoàn toàn <em>miễn phí</em>; hoặc (2) <strong>Nâng cấp Bao trọn chuyến (Charter)</strong> bù chênh lệch để xe chạy chở riêng ngay trong ngày.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* POLICY BOX FOR DEDICATED CHARTER */}
      {value === 'dedicated_charter' && (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-slate-800">
          <div className="flex items-center gap-2 font-bold text-blue-900">
            <Truck className="h-5 w-5 text-blue-600" />
            <span>Đặc quyền Dịch vụ Bao trọn chuyến (Dedicated Charter)</span>
          </div>
          <p className="mt-1 text-xs text-blue-800 leading-relaxed">
            Xe chuyên dụng phục vụ độc quyền đoàn ngựa của bạn. Không đón trả ngựa của chủ khác, lộ trình chạy thẳng tối ưu thời gian và thể lực cho ngựa đua.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-4 text-xs font-medium text-slate-700">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Chủ động hẹn giờ xuất phát</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Thời gian đặt linh hoạt (tối thiểu 48h để làm kiểm dịch)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Bác sĩ thú y / Groom theo sát toàn tuyến</span>
            </div>
          </div>
        </div>
      )}
    </fieldset>
  );
}
