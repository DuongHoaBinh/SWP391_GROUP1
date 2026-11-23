/**
 * Giờ cấm xe tải nặng nội đô (Step 9, góp ý G9). Hàm thuần, không truy cập DB.
 *
 * - Vùng cấm là vòng tròn quanh trung tâm thành phố (không xét từng tuyến đường).
 * - Giờ cấm lưu theo giờ địa phương (mặc định Asia/Ho_Chi_Minh), có thể qua nửa đêm (from > to).
 * - Ngày có ngoại lệ (lễ, Tết) THAY THẾ khung cấm thường của thành phố trong ngày đó.
 * - Quy đổi UTC <-> giờ địa phương bằng Intl.DateTimeFormat (không dùng thư viện ngày tháng).
 * Dữ liệu quy tắc là dữ liệu demo, phải đối chiếu văn bản gốc của UBND/Sở GTVT.
 */
import { haversineKm } from '../routes/geo-policy';

export const DEFAULT_TZ = 'Asia/Ho_Chi_Minh';

export interface GeoPointLike {
  lat: number;
  lng: number;
}

export interface CityRestrictionRule {
  id?: number;
  city: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  appliesToHeavyTruck: boolean;
  /** 'HH:mm' hoặc 'HH:mm:ss', giờ địa phương */
  bannedFrom: string;
  bannedTo: string;
  /** ISO weekday 1 = Thứ 2 ... 7 = Chủ nhật */
  daysOfWeek: number[];
  legalReference?: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  isActive?: boolean;
  isDemoData?: boolean;
}

export interface CityRestrictionException {
  id?: number;
  city: string;
  exceptionDate: string; // YYYY-MM-DD
  bannedFrom: string;
  bannedTo: string;
  note?: string | null;
}

export interface LocalDateTime {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  isoWeekday: number;
}

export interface TimeWindow {
  from: string;
  to: string;
}

export const DEFAULT_NIGHT_WINDOW: TimeWindow = { from: '22:00', to: '06:00' };

export function toMinutes(hhmm: string): number {
  const [h, m] = String(hhmm).split(':').map((x) => Number(x));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function fromMinutes(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function parseDaysOfWeek(value: string | number[] | null | undefined): number[] {
  if (Array.isArray(value)) return value.map(Number).filter((d) => d >= 1 && d <= 7);
  return String(value ?? '1,2,3,4,5,6,7')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
}

/** Giờ địa phương của một thời điểm UTC. */
export function toLocal(utc: Date, tz = DEFAULT_TZ): LocalDateTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(utc);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
    isoWeekday: weekdays[get('weekday')] ?? 1,
  };
}

/** Thời điểm UTC của một giờ địa phương (date YYYY-MM-DD, time HH:mm). */
export function localToUtc(date: string, time: string, tz = DEFAULT_TZ): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const minutes = toMinutes(time);
  const naive = Date.UTC(y, mo - 1, d, Math.floor(minutes / 60), minutes % 60);
  // offset = (giờ địa phương nhìn như UTC) - UTC; lặp 2 lần cho đúng quanh lúc đổi giờ
  let guess = naive;
  for (let i = 0; i < 2; i++) {
    const l = toLocal(new Date(guess), tz);
    const [ly, lmo, ld] = l.date.split('-').map(Number);
    const lm = toMinutes(l.time);
    const asUtc = Date.UTC(ly, lmo - 1, ld, Math.floor(lm / 60), lm % 60);
    guess = naive - (asUtc - guess);
  }
  return new Date(guess);
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function isoWeekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function isInsideZone(point: GeoPointLike, rule: { centerLat: number; centerLng: number; radiusKm: number }): boolean {
  return haversineKm(point, { lat: Number(rule.centerLat), lng: Number(rule.centerLng) }) <= Number(rule.radiusKm);
}

function ruleEffectiveOn(rule: CityRestrictionRule, date: string): boolean {
  if (rule.isActive === false) return false;
  if (rule.effectiveFrom && date < String(rule.effectiveFrom).slice(0, 10)) return false;
  if (rule.effectiveTo && date > String(rule.effectiveTo).slice(0, 10)) return false;
  return true;
}

/** Quy tắc áp dụng cho một điểm và loại xe (xe không nặng không bị quy tắc chỉ dành cho xe tải nặng). */
export function applicableRules(point: GeoPointLike, isHeavy: boolean, rules: CityRestrictionRule[]): CityRestrictionRule[] {
  return rules.filter((r) => r.isActive !== false && (!r.appliesToHeavyTruck || isHeavy) && isInsideZone(point, r));
}

interface BanInterval {
  startMin: number; // phút trong ngày đang xét, có thể < 0 nếu bắt đầu từ hôm trước
  endMin: number; // có thể > 1440 nếu kéo sang hôm sau
  rule: CityRestrictionRule;
}

