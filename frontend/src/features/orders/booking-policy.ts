export type BookingType = 'shared_stall' | 'dedicated_charter';
export const bookingNames: Record<BookingType, string> = {
  shared_stall: 'Ghép ô chuồng (Shared Stall)',
  dedicated_charter: 'Bao nguyên xe / Bao chuyến (Dedicated Charter)',
};
export function bookingName(value?: BookingType) { return bookingNames[value ?? 'shared_stall']; }

export function previewBookingQuote(input: string, type: BookingType, count: number, currency: 'VND' | 'USD' = 'VND') {
  const value = Number(input);
  const unit = currency === 'USD' ? Math.round(value * 25400) : value;
  const freight = type === 'shared_stall' ? unit * count : unit;
  const valid = input.trim() !== '' && Number.isFinite(value) && Number.isSafeInteger(unit) && unit > 0 &&
    Number.isSafeInteger(count) && count > 0 && Number.isSafeInteger(freight) && freight <= 9999999999999;
  return { unit: valid ? unit : 0, freight: valid ? freight : 0, error: valid ? null : 'Vui lòng nhập giá VNĐ nguyên dương hợp lệ, tổng cước không vượt giới hạn đơn hàng.' };
}

export function bookingQuotePayload(input: string, type: BookingType, count: number, currency: 'VND' | 'USD') {
  const quote = previewBookingQuote(input, type, count, currency);
  if (quote.error) throw new Error(quote.error);
  return { bookingType: type, quotedHorseCount: count,
    ...(type === 'shared_stall' ? { stallUnitPrice: quote.unit } : { transportCost: quote.freight }) };
}
