import { BadRequestException } from '@nestjs/common';

export function scheduleInstant(value: string, label: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  const result = new Date(value).getTime();
  const date = match ? new Date(`${match[1]}T00:00:00Z`) : null;
  if (!match || !Number.isFinite(result) || !date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== match[1] ||
    Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) {
    throw new BadRequestException(`${label} phải là ngày giờ ISO hợp lệ kèm Z hoặc độ lệch múi giờ`);
  }
  return result;
}
