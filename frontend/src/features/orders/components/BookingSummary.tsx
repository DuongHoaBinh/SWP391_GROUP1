import { bookingName, previewBookingQuote, type BookingType } from '../booking-policy';
import { vnd } from '../insurance-policy';
import { CostSummary } from './InsuranceSummary';
import { Check, Clock, AlertCircle, Calendar, Truck, ShieldCheck, ArrowRight } from 'lucide-react';

export function BookingSummary({
  bookingType,
  horseCount,
  stallUnitPrice,
  status,
  departureDate,
}: {
  bookingType?: BookingType;
  horseCount: number;
  stallUnitPrice?: number | null;
  status?: string;
  departureDate?: string;
}) {
  const isShared = (bookingType ?? 'shared_stall') === 'shared_stall';

  // Determine current timeline step for shared stall
  // 1: Submitted -> 2: Doc check -> 3: Planning/Cutoff -> 4: Payment -> 5: Departure
  let activeStep = 1;
  const normalizedStatus = (status || '').toLowerCase();

  if (['ready_to_depart', 'in_transit', 'delivered', 'completed'].includes(normalizedStatus)) {
    activeStep = 5;
  } else if (['invoiced', 'route_approved', 'confirmed'].includes(normalizedStatus)) {
    activeStep = 4;
  } else if (['planning', 'pending_approval'].includes(normalizedStatus)) {
    activeStep = 3;
  } else if (['approved'].includes(normalizedStatus)) {
    activeStep = 2;
  } else {
    activeStep = 1;
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Hình thức đặt chỗ">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{isShared ? '🟢' : '🔵'}</span>
          <div>
            <h4 className="text-sm font-bold text-slate-900">{bookingName(bookingType)}</h4>
            <p className="text-xs text-slate-500">
              {isShared
                ? 'Dịch vụ ghép chuồng theo hành lang · Đặt trước ≥ 7 ngày · Chốt sổ trước 72h'
                : 'Dịch vụ bao trọn xe chuyên dụng · Chạy thẳng độc quyền · Lịch trình linh hoạt'}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          {horseCount} ngựa ({horseCount} ô chuồng)
        </span>
      </div>

      <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
        {isShared ? (
          stallUnitPrice == null ? (
            <p className="text-xs leading-relaxed text-slate-600">
              Đơn hàng đang chờ quản lý duyệt báo giá theo từng ô chuồng. Cước = <span className="font-semibold text-slate-900">Đơn giá 1 ô × {horseCount} ngựa</span>.
            </p>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Cước cơ bản theo ô chuồng:</span>
              <span className="font-semibold text-slate-900">
                {vnd(stallUnitPrice)} / ô × {horseCount} ngựa = <strong className="text-blue-700">{vnd(stallUnitPrice * horseCount)}</strong>
              </span>
            </div>
          )
        ) : (
          <p className="text-xs text-slate-600">
            Giá cước trọn gói cho toàn bộ xe thùng chuyên dụng vận chuyển đoàn {horseCount} ngựa. Không đón/trả phụ, ưu tiên tuyến thẳng.
          </p>
        )}
      </div>

      {/* CONSOLIDATION TIMELINE TRACKER (FOR SHARED STALL) */}
      {isShared && (
        <div className="mt-3 rounded-lg border border-blue-100 bg-gradient-to-r from-blue-50/50 to-indigo-50/40 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-blue-600" />
              Tiến độ Ghép chuồng & Chốt lộ trình (Consolidation SLA)
            </span>
            {departureDate && (
              <span className="text-[11px] font-semibold text-blue-800">
                Ngày đi dự kiến: {departureDate}
              </span>
            )}
          </div>

          {/* Stepper Visual */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5 text-center text-[11px]">
            {/* Step 1 */}
            <div className={`rounded-md p-2 border transition-all ${
              activeStep > 1
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                : activeStep === 1
                ? 'border-blue-500 bg-white shadow-xs font-bold text-blue-900'
                : 'border-slate-200 bg-white/60 text-slate-500'
            }`}>
              <div className="font-semibold">1. Đặt chỗ</div>
              <div className="mt-0.5 text-[10px] text-slate-500">Trước ≥ 7 ngày</div>
              <div className="mt-1 font-medium text-[10px]">
                {activeStep > 1 ? '✓ Đã tạo' : activeStep === 1 ? '● Đang xử lý' : 'Chờ'}
              </div>
            </div>

            {/* Step 2 */}
            <div className={`rounded-md p-2 border transition-all ${
              activeStep > 2
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                : activeStep === 2
                ? 'border-blue-500 bg-white shadow-xs font-bold text-blue-900'
                : 'border-slate-200 bg-white/60 text-slate-500'
            }`}>
              <div className="font-semibold">2. Hồ sơ thú y</div>
              <div className="mt-0.5 text-[10px] text-slate-500">Trước ≥ 5 ngày</div>
              <div className="mt-1 font-medium text-[10px]">
                {activeStep > 2 ? '✓ Hợp lệ' : activeStep === 2 ? '● Thẩm định' : 'Chờ'}
              </div>
            </div>

            {/* Step 3 */}
            <div className={`rounded-md p-2 border transition-all ${
              activeStep > 3
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                : activeStep === 3
                ? 'border-blue-500 bg-white shadow-xs font-bold text-blue-900'
                : 'border-slate-200 bg-white/60 text-slate-500'
            }`}>
              <div className="font-semibold">3. Chốt sổ tuyến</div>
              <div className="mt-0.5 text-[10px] text-slate-500">Trước 72h (D-3)</div>
              <div className="mt-1 font-medium text-[10px]">
                {activeStep > 3 ? '✓ Đã chốt' : activeStep === 3 ? '● Đang gom xe' : 'Chờ'}
              </div>
            </div>

            {/* Step 4 */}
            <div className={`rounded-md p-2 border transition-all ${
              activeStep > 4
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                : activeStep === 4
                ? 'border-blue-500 bg-white shadow-xs font-bold text-blue-900'
                : 'border-slate-200 bg-white/60 text-slate-500'
            }`}>
              <div className="font-semibold">4. Thanh toán</div>
              <div className="mt-0.5 text-[10px] text-slate-500">Trước 24h</div>
              <div className="mt-1 font-medium text-[10px]">
                {activeStep > 4 ? '✓ Đã thanh toán' : activeStep === 4 ? '● Quét SePay' : 'Chờ'}
              </div>
            </div>

            {/* Step 5 */}
            <div className={`rounded-md p-2 border transition-all col-span-2 sm:col-span-1 ${
              activeStep === 5
                ? 'border-emerald-500 bg-emerald-50 font-bold text-emerald-900'
                : 'border-slate-200 bg-white/60 text-slate-500'
            }`}>
              <div className="font-semibold">5. Khởi hành</div>
              <div className="mt-0.5 text-[10px] text-slate-500">Ngày D</div>
              <div className="mt-1 font-medium text-[10px]">
                {activeStep === 5 ? '● Đang chạy' : 'Chờ'}
              </div>
            </div>
          </div>

          {/* Contextual Status Guidance */}
          <div className="mt-3 text-xs text-blue-900">
            {activeStep === 1 && (
              <p>💡 Đơn hàng đã ghi nhận. Vui lòng hoàn tất nộp giấy tờ tiêm phòng và xét nghiệm máu của ngựa trước ngày khởi hành tối thiểu 5 ngày.</p>
            )}
            {activeStep === 2 && (
              <p>📋 Đơn hàng đã được duyệt sơ bộ. Chuyên viên đang hoàn thiện hồ sơ xin kiểm dịch thú y liên tỉnh.</p>
            )}
            {activeStep === 3 && (
              <p>🚚 <strong>Điều phối viên đang gom đơn ghép tuyến & sắp xếp ô chuồng.</strong> Lộ trình đón/trả và hóa đơn sẽ được xác nhận chậm nhất trước giờ chạy 72 giờ.</p>
            )}
            {activeStep === 4 && (
              <p>💳 <strong>Lộ trình đã được chốt thành công!</strong> Quý khách vui lòng quét mã QR SePay bên dưới để thanh toán và khóa slot chuồng trước giờ xuất phát.</p>
            )}
            {activeStep === 5 && (
              <p>🏁 Chuyến đi đã sẵn sàng hoặc đang lăn bánh đón/trả ngựa theo lộ trình multi-stop.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function BookingQuoteSummary({ input, bookingType, horseCount, currency, insuranceFee }: {
  input: string; bookingType?: BookingType; horseCount: number; currency: 'VND' | 'USD'; insuranceFee: number;
}) {
  const quote = previewBookingQuote(input, bookingType ?? 'shared_stall', horseCount, currency);
  return (
    <div className="space-y-3">
      <BookingSummary bookingType={bookingType} horseCount={horseCount} stallUnitPrice={bookingType === 'dedicated_charter' || quote.error ? null : quote.unit} />
      <CostSummary transportCost={quote.error ? null : quote.freight} insuranceFee={insuranceFee} />
      {quote.error && <p role="alert" className="text-sm text-red-700">{quote.error}</p>}
      {!quote.error && quote.freight + insuranceFee > 9999999999999 && <p role="alert" className="text-sm text-red-700">Tổng cước và bảo hiểm vượt giới hạn đơn hàng.</p>}
    </div>
  );
}
