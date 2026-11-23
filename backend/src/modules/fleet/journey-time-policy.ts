/**
 * ETA có chèn thời gian nghỉ cho ngựa (Step 9, file định hướng B4). Hàm thuần.
 * Tham chiếu EU Regulation 1/2005: nghỉ uống nước mỗi 8 giờ; tối đa 24 giờ hành trình thì
 * dỡ ngựa nghỉ ít nhất 24 giờ. Mọi giá trị là tham số cấu hình (system_setting 'journey.rules').
 */
import { BadRequestException } from '@nestjs/common';

export interface JourneyRules {
  maxDriveHoursBeforeRest: number;
  restMinutes: number;
  maxJourneyHours: number;
  mandatoryRestHours: number;
  nightWindow: { from: string; to: string };
}

export const DEFAULT_JOURNEY_RULES: JourneyRules = {
  maxDriveHoursBeforeRest: 8,
  restMinutes: 60,
  maxJourneyHours: 24,
  mandatoryRestHours: 24,
  nightWindow: { from: '22:00', to: '06:00' },
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function normalizeJourneyRules(raw: any): JourneyRules {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    maxDriveHoursBeforeRest: Number(src.maxDriveHoursBeforeRest ?? DEFAULT_JOURNEY_RULES.maxDriveHoursBeforeRest),
    restMinutes: Number(src.restMinutes ?? DEFAULT_JOURNEY_RULES.restMinutes),
    maxJourneyHours: Number(src.maxJourneyHours ?? DEFAULT_JOURNEY_RULES.maxJourneyHours),
    mandatoryRestHours: Number(src.mandatoryRestHours ?? DEFAULT_JOURNEY_RULES.mandatoryRestHours),
    nightWindow: {
      from: String(src.nightWindow?.from ?? DEFAULT_JOURNEY_RULES.nightWindow.from),
      to: String(src.nightWindow?.to ?? DEFAULT_JOURNEY_RULES.nightWindow.to),
    },
  };
}

export function validateJourneyRules(r: JourneyRules): void {
  const inRange = (v: number, min: number, max: number) => Number.isFinite(v) && v >= min && v <= max;
  if (!inRange(r.maxDriveHoursBeforeRest, 1, 24)) throw new BadRequestException('maxDriveHoursBeforeRest phải trong khoảng 1–24 giờ');
  if (!inRange(r.restMinutes, 0, 600)) throw new BadRequestException('restMinutes phải trong khoảng 0–600 phút');
  if (!inRange(r.maxJourneyHours, r.maxDriveHoursBeforeRest, 72)) {
    throw new BadRequestException('maxJourneyHours phải >= maxDriveHoursBeforeRest và <= 72 giờ');
  }
  if (!inRange(r.mandatoryRestHours, 0, 72)) throw new BadRequestException('mandatoryRestHours phải trong khoảng 0–72 giờ');
  if (!HHMM.test(r.nightWindow.from) || !HHMM.test(r.nightWindow.to)) {
    throw new BadRequestException('nightWindow.from/to phải theo định dạng HH:mm');
  }
}

export interface JourneyEstimate {
  totalHours: number;
  restStops: number;
  mandatoryRests: number;
  breakdownVi: string[];
}

/**
 * Mô phỏng hành trình theo từng đoạn lái:
 * - lái tối đa maxDriveHoursBeforeRest giờ thì dừng nghỉ restMinutes (điểm nghỉ ngắn);
 * - thời gian tính từ lần dỡ ngựa gần nhất vượt maxJourneyHours thì nghỉ bắt buộc mandatoryRestHours
 *   (thay cho điểm nghỉ ngắn tại vị trí đó) và bắt đầu đếm lại.
 */
export function estimateJourney(input: { driveHours: number; rules?: Partial<JourneyRules> }): JourneyEstimate {
  const rules = normalizeJourneyRules({ ...DEFAULT_JOURNEY_RULES, ...(input.rules ?? {}) });
  const drive = Math.max(0, Number(input.driveHours) || 0);
  const restH = rules.restMinutes / 60;
  const chunk = Math.max(0.5, rules.maxDriveHoursBeforeRest);

  let remaining = drive;
  let total = 0;
  let sinceMandatory = 0;
  let restStops = 0;
  let mandatoryRests = 0;
  const breakdownVi: string[] = [];

  while (remaining > 1e-9) {
    const seg = Math.min(chunk, remaining);
    remaining -= seg;
    total += seg;
    sinceMandatory += seg;
    breakdownVi.push(`Lái ${seg.toFixed(1)} giờ`);
    if (remaining <= 1e-9) break;
    if (sinceMandatory + restH + Math.min(chunk, remaining) > rules.maxJourneyHours) {
      mandatoryRests += 1;
      total += rules.mandatoryRestHours;
      sinceMandatory = 0;
      breakdownVi.push(`Dỡ ngựa nghỉ bắt buộc ${rules.mandatoryRestHours} giờ`);
    } else {
      restStops += 1;
      total += restH;
      sinceMandatory += restH;
      breakdownVi.push(`Nghỉ cho ngựa uống nước ${rules.restMinutes} phút`);
    }
  }

  return { totalHours: Number(total.toFixed(2)), restStops, mandatoryRests, breakdownVi };
}
