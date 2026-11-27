import type { BadgeVariant } from '@/components/ui/StatusBadge';

export interface ShipmentStatusMeta {
  vi: string;
  en: string;
  variant: BadgeVariant;
  bg: string;
  color: string;
  border: string;
}

export const SHIPMENT_STATUS_META: Record<string, ShipmentStatusMeta> = {
  requested: {
    vi: 'Chờ duyệt',
    en: 'Pending Approval',
    variant: 'info',
    bg: '#F8F0DF',
    color: '#966516',
    border: '#DFCA9A',
  },
  awaiting_payment: {
    vi: 'Chờ thanh toán',
    en: 'Awaiting Payment',
    variant: 'pending',
    bg: '#F8F0DF',
    color: '#966516',
    border: '#DFCA9A',
  },
  paid_pending_review: {
    vi: 'Chờ duyệt khả thi',
    en: 'Pending Feasibility',
    variant: 'info',
    bg: '#E8F2EB',
    color: '#287653',
    border: '#B7DBC4',
  },
  paid_pending_feasibility: {
    vi: 'Chờ duyệt khả thi',
    en: 'Pending Feasibility',
    variant: 'info',
    bg: '#E8F2EB',
    color: '#287653',
    border: '#B7DBC4',
  },
  refund_requested: {
    vi: 'Chờ hoàn tiền',
    en: 'Refund Requested',
    variant: 'danger',
    bg: '#F8EAEA',
    color: '#B33E3E',
    border: '#E5B8B8',
  },
  refunded: {
    vi: 'Đã hoàn tiền',
    en: 'Refunded',
    variant: 'neutral',
    bg: '#F0EEE8',
    color: '#5B6779',
    border: '#D8CEBE',
  },
  under_review: {
    vi: 'Đang thẩm định',
    en: 'Under Review',
    variant: 'pending',
    bg: '#FAF8F4',
    color: '#A67C2E',
    border: '#D4C5A3',
  },
  change_requested: {
    vi: 'Yêu cầu chỉnh sửa',
    en: 'Change Requested',
    variant: 'pending',
    bg: '#F8F0DF',
    color: '#966516',
    border: '#DFCA9A',
  },
  approved: {
    vi: 'Đã duyệt',
    en: 'Approved',
    variant: 'success',
    bg: '#E8F2EB',
    color: '#287653',
    border: '#B7DBC4',
  },
  rejected: {
    vi: 'Đã từ chối',
    en: 'Rejected',
    variant: 'danger',
    bg: '#F8EAEA',
    color: '#B33E3E',
    border: '#E5B8B8',
  },
  planning: {
    vi: 'Đang lập tuyến',
    en: 'Route Planning',
    variant: 'info',
    bg: '#FAF8F4',
    color: '#A67C2E',
    border: '#D4C5A3',
  },
  confirmed: {
    vi: 'Đã xác nhận chuyến',
    en: 'Confirmed',
    variant: 'info',
    bg: '#FAF8F4',
    color: '#181A17',
    border: '#D4C5A3',
  },
  ready_to_depart: {
    vi: 'Sẵn sàng xuất phát',
    en: 'Ready to Depart',
    variant: 'success',
    bg: '#E8F2EB',
    color: '#287653',
    border: '#B7DBC4',
  },
  in_transit: {
    vi: 'Đang vận chuyển',
    en: 'In Transit',
    variant: 'transit',
    bg: '#FAF8F4',
    color: '#A67C2E',
    border: '#C4B38E',
  },
  return_pending: {
    vi: 'Chờ chặng về',
    en: 'Return Leg Pending',
    variant: 'pending',
    bg: '#F8F0DF',
    color: '#966516',
    border: '#DFCA9A',
  },
  return_in_transit: {
    vi: 'Đang vận chuyển chặng về',
    en: 'Return In Transit',
    variant: 'transit',
    bg: '#FAF8F4',
    color: '#A67C2E',
    border: '#C4B38E',
  },
  completed: {
    vi: 'Đã hoàn tất',
    en: 'Completed',
    variant: 'success',
    bg: '#E8F2EB',
    color: '#287653',
    border: '#B7DBC4',
  },
  delivered: {
    vi: 'Đã hoàn tất',
    en: 'Delivered',
    variant: 'success',
    bg: '#E8F2EB',
    color: '#287653',
    border: '#B7DBC4',
  },
  cancelled: {
    vi: 'Đã hủy',
    en: 'Cancelled',
    variant: 'neutral',
    bg: '#F0EEE8',
    color: '#5B6779',
    border: '#D8CEBE',
  },
  cancelled_operational: {
    vi: 'Đã hủy vận hành',
    en: 'Cancelled (Operational)',
    variant: 'danger',
    bg: '#F8EAEA',
    color: '#B33E3E',
    border: '#E5B8B8',
  },
  payment_overdue: {
    vi: 'Quá hạn thanh toán',
    en: 'Payment Overdue',
    variant: 'danger',
    bg: '#F8EAEA',
    color: '#B33E3E',
    border: '#E5B8B8',
  },
};

export function getShipmentStatusMeta(status?: string | null): ShipmentStatusMeta {
  const key = String(status || '').toLowerCase().trim();
  return (
    SHIPMENT_STATUS_META[key] || {
      vi: status || '—',
      en: status || '—',
      variant: 'neutral',
      bg: '#F0EEE8',
      color: '#5B6779',
      border: '#D8CEBE',
    }
  );
}

export function formatShipmentStatusLabel(status?: string | null, isEn = false): string {
  const meta = getShipmentStatusMeta(status);
  return isEn ? meta.en : meta.vi;
}
