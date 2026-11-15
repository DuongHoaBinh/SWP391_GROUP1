export const TRANSPORT_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export function vietnamDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TRANSPORT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function validCalendarDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number(value.slice(0, 4)) >= 1000 && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function requestedDateError(departure: string, arrival?: string, today = vietnamDateString()) {
  if (!validCalendarDay(departure)) return 'Ngày đi mong muốn không hợp lệ.';
  if (departure < today) return 'Ngày đi mong muốn không được ở quá khứ (giờ Việt Nam).';
  if (arrival && !validCalendarDay(arrival)) return 'Ngày đến mong muốn không hợp lệ.';
  if (arrival && arrival < departure) return 'Ngày đến mong muốn phải từ ngày đi mong muốn trở đi.';
  return null;
}
export function vietnamDateTimeInput(iso?: string | null) {
  if (!iso || !Number.isFinite(new Date(iso).getTime())) return '';
  return new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(0, 16);
}
export function vietnamInputToIso(value: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !validCalendarDay(value.slice(0, 10))) return null;
  const instant = new Date(`${value}:00+07:00`);
  return Number.isFinite(instant.getTime()) && vietnamDateTimeInput(instant.toISOString()) === value ? instant.toISOString() : null;
}
export function calendarDayLabel(value?: string | null) {
  const day = value && value.includes('T') && Number.isFinite(new Date(value).getTime()) ? vietnamDateString(new Date(value)) : value;
  return day && validCalendarDay(day) ? day.split('-').reverse().join('/') : 'Chưa xác định';
}
export function scheduleTimeLabel(value?: string | null) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Chưa lập lịch';
  return new Date(value).toLocaleString('vi-VN', { timeZone: TRANSPORT_TIME_ZONE, dateStyle: 'short', timeStyle: 'short' });
}