/** Các khoảng cấm (phút) giao với ngày `date`, đã xử lý khung qua nửa đêm và ngày ngoại lệ. */
function banIntervalsForDate(date: string, rules: CityRestrictionRule[], exceptions: CityRestrictionException[]): BanInterval[] {
  const out: BanInterval[] = [];
  for (const offset of [-1, 0]) {
    const day = addDays(date, offset);
    const weekday = isoWeekdayOf(day);
    const shift = offset * 1440;
    const citiesDone = new Set<string>();
    for (const rule of rules) {
      if (!ruleEffectiveOn(rule, day)) continue;
      const holiday = exceptions.filter((e) => e.city === rule.city && String(e.exceptionDate).slice(0, 10) === day);
      let windows: Array<{ from: string; to: string }>;
      if (holiday.length) {
        // Ngày lễ thay thế khung cấm thường của thành phố (mỗi thành phố chỉ thêm một lần)
        if (citiesDone.has(rule.city)) continue;
        citiesDone.add(rule.city);
        windows = holiday.map((h) => ({ from: h.bannedFrom, to: h.bannedTo }));
      } else {
        if (!parseDaysOfWeek(rule.daysOfWeek).includes(weekday)) continue;
        windows = [{ from: rule.bannedFrom, to: rule.bannedTo }];
      }
      for (const w of windows) {
        const from = toMinutes(w.from);
        let to = toMinutes(w.to);
        if (to === from) continue;
        if (to < from) to += 1440; // qua nửa đêm
        const startMin = from + shift;
        const endMin = to + shift;
        if (endMin > 0 && startMin < 1440) out.push({ startMin, endMin, rule });
      }
    }
  }
  return out;
}

export function isBannedAt(
  local: LocalDateTime,
  rules: CityRestrictionRule[],
  exceptions: CityRestrictionException[] = [],
): { banned: boolean; rule?: CityRestrictionRule; until?: { date: string; time: string } } {
  const t = toMinutes(local.time);
  const hits = banIntervalsForDate(local.date, rules, exceptions).filter((b) => b.startMin <= t && t < b.endMin);
  if (!hits.length) return { banned: false };
  const latest = hits.sort((a, b) => b.endMin - a.endMin)[0];
  const untilDate = addDays(local.date, Math.floor(latest.endMin / 1440));
  return { banned: true, rule: latest.rule, until: { date: untilDate, time: fromMinutes(latest.endMin) } };
}

export function isInWindow(time: string, window: TimeWindow): boolean {
  const t = toMinutes(time);
  const from = toMinutes(window.from);
  const to = toMinutes(window.to);
  return from <= to ? t >= from && t < to : t >= from || t < to;
}

export interface NextAllowedResult {
  allowedAt: Date;
  shifted: boolean;
  reasonVi: string;
  isNight: boolean;
  city?: string;
}

/**
 * Thời điểm hợp lệ sớm nhất (>= utc) để xe vào điểm `point`. Bị cấm thì dời tới lúc hết khung cấm.
 * isNight = giờ được phép nằm trong khung đêm → bật phụ phí đêm (nightPickup) khi tính giá.
 */
export function nextAllowedTime(
  utc: Date,
  point: GeoPointLike,
  isHeavy: boolean,
  rules: CityRestrictionRule[],
  exceptions: CityRestrictionException[] = [],
  tz = DEFAULT_TZ,
  nightWindow: TimeWindow = DEFAULT_NIGHT_WINDOW,
): NextAllowedResult {
  const relevant = applicableRules(point, isHeavy, rules);
  let at = new Date(utc.getTime());
  let city: string | undefined;
  for (let i = 0; i < 8 && relevant.length; i++) {
    const res = isBannedAt(toLocal(at, tz), relevant, exceptions);
    if (!res.banned || !res.until) break;
    city = res.rule?.city;
    at = localToUtc(res.until.date, res.until.time, tz);
  }
  const shifted = at.getTime() !== utc.getTime();
  const local = toLocal(at, tz);
  return {
    allowedAt: at,
    shifted,
    isNight: isInWindow(local.time, nightWindow),
    city,
    reasonVi: shifted
      ? `Xe tải nặng không được vào nội đô ${city ?? ''} trong giờ cấm; dời sang ${local.time} ngày ${local.date} (giờ Việt Nam).`
      : '',
  };
}

/** Các khung giờ ĐƯỢC PHÉP trong một ngày địa phương (dùng cho ô chọn giờ đón của khách). */
export function allowedWindowsForDate(
  date: string,
  point: GeoPointLike,
  isHeavy: boolean,
  rules: CityRestrictionRule[],
  exceptions: CityRestrictionException[] = [],
): TimeWindow[] {
  const relevant = applicableRules(point, isHeavy, rules);
  const banned = banIntervalsForDate(date, relevant, exceptions)
    .map((b) => [Math.max(0, b.startMin), Math.min(1440, b.endMin)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const windows: TimeWindow[] = [];
  let cursor = 0;
  for (const [s, e] of banned) {
    if (s > cursor) windows.push({ from: fromMinutes(cursor), to: s === 1440 ? '24:00' : fromMinutes(s) });
    cursor = Math.max(cursor, e);
  }
  if (cursor < 1440) windows.push({ from: fromMinutes(cursor), to: '24:00' });
  return windows;
}
