import { BadRequestException } from '@nestjs/common';

export function vietnamCalendarDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function calendarDate(value: string, label: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    throw new BadRequestException(`${label} phải là ngày YYYY-MM-DD hoặc ISO có múi giờ`);
  }
  const day = value.slice(0, 10);
  const time = value.includes('T') ? value.slice(11, 19).split(':').map(Number) : null;
  const date = new Date(`${day}T00:00:00.000Z`);
  if (Number(day.slice(0, 4)) < 1000 || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day || !Number.isFinite(new Date(value).getTime()) ||
    (time && (time[0] > 23 || time[1] > 59 || time[2] > 59))) {
    throw new BadRequestException(`${label} không phải ngày hợp lệ`);
  }
  return date;
}

export function validateRequestDates(departure: string, arrival?: string | null, now = new Date(), checkPast = true) {
  const requestedDate = calendarDate(departure, 'Ngày đi mong muốn');
  const expectedArrivalDate = arrival == null ? null : calendarDate(arrival, 'Ngày đến mong muốn');
  if (checkPast && departure.slice(0, 10) < vietnamCalendarDay(now)) throw new BadRequestException('Ngày đi mong muốn không được ở quá khứ (giờ Việt Nam)');
  if (expectedArrivalDate && expectedArrivalDate < requestedDate) throw new BadRequestException('Ngày đến mong muốn phải từ ngày đi mong muốn trở đi');
  return { requestedDate, expectedArrivalDate };
}
