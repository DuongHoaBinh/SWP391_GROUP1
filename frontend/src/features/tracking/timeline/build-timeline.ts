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

function translateTimelineText(text: string | undefined, language: 'vi' | 'en'): string | undefined {
  if (!text || language !== 'en') return text;
  const exactMap: Record<string, string> = {
    'Thanh toán cước vận chuyển': 'Transport Fee Payment',
    'Đã hoàn tất thanh toán VietQR': 'VietQR payment completed',
    'Chờ khách hàng thanh toán': 'Awaiting customer payment',
    'Phê duyệt khả thi & kế hoạch': 'Feasibility & Plan Approval',
    'Logistics Manager đã phê duyệt': 'Approved by Logistics Manager',
    'Đang thẩm định khả thi tuyến & xe': 'Reviewing route & fleet feasibility',
    'Đơn đã bị từ chối hoặc hủy': 'Order rejected or cancelled',
    'Hồ sơ kiểm dịch & giấy tờ thú y': 'Quarantine & Veterinary Documents',
    'Đủ hồ sơ kiểm dịch & pháp lý': 'Quarantine & legal documents cleared',
    'Đủ điều kiện xuất phát (Tier A/B)': 'Quarantine & legal documents cleared',
    'Đang rà soát và kiểm duyệt giấy tờ': 'Reviewing compliance documentation',
    'Điều phối xe & tài xế sẵn sàng': 'Vehicle & Crew Dispatch Ready',
    'Phương tiện chuyên dụng đã sẵn sàng': 'Specialized transport vehicle ready',
    'Đang xếp lịch phương tiện & nhân sự': 'Scheduling vehicle & crew',
    'Biên bản bàn giao & kiểm tra thể trạng': 'Delivery Handover & Welfare Check',
    'Đã ký nhận bàn giao ngựa an toàn': 'Safe horse handover signed',
    'Biên bản giao nhận tại điểm đến': 'Destination handover checklist',
    'Biên bản giao nhận Flow 6': 'Destination handover checklist',
    'Hoàn tất toàn bộ hành trình': 'Journey Completed',
    'Chuyến đi kết thúc thành công': 'Trip completed successfully',
    'Chờ hoàn tất': 'Pending completion',
    'Khách không giao ngựa chặng về (No-Show)': 'Return Leg No-Show',
    'Đã hoàn tiền đơn hàng': 'Order Refunded',
    'Hoàn tiền 100% qua chuyển khoản ngân hàng': '100% refunded via bank transfer',
    'Ổn định': 'Stable',
    'Cần chú ý': 'Needs attention',
  };
  if (exactMap[text]) return exactMap[text];

  if (text.startsWith('Đón ngựa tại: ')) return `Horse Pickup: ${text.slice('Đón ngựa tại: '.length)}`;
  if (text.startsWith('Khởi hành chặng về: ')) return `Return Leg Departure: ${text.slice('Khởi hành chặng về: '.length)}`;
  if (text.startsWith('Bàn giao tại đích: ')) return `Final Delivery: ${text.slice('Bàn giao tại đích: '.length)}`;
  if (text.startsWith('Cập bến về đích: ')) return `Return Arrival: ${text.slice('Cập bến về đích: '.length)}`;
  if (text.startsWith('Xe đã bàn giao cho tài xế ')) return `Vehicle assigned to driver ${text.slice('Xe đã bàn giao cho tài xế '.length)}`;

  const depMatch = text.match(/^Xuất phát chặng (\d+): (.+)$/);
  if (depMatch) return `Depart Leg ${depMatch[1]}: ${depMatch[2]}`;
  const arrMatch = text.match(/^Đến điểm cuối chặng (\d+): (.+)$/);
  if (arrMatch) return `Arrive Leg ${arrMatch[1]} End: ${arrMatch[2]}`;
  const noShowMatch = text.match(/^Tài xế đã chờ đủ (\d+) phút theo chính sách$/);
  if (noShowMatch) return `Driver waited ${noShowMatch[1]} minutes per no-show policy`;

  return text;
}

/**
 * Pure adapter: adapts API timeline items for presentation
 */
export function buildTimeline(input: BuildTimelineInput): TimelineItem[] {
  const { timelineData, viewer = 'customer', language = 'vi' } = input;
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
        milestoneId: item.milestoneId ?? null,
        legId: item.legId ?? null,
        stopId: item.stopId ?? null,
        title: translateTimelineText(item.title, language) || item.title,
        subtitle: translateTimelineText(item.subtitle, language),
        vitals: item.vitals?.map((v) => ({
          ...v,
          text: translateTimelineText(v.text, language) || v.text,
        })),
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
