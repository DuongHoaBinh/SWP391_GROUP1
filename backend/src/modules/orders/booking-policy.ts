import { BadRequestException, ConflictException } from '@nestjs/common';

export type BookingType = 'shared_stall' | 'dedicated_charter';
export interface BookingQuote {
  stallUnitPrice?: number;
  transportCost?: number;
  totalCost?: number;
  bookingType?: BookingType;
  quotedHorseCount?: number;
}

/** Đơn mới mặc định bao chuyến; shared_stall chỉ còn ở đơn cũ (bỏ gom chuyến sau review 11/2026). */
export function normalizeBookingType(value?: BookingType): BookingType {
  const booking = value ?? 'dedicated_charter';
  if (!['shared_stall', 'dedicated_charter'].includes(booking)) throw new BadRequestException('Hình thức đặt chỗ không hợp lệ');
  return booking;
}

export const SHARED_STALL_DISCONTINUED_MESSAGE =
  'Hình thức ghép chuyến (shared_stall) đã ngừng áp dụng. Mỗi đơn đi xe riêng (dedicated_charter).';

/** Hình thức cho đơn mới: luôn bao chuyến; gửi shared_stall trả 400. */
export function assertNewBookingType(value?: BookingType | string | null): BookingType {
  if (value === 'shared_stall') throw new BadRequestException(SHARED_STALL_DISCONTINUED_MESSAGE);
  return normalizeBookingType((value ?? undefined) as BookingType | undefined);
}

/** Khi khách gửi lại đơn: giữ nguyên hình thức cũ, được đổi sang bao chuyến, không được đổi sang ghép chuyến. */
export function resolveResubmitBookingType(requested: BookingType | undefined, current: BookingType): BookingType {
  if (requested === undefined || requested === current) return normalizeBookingType(current);
  return assertNewBookingType(requested);
}

export function calculateBookingQuote(booking: BookingType, horseCount: number, quote: BookingQuote) {
  normalizeBookingType(booking);
  if (!Number.isSafeInteger(horseCount) || horseCount < 1) throw new BadRequestException('Số lượng ngựa không hợp lệ');
  if ((quote.bookingType !== undefined && quote.bookingType !== booking) ||
      (quote.quotedHorseCount !== undefined && quote.quotedHorseCount !== horseCount)) {
    throw new ConflictException('Hình thức đặt chỗ hoặc số ngựa đã thay đổi. Vui lòng tải lại báo giá');
  }
  let stallUnitPrice: number | null = null;
  let transportCost: number;
  if (quote.stallUnitPrice !== undefined) {
    if (typeof quote.stallUnitPrice !== 'number') throw new BadRequestException('Đơn giá stall phải là số VNĐ nguyên hợp lệ');
    if (booking !== 'shared_stall') throw new BadRequestException('Bao chuyến dùng giá trọn gói, không dùng đơn giá stall');
    if (quote.bookingType !== booking || quote.quotedHorseCount !== horseCount) throw new BadRequestException('Báo giá stall phải xác nhận hình thức và số lượng ngựa');
    if (quote.transportCost !== undefined || quote.totalCost !== undefined) throw new BadRequestException('Chỉ gửi đơn giá stall, server sẽ tính tổng cước');
    stallUnitPrice = quote.stallUnitPrice;
    transportCost = stallUnitPrice * horseCount;
  } else {
    if (quote.transportCost !== undefined && quote.totalCost !== undefined && quote.transportCost !== quote.totalCost) {
      throw new BadRequestException('Chỉ gửi một giá trị cước vận chuyển cơ bản nhất quán');
    }
    // Legacy clients send total freight; never reinterpret an old total as a per-stall price.
    if (quote.transportCost == null && quote.totalCost == null) throw new BadRequestException('Vui lòng nhập cước vận chuyển cơ bản');
    transportCost = quote.transportCost ?? quote.totalCost!;
  }
  if (!Number.isSafeInteger(transportCost) || transportCost <= 0 || transportCost > 9999999999999 ||
      (stallUnitPrice !== null && (!Number.isSafeInteger(stallUnitPrice) || stallUnitPrice <= 0))) {
    throw new BadRequestException('Cước vận chuyển phải là VNĐ nguyên lớn hơn 0 trong giới hạn đơn hàng');
  }
  return { transportCost, stallUnitPrice };
}
