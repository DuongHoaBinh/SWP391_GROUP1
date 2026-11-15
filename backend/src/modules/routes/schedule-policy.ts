import { BadRequestException } from '@nestjs/common';
import { scheduleInstant } from '../../common/schedule-time';
export { scheduleInstant } from '../../common/schedule-time';

export interface ScheduledLeg { sequenceNo: number; plannedDeparture?: string | null; plannedArrival?: string | null }
export interface ScheduledStop { sequenceNo: number; legSequenceNo?: number; plannedArrival?: string | null; plannedDeparture?: string | null }

export function validatePlanSchedule(legs: ScheduledLeg[], stops: ScheduledStop[] = [], requireComplete = false, checkFuture = false, now = Date.now()) {
  const ordered = [...legs].sort((a, b) => a.sequenceNo - b.sequenceNo);
  const sequences = new Set<number>();
  let previousEnd: number | undefined;
  const windows = new Map<number, { start?: number; end?: number }>();
  for (const leg of ordered) {
    if (!Number.isSafeInteger(leg.sequenceNo) || leg.sequenceNo < 1 || sequences.has(leg.sequenceNo)) throw new BadRequestException('Thứ tự chặng phải là số nguyên dương và không trùng');
    sequences.add(leg.sequenceNo);
    if (requireComplete && (!leg.plannedDeparture || !leg.plannedArrival)) throw new BadRequestException(`Cần giờ đi và giờ đến cho chặng ${leg.sequenceNo}`);
    const start = leg.plannedDeparture != null ? scheduleInstant(leg.plannedDeparture, `Giờ đi chặng ${leg.sequenceNo}`) : undefined;
    const end = leg.plannedArrival != null ? scheduleInstant(leg.plannedArrival, `Giờ đến chặng ${leg.sequenceNo}`) : undefined;
    if (start !== undefined && end !== undefined && end <= start) throw new BadRequestException(`Giờ đến chặng ${leg.sequenceNo} phải sau giờ đi`);
    if (previousEnd !== undefined && (start ?? end) !== undefined && (start ?? end)! < previousEnd) throw new BadRequestException('Chặng sau phải bắt đầu từ khi chặng trước kết thúc; cần tính thời gian trung chuyển và kiểm dịch');
    if (start !== undefined && checkFuture && start < now) throw new BadRequestException('Lịch xuất phát mới không được ở quá khứ');
    windows.set(leg.sequenceNo, { start, end });
    if (end !== undefined) previousEnd = end;
    else if (start !== undefined) previousEnd = start;
  }
  const stopSequences = new Set<number>();
  let previousStopDeparture: number | undefined;
  for (const stop of [...stops].sort((a, b) => a.sequenceNo - b.sequenceNo)) {
    if (!Number.isSafeInteger(stop.sequenceNo) || stop.sequenceNo < 1 || stopSequences.has(stop.sequenceNo)) throw new BadRequestException('Thứ tự trạm phải là số nguyên dương và không trùng');
    stopSequences.add(stop.sequenceNo);
    const arrival = stop.plannedArrival != null ? scheduleInstant(stop.plannedArrival, 'Giờ đến trạm') : undefined;
    const departure = stop.plannedDeparture != null ? scheduleInstant(stop.plannedDeparture, 'Giờ rời trạm') : undefined;
    if (arrival !== undefined && departure !== undefined && departure < arrival) throw new BadRequestException('Giờ rời trạm không được trước giờ đến trạm');
    if (previousStopDeparture !== undefined && (arrival ?? departure) !== undefined && (arrival ?? departure)! < previousStopDeparture) throw new BadRequestException('Lịch các trạm không được chồng chéo');
    const window = stop.legSequenceNo != null ? windows.get(stop.legSequenceNo) : undefined;
    if (stop.legSequenceNo != null && !window) throw new BadRequestException('Trạm phải thuộc chặng có trong kế hoạch');
    const start = window?.start ?? (ordered[0]?.plannedDeparture ? scheduleInstant(ordered[0].plannedDeparture, 'Giờ đầu hành trình') : undefined);
    const last = ordered[ordered.length - 1];
    const end = window?.end ?? (last?.plannedArrival ? scheduleInstant(last.plannedArrival, 'Giờ cuối hành trình') : undefined);
    for (const instant of [arrival, departure]) if (instant !== undefined && ((start !== undefined && instant < start) || (end !== undefined && instant > end))) throw new BadRequestException('Lịch trạm phải nằm trong khoảng thời gian của chặng/hành trình');
    previousStopDeparture = departure ?? arrival ?? previousStopDeparture;
  }
}
