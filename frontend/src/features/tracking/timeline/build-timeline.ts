import {
  TimelineItem,
  TimelineStatus,
  TimelineKind,
  TimelineVitalBadge,
  ShipmentTimelineResponse,
} from './timeline-types';

export interface BuildTimelineInput {
  timelineData?: ShipmentTimelineResponse | null;
  viewer?: 'customer' | 'manager' | 'driver';
  language?: 'vi' | 'en';
}

/**
 * Pure helper function to compute delay minutes between planned and actual/estimated timestamps
 */
export function computeDelayMinutes(
  plannedIso?: string | null,
  actualOrEtaIso?: string | null,
): number | null {
  if (!plannedIso || !actualOrEtaIso) return null;
  const plannedTime = new Date(plannedIso).getTime();
  const actualTime = new Date(actualOrEtaIso).getTime();
  if (isNaN(plannedTime) || isNaN(actualTime)) return null;
  return Math.round((actualTime - plannedTime) / (60 * 1000));
}

/**
 * Format ISO string to HH:mm dd/MM in Asia/Ho_Chi_Minh or user locale
 */
export function formatTimelineDateTime(
  isoString?: string | null,
  locale = 'vi-VN',
): { time: string; date: string; full: string } {
  if (!isoString) return { time: '--:--', date: '--/--', full: '--:-- --/--' };
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return { time: '--:--', date: '--/--', full: '--:-- --/--' };

  try {
    const time = d.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    const date = d.toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    return { time, date, full: `${time} ${date}` };
  } catch {
    const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
    const date = d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
    return { time, date, full: `${time} ${date}` };
  }
}

/**
 * Pure adapter: adapts API timeline items for presentation
 */
export function buildTimeline(input: BuildTimelineInput): TimelineItem[] {
  const { timelineData, viewer = 'customer' } = input;
  if (!timelineData || !Array.isArray(timelineData.items) || timelineData.items.length === 0) {
    return [];
  }

  return timelineData.items
    .filter((item) => {
      // Defense in depth: if customer, omit internal transfer hubs
      if (viewer === 'customer' && item.kind === 'transfer') {
        return false;
      }
      return true;
    })
    .map((item) => {
      const sanitized: TimelineItem = {
        ...item,
        // Redact actorLabel for customer
        actorLabel: viewer === 'customer' ? undefined : item.actorLabel,
      };

      // Recalculate delay if not provided by backend
      if (sanitized.delayMinutes === null || sanitized.delayMinutes === undefined) {
        sanitized.delayMinutes = computeDelayMinutes(sanitized.plannedAt, sanitized.actualAt);
      }

      return sanitized;
    });
}
