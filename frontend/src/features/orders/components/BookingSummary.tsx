import { bookingName, previewBookingQuote, type BookingType } from '../booking-policy';
import { vnd } from '../insurance-policy';
import { CostSummary } from './InsuranceSummary';

export function BookingSummary({ bookingType, horseCount, stallUnitPrice }: {
  bookingType?: BookingType; horseCount: number; stallUnitPrice?: number | null;
}) {
  return <div className="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm" aria-label="Hình thức đặt chỗ">
    <p className="font-semibold text-slate-900">{bookingName(bookingType)}</p>
    <p className="text-slate-600">{(bookingType ?? 'shared_stall') === 'shared_stall'
      ? stallUnitPrice == null ? `${horseCount} ô chuồng cho ${horseCount} ngựa · Báo giá theo từng ô, ghép cùng hành lang lộ trình.` : `${vnd(stallUnitPrice)} / ô × ${horseCount} ngựa = ${vnd(stallUnitPrice * horseCount)} cước cơ bản.`
      : `Giá trọn gói riêng cho đoàn ${horseCount} ngựa · Ưu tiên đi thẳng, giờ xuất phát theo yêu cầu và kế hoạch được xác nhận.`}</p>
  </div>;
}

export function BookingQuoteSummary({ input, bookingType, horseCount, currency, insuranceFee }: {
  input: string; bookingType?: BookingType; horseCount: number; currency: 'VND' | 'USD'; insuranceFee: number;
}) {
  const quote = previewBookingQuote(input, bookingType ?? 'shared_stall', horseCount, currency);
  return <div className="space-y-3">
    <BookingSummary bookingType={bookingType} horseCount={horseCount} stallUnitPrice={bookingType === 'dedicated_charter' || quote.error ? null : quote.unit} />
    <CostSummary transportCost={quote.error ? null : quote.freight} insuranceFee={insuranceFee} />
    {quote.error && <p role="alert" className="text-sm text-red-700">{quote.error}</p>}
    {!quote.error && quote.freight + insuranceFee > 9999999999999 && <p role="alert" className="text-sm text-red-700">Tổng cước và bảo hiểm vượt giới hạn đơn hàng.</p>}
  </div>;
}
