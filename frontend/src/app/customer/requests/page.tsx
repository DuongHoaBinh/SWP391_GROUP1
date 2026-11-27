'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  CreditCard,
  Navigation,
  Receipt,
  RotateCcw,
  FileEdit,
  Download,
  MapPin,
  Calendar,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CustomerOrdersHubTabs } from '@/components/layout/CustomerSectionTabs';
import { PaymentCountdownBadge } from '@/features/orders/components/PaymentCountdownBadge';
import { SepayPaymentModal } from '@/features/orders/components/SepayPaymentModal';
import {
  getShipmentStatusMeta,
  formatShipmentStatusLabel,
} from '@/features/orders/shipment-status';
import { apiClient } from '@/lib/api-client';
import { escapeQuotationText } from '@/features/orders/quotation-html';
import { bookingName, type BookingType } from '@/features/orders/booking-policy';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────
interface OrderHorse {
  horseId: number;
  name: string;
  breed: string | null;
  age: number | null;
}

interface TransportOrder {
  bookingType?: BookingType;
  stallUnitPrice?: number | null;
  requestedHorseCount?: number;
  id: number;
  requestCode?: string;
  customerRequestCode?: string;
  customerId: number;
  contactName: string | null;
  contactEmail: string;
  originLocation: string;
  destinationLocation: string;
  requestedDate: string;
  departureDate: string | null;
  status: string;
  paymentStatus?: string | null;
  paymentDueAt?: string | null;
  totalCost: number;
  transportCost?: number | null;
  insuranceFee?: number;
  createdAt: string;
  customerEmail?: string;
  horses?: OrderHorse[];
  specialRequirements?: string | null;
  rejectionReason?: string | null;
}

type StatusGroupTab =
  | 'all'
  | 'action_needed'
  | 'review_prep'
  | 'in_transit'
  | 'completed'
  | 'cancelled';

type SortField = 'createdAt' | 'totalCost' | 'requestedDate';
type SortOrder = 'asc' | 'desc';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const ACTION_NEEDED_STATUSES = new Set([
  'awaiting_payment',
  'change_requested',
  'refund_requested',
]);
const REVIEW_PREP_STATUSES = new Set([
  'requested',
  'paid_pending_review',
  'under_review',
  'approved',
  'planning',
  'confirmed',
  'ready_to_depart',
]);
const IN_TRANSIT_STATUSES = new Set([
  'in_transit',
  'return_pending',
]);
const COMPLETED_STATUSES = new Set(['completed', 'delivered']);
const CANCELLED_STATUSES = new Set([
  'cancelled',
  'cancelled_operational',
  'rejected',
  'refunded',
]);

function matchesStatusTab(status: string, tab: StatusGroupTab): boolean {
  const s = (status || '').toLowerCase();
  switch (tab) {
    case 'action_needed':
      return ACTION_NEEDED_STATUSES.has(s);
    case 'review_prep':
      return REVIEW_PREP_STATUSES.has(s);
    case 'in_transit':
      return IN_TRANSIT_STATUSES.has(s);
    case 'completed':
      return COMPLETED_STATUSES.has(s);
    case 'cancelled':
      return CANCELLED_STATUSES.has(s);
    default:
      return true;
  }
}

function formatDate(iso: string | null | undefined, language: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(language === 'en' ? 'en-US' : 'vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function toLocalDateString(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatCurrency(n: number) {
  if (!n || n === 0) return '—';
  return n.toLocaleString('vi-VN') + ' ₫';
}

function shortPlace(loc?: string | null): string {
  if (!loc) return '—';
  return loc.split(',')[0].trim() || loc;
}

// ─── Quotation Print Fallback (for unpaid legacy requested orders) ────────────
function exportQuotationPDF(order: TransportOrder, language: string) {
  const isEn = language === 'en';
  const meta = getShipmentStatusMeta(order.status);

  const horsesRows =
    order.horses
      ?.map(
        (h) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #EAE5DA;">${escapeQuotationText(h.name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #EAE5DA;">${escapeQuotationText(h.breed || '—')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #EAE5DA;">${h.age ? `${escapeQuotationText(h.age)} ${isEn ? 'yrs' : 'tuổi'}` : '—'}</td>
    </tr>`,
      )
      .join('') ||
    `<tr><td colspan="3" style="padding:12px;color:#787770;text-align:center;">${isEn ? 'No horse details' : 'Không có thông tin ngựa'}</td></tr>`;

  const code = order.customerRequestCode || order.requestCode || `REQ-${String(order.id).padStart(3, '0')}`;
  const html = `<!DOCTYPE html>
<html lang="${isEn ? 'en' : 'vi'}">
<head>
  <meta charset="UTF-8">
  <title>Báo Giá Dự Kiến - ${escapeQuotationText(code)}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#181A17;background:#fff}
    .page{max-width:800px;margin:0 auto;padding:40px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:24px;border-bottom:3px solid #A67C2E;margin-bottom:28px}
    .brand-name{font-size:22px;font-weight:800;color:#181A17}
    .brand-sub{font-size:12px;color:#5F6977;margin-top:3px}
    .doc-title{font-size:24px;font-weight:800;color:#A67C2E;text-align:right}
    .doc-id{font-size:13px;color:#57564E;text-align:right;margin-top:4px}
    .status-badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;background:${meta.bg};color:${meta.color};border:1px solid ${meta.border};margin-top:6px}
    .section{margin-bottom:24px}
    .section-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#5F6977;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #EAE5DA}
    .grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
    .info-box{background:#FAF8F4;padding:14px 16px;border-radius:8px;border:1px solid #D8CEBE}
    .info-label{font-size:11px;color:#5F6977;text-transform:uppercase;font-weight:600;margin-bottom:4px}
    .info-value{font-size:14px;font-weight:600;color:#181A17}
    table{width:100%;border-collapse:collapse;border:1px solid #D8CEBE}
    thead{background:#181A17}
    thead th{padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#F5EFE2;text-align:left}
    .cost-section{background:#181A17;border:1px solid #A67C2E;border-radius:12px;padding:24px;margin:24px 0;color:#FAF8F4}
    .cost-value{font-size:28px;font-weight:800;color:#FFFFFF;margin-top:6px}
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="brand-name">EquiTransit Logistics</div>
      <div class="brand-sub">Cross-Border Equine Logistics System</div>
    </div>
    <div>
      <div class="doc-title">${isEn ? 'ESTIMATED QUOTATION' : 'BÁO GIÁ DỰ KIẾN'}</div>
      <div class="doc-id">${escapeQuotationText(code)}</div>
      <div style="text-align:right"><span class="status-badge">${escapeQuotationText(formatShipmentStatusLabel(order.status, isEn))}</span></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">${isEn ? 'Route Details' : 'Thông tin tuyến vận chuyển'}</div>
    <div class="grid-3">
      <div class="info-box"><div class="info-label">${isEn ? 'Origin' : 'Điểm xuất phát'}</div><div class="info-value">${escapeQuotationText(order.originLocation)}</div></div>
      <div class="info-box"><div class="info-label">${isEn ? 'Destination' : 'Điểm đến'}</div><div class="info-value">${escapeQuotationText(order.destinationLocation)}</div></div>
      <div class="info-box"><div class="info-label">${isEn ? 'Departure' : 'Ngày khởi hành'}</div><div class="info-value">${formatDate(order.departureDate || order.requestedDate, language)}</div></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">${isEn ? 'Horses' : 'Danh sách ngựa'} (${order.horses?.length || 0})</div>
    <table><thead><tr><th>${isEn ? 'Name' : 'Tên ngựa'}</th><th>${isEn ? 'Breed' : 'Giống'}</th><th>${isEn ? 'Age' : 'Tuổi'}</th></tr></thead><tbody>${horsesRows}</tbody></table>
  </div>
  <div class="cost-section">
    <div>${bookingName(order.bookingType)}</div>
    <div class="cost-value">${order.totalCost > 0 ? order.totalCost.toLocaleString('vi-VN') + ' ₫' : isEn ? 'Pending Quote' : 'Chờ báo giá'}</div>
  </div>
</div>
<script>window.onload=function(){window.print()}</script>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    toast.error(
      isEn
        ? 'Pop-up blocked. Downloading quotation file instead...'
        : 'Trình duyệt đã chặn pop-up. Hệ thống đang tự động tải tệp Báo giá về máy...',
    );
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `BaoGia_${code}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RequestsPage() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const isEn = language === 'en';

  // Filter & sort state
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<StatusGroupTab>('all');
  const [departureDateFrom, setDepartureDateFrom] = useState('');
  const [departureDateTo, setDepartureDateTo] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<10 | 20>(10);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Data state
  const [allOrders, setAllOrders] = useState<TransportOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Quick SePay Payment Popup state
  const [payModalOrder, setPayModalOrder] = useState<TransportOrder | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiClient<any>('/orders/my-orders');
      if (Array.isArray(result)) {
        setAllOrders(result);
      } else if (result && Array.isArray(result.data)) {
        setAllOrders(result.data);
      } else {
        setAllOrders([]);
      }
    } catch (err: any) {
      setAllOrders([]);
      setError(
        err?.message ||
          (isEn
            ? 'Unable to load orders. Please try again.'
            : 'Không thể tải đơn hàng. Vui lòng thử lại.'),
      );
    } finally {
      setLoading(false);
    }
  }, [isEn]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  // Reset page whenever filters or search change
  useEffect(() => {
    setPage(1);
  }, [search, statusTab, departureDateFrom, departureDateTo, sortBy, sortOrder, limit]);

  // Live counts per status group tab
  const tabCounts = useMemo(() => {
    const counts: Record<StatusGroupTab, number> = {
      all: allOrders.length,
      action_needed: 0,
      review_prep: 0,
      in_transit: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const o of allOrders) {
      const s = (o.status || '').toLowerCase();
      if (ACTION_NEEDED_STATUSES.has(s)) counts.action_needed += 1;
      if (REVIEW_PREP_STATUSES.has(s)) counts.review_prep += 1;
      if (IN_TRANSIT_STATUSES.has(s)) counts.in_transit += 1;
      if (COMPLETED_STATUSES.has(s)) counts.completed += 1;
      if (CANCELLED_STATUSES.has(s)) counts.cancelled += 1;
    }
    return counts;
  }, [allOrders]);

  // Filter BEFORE sorting & paginating (fixes search-after-paginate bug!)
  const filteredAndSortedOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = allOrders.filter((o) => {
      if (!matchesStatusTab(o.status, statusTab)) return false;

      if (departureDateFrom) {
        const dateStr = toLocalDateString(o.departureDate || o.requestedDate);
        if (!dateStr || dateStr < departureDateFrom) return false;
      }
      if (departureDateTo) {
        const dateStr = toLocalDateString(o.departureDate || o.requestedDate);
        if (!dateStr || dateStr > departureDateTo) return false;
      }

      if (q) {
        const matchesHorse = (o.horses || []).some((h) =>
          (h.name || '').toLowerCase().includes(q),
        );
        const hit =
          String(o.id).includes(q) ||
          (o.requestCode || '').toLowerCase().includes(q) ||
          (o.customerRequestCode || '').toLowerCase().includes(q) ||
          (o.contactName || '').toLowerCase().includes(q) ||
          (o.originLocation || '').toLowerCase().includes(q) ||
          (o.destinationLocation || '').toLowerCase().includes(q) ||
          matchesHorse;
        if (!hit) return false;
      }

      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'totalCost') {
        return sortOrder === 'asc'
          ? Number(a.totalCost || 0) - Number(b.totalCost || 0)
          : Number(b.totalCost || 0) - Number(a.totalCost || 0);
      }
      if (sortBy === 'requestedDate') {
        const ta = new Date(a.departureDate || a.requestedDate || 0).getTime();
        const tb = new Date(b.departureDate || b.requestedDate || 0).getTime();
        return sortOrder === 'asc' ? ta - tb : tb - ta;
      }
      const ca = new Date(a.createdAt || 0).getTime();
      const cb = new Date(b.createdAt || 0).getTime();
      return sortOrder === 'asc' ? ca - cb : cb - ca;
    });

    return list;
  }, [allOrders, statusTab, search, departureDateFrom, departureDateTo, sortBy, sortOrder]);

  const totalFiltered = filteredAndSortedOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / limit));
  const safePage = Math.min(page, totalPages);
  const displayedOrders = useMemo(
    () => filteredAndSortedOrders.slice((safePage - 1) * limit, safePage * limit),
    [filteredAndSortedOrders, safePage, limit],
  );

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return <ArrowUpDown size={13} className="text-[#94a3b8]" />;
    return sortOrder === 'asc' ? (
      <ArrowUp size={13} className="text-[#A67C2E]" />
    ) : (
      <ArrowDown size={13} className="text-[#A67C2E]" />
    );
  };

  const hasActiveFilters = Boolean(
    search.trim() || statusTab !== 'all' || departureDateFrom || departureDateTo,
  );

  const clearFilters = () => {
    setSearch('');
    setStatusTab('all');
    setDepartureDateFrom('');
    setDepartureDateTo('');
    setPage(1);
  };

  const statusTabs: Array<{ key: StatusGroupTab; label: string; count: number; highlight?: boolean }> = [
    { key: 'all', label: t('common.all', isEn ? 'All' : 'Tất cả'), count: tabCounts.all },
    {
      key: 'action_needed',
      label: isEn ? 'Action Needed' : 'Cần xử lý',
      count: tabCounts.action_needed,
      highlight: tabCounts.action_needed > 0,
    },
    {
      key: 'review_prep',
      label: isEn ? 'Review & Prep' : 'Đang duyệt & Chuẩn bị',
      count: tabCounts.review_prep,
    },
    {
      key: 'in_transit',
      label: isEn ? 'In Transit' : 'Đang vận chuyển',
      count: tabCounts.in_transit,
    },
    {
      key: 'completed',
      label: isEn ? 'Completed' : 'Hoàn tất',
      count: tabCounts.completed,
    },
    {
      key: 'cancelled',
      label: isEn ? 'Cancelled / Refunded' : 'Đã hủy / Hoàn tiền',
      count: tabCounts.cancelled,
    },
  ];

  // Contextual primary action per order lifecycle status
  const renderContextualAction = (order: TransportOrder) => {
    const s = (order.status || '').toLowerCase();
    const isPaid =
      order.paymentStatus === 'succeeded' ||
      order.paymentStatus === 'paid' ||
      ['paid_pending_review', 'approved', 'planning', 'confirmed', 'ready_to_depart', 'in_transit', 'return_pending', 'completed', 'delivered'].includes(s);

    if (s === 'awaiting_payment') {
      return (
        <button
          type="button"
          onClick={() => setPayModalOrder(order)}
          className="px-2.5 py-1.5 rounded-lg bg-[#A67C2E] hover:bg-[#8E6925] text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap shadow-xs"
        >
          <CreditCard size={13} aria-hidden="true" />
          <span>{isEn ? 'Pay Now' : 'Thanh toán'}</span>
        </button>
      );
    }
    if (s === 'refund_requested') {
      return (
        <Link
          href={`/customer/requests/${order.id}/refund`}
          className="px-2.5 py-1.5 rounded-lg bg-[#B33E3E] hover:bg-[#963131] text-white text-xs font-bold inline-flex items-center gap-1 no-underline transition-colors whitespace-nowrap shadow-xs"
        >
          <RotateCcw size={13} aria-hidden="true" />
          <span>{isEn ? 'Refund' : 'Hoàn tiền'}</span>
        </Link>
      );
    }
    if (s === 'change_requested') {
      return (
        <Link
          href={`/customer/requests/${order.id}`}
          className="px-2.5 py-1.5 rounded-lg bg-[#966516] hover:bg-[#7A5211] text-white text-xs font-bold inline-flex items-center gap-1 no-underline transition-colors whitespace-nowrap shadow-xs"
        >
          <FileEdit size={13} aria-hidden="true" />
          <span>{isEn ? 'Amend' : 'Cập nhật'}</span>
        </Link>
      );
    }
    if (IN_TRANSIT_STATUSES.has(s)) {
      return (
        <Link
          href={`/customer/tracking?shipmentId=${order.id}`}
          className="px-2.5 py-1.5 rounded-lg bg-[#287653] hover:bg-[#1F5E42] text-white text-xs font-bold inline-flex items-center gap-1 no-underline transition-colors whitespace-nowrap shadow-xs"
        >
          <Navigation size={13} aria-hidden="true" />
          <span>{isEn ? 'Track' : 'Theo dõi'}</span>
        </Link>
      );
    }
    if (COMPLETED_STATUSES.has(s) || isPaid) {
      return (
        <Link
          href={`/customer/requests/${order.id}/invoice`}
          className="px-2.5 py-1.5 rounded-lg border border-[#D4C5A3] bg-[#FAF8F4] hover:bg-[#F3ECE0] text-xs text-[#8C6621] font-semibold inline-flex items-center gap-1 no-underline transition-colors whitespace-nowrap"
        >
          <Receipt size={13} aria-hidden="true" />
          <span>{isEn ? 'Invoice' : 'Hóa đơn'}</span>
        </Link>
      );
    }
    if (s === 'requested' || s === 'under_review') {
      return (
        <button
          type="button"
          onClick={() => exportQuotationPDF(order, language)}
          className="px-2.5 py-1.5 rounded-lg border border-[#D4C5A3] bg-[#FAF8F4] hover:bg-[#F3ECE0] text-xs text-[#8C6621] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
        >
          <Download size={13} aria-hidden="true" />
          <span>{isEn ? 'Quote' : 'Báo giá'}</span>
        </button>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* Compact Header */}
      <header className="border-b border-[#E5DDD0] pb-3 flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#181A17] tracking-tight m-0">
          {t('customer.requests.title', isEn ? 'Transport Orders' : 'Đơn Vận Chuyển')}
        </h1>
      </header>

      {/* Hub 1 Section Tabs */}
      <CustomerOrdersHubTabs ordersCount={allOrders.length} />

      {/* Quick Status Tabs + Search/Date Filter Bar */}
      <div className="bg-white rounded-2xl border border-[#E5DDD0] p-3.5 shadow-sm flex flex-col gap-3">
        {/* Quick Status Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          {statusTabs.map((tab) => {
            const active = statusTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                aria-pressed={active}
                onClick={() => setStatusTab(tab.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  active
                    ? 'bg-[#181A17] text-[#FAF8F4] border-[#181A17] shadow-xs'
                    : tab.highlight
                      ? 'bg-amber-50/90 text-amber-900 border-amber-300 hover:bg-amber-100/80'
                      : 'bg-[#FAF8F4] text-[#5F6977] border-[#E5DDD0] hover:bg-[#F3ECE0] hover:text-[#181A17]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold leading-none ${
                    active
                      ? 'bg-white/20 text-white'
                      : tab.highlight
                        ? 'bg-amber-200 text-amber-950'
                        : 'bg-[#EAE4D8] text-[#5C6658]'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search + Compact Filter Toggle */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-[#F0EAE0]">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#747D88]"
              aria-hidden="true"
            />
            <input
              type="text"
              aria-label={t(
                'customer.requests.searchPlaceholder',
                isEn ? 'Search order code, horse, route...' : 'Tìm theo mã đơn, tên ngựa, địa điểm...',
              )}
              placeholder={t(
                'customer.requests.searchPlaceholder',
                isEn ? 'Search order code, horse, route...' : 'Tìm theo mã đơn, tên ngựa, địa điểm...',
              )}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#D8CEBE] bg-[#FAF8F4] focus:bg-white text-xs font-medium text-[#181A17] placeholder:text-[#747D88] outline-none focus:border-[#A67C2E] transition-colors"
            />
          </div>

          <button
            type="button"
            aria-expanded={showAdvancedFilters}
            onClick={() => setShowAdvancedFilters((v) => !v)}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              showAdvancedFilters || departureDateFrom || departureDateTo
                ? 'border-[#A67C2E] bg-[#FAF4E6] text-[#8C6621]'
                : 'border-[#D8CEBE] bg-[#FAF8F4] text-[#5F6977] hover:bg-[#F3ECE0] hover:text-[#181A17]'
            }`}
          >
            <SlidersHorizontal size={13} aria-hidden="true" />
            <span>{isEn ? 'Filters' : 'Bộ lọc'}</span>
            {(departureDateFrom || departureDateTo) && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#A67C2E]" />
            )}
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="px-3 py-2 rounded-xl border border-[#D4C5A3] bg-[#FAF8F4] text-[#8C6621] hover:bg-[#F5EFE2] text-xs font-semibold cursor-pointer transition-colors"
            >
              {t('common.clearFilter', isEn ? 'Clear' : 'Xóa lọc')}
            </button>
          )}
        </div>

        {showAdvancedFilters && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-dashed border-[#E5DDD0]">
            <div className="flex items-center gap-1.5 flex-wrap">
              <label htmlFor="req-date-from" className="text-xs font-semibold text-[#5F6977]">
                {t('customer.requests.departureDate', isEn ? 'Departure:' : 'Khởi hành:')}
              </label>
              <input
                id="req-date-from"
                type="date"
                aria-label={isEn ? 'Departure date from' : 'Từ ngày khởi hành'}
                value={departureDateFrom}
                onChange={(e) => setDepartureDateFrom(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-[#D8CEBE] bg-white text-xs text-[#181A17] outline-none focus:border-[#A67C2E]"
              />
              <span className="text-xs text-[#747D88]" aria-hidden="true">→</span>
              <input
                id="req-date-to"
                type="date"
                aria-label={isEn ? 'Departure date to' : 'Đến ngày khởi hành'}
                value={departureDateTo}
                min={departureDateFrom}
                onChange={(e) => setDepartureDateTo(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-[#D8CEBE] bg-white text-xs text-[#181A17] outline-none focus:border-[#A67C2E]"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#5F6977] font-semibold">
                {t('common.rows', isEn ? 'Rows:' : 'Hiển thị:')}
              </span>
              <div className="inline-flex p-0.5 rounded-lg bg-[#F0EEE8] border border-[#E5DDD0]">
                {([10, 20] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={limit === n}
                    onClick={() => setLimit(n)}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                      limit === n ? 'bg-white text-[#181A17] shadow-xs' : 'text-[#5F6977] hover:text-[#181A17]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Container */}
      <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-sm">
        {loading ? (
          <div role="status" className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div
                key={idx}
                className="h-14 w-full rounded-xl bg-[#FAF8F4] animate-pulse motion-reduce:animate-none"
              />
            ))}
            <span className="sr-only">{t('common.loading', 'Đang tải...')}</span>
          </div>
        ) : error ? (
          <div
            role="alert"
            className="p-8 text-center text-[#B33E3E] bg-[#F8EAEA] text-sm font-semibold flex flex-col items-center gap-3"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void fetchOrders()}
              className="px-4 py-2 rounded-xl border border-[#E5B8B8] bg-white text-[#B33E3E] text-xs font-bold cursor-pointer hover:bg-[#FAF8F4]"
            >
              {t('common.retry', isEn ? 'Retry' : 'Thử lại')}
            </button>
          </div>
        ) : displayedOrders.length === 0 ? (
          <div className="py-14 px-6 text-center text-[#5F6977] text-sm">
            <div className="flex flex-col items-center gap-3">
              <span className="font-medium">
                {hasActiveFilters
                  ? t(
                      'common.noResults',
                      isEn ? 'No orders match your filters.' : 'Không tìm thấy đơn phù hợp bộ lọc.',
                    )
                  : t('customer.requests.empty', isEn ? 'No transport orders yet.' : 'Chưa có yêu cầu vận chuyển nào.')}
              </span>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="px-3.5 py-2 rounded-xl border border-[#D4C5A3] bg-[#FAF8F4] text-[#8C6621] text-xs font-semibold cursor-pointer"
                >
                  {t('common.clearFilter', isEn ? 'Clear Filters' : 'Xóa bộ lọc')}
                </button>
              ) : (
                <Link
                  href="/customer/requests/new"
                  className="px-4 py-2 rounded-xl bg-[#181A17] text-[#FAF8F4] text-xs font-bold no-underline"
                >
                  {t('customer.requests.createNew', isEn ? 'Create New Order' : 'Tạo đơn mới')}
                </Link>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Table (Compact 6 columns — fits 1280px pinned sidebar with 0 horizontal overflow) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-[#FAF8F4] border-b border-[#E5DDD0]">
                    <th className="py-3 px-4 text-[11px] font-bold uppercase tracking-wider text-[#5F6977] whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleSort('createdAt')}
                        className="inline-flex items-center gap-1 bg-transparent border-0 p-0 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-[#5F6977]"
                      >
                        {isEn ? 'Order & Horses' : 'Mã đơn & Chiến mã'} <SortIcon field="createdAt" />
                      </button>
                    </th>
                    <th className="py-3 px-3 text-[11px] font-bold uppercase tracking-wider text-[#5F6977] whitespace-nowrap">
                      {t('customer.table.route', isEn ? 'Route' : 'Tuyến đường')}
                    </th>
                    <th
                      className="py-3 px-3 whitespace-nowrap"
                      aria-sort={
                        sortBy === 'requestedDate'
                          ? sortOrder === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      <button
                        type="button"
                        onClick={() => handleSort('requestedDate')}
                        className="inline-flex items-center gap-1 bg-transparent border-0 p-0 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-[#5F6977]"
                      >
                        {t('customer.table.departure', isEn ? 'Departure' : 'Khởi hành')}{' '}
                        <SortIcon field="requestedDate" />
                      </button>
                    </th>
                    <th
                      className="py-3 px-3 whitespace-nowrap text-right"
                      aria-sort={
                        sortBy === 'totalCost'
                          ? sortOrder === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      <button
                        type="button"
                        onClick={() => handleSort('totalCost')}
                        className="inline-flex items-center gap-1 bg-transparent border-0 p-0 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-[#5F6977] ml-auto"
                      >
                        {t('customer.table.cost', isEn ? 'Total' : 'Chi phí')}{' '}
                        <SortIcon field="totalCost" />
                      </button>
                    </th>
                    <th className="py-3 px-3 text-[11px] font-bold uppercase tracking-wider text-[#5F6977] whitespace-nowrap">
                      {t('customer.table.status', isEn ? 'Status' : 'Trạng thái')}
                    </th>
                    <th className="py-3 px-4 text-[11px] font-bold uppercase tracking-wider text-[#5F6977] text-right whitespace-nowrap">
                      {t('customer.table.action', isEn ? 'Actions' : 'Thao tác')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEAE0]">
                  {displayedOrders.map((order) => {
                    const code =
                      order.customerRequestCode ||
                      order.requestCode ||
                      `REQ-${String(order.id).padStart(3, '0')}`;
                    const meta = getShipmentStatusMeta(order.status);
                    const statusLower = (order.status || '').toLowerCase();
                    const firstHorse = order.horses?.[0]?.name;
                    const extraHorses = (order.horses?.length || 0) - 1;

                    return (
                      <tr key={order.id} className="hover:bg-[#FAF8F4]/70 transition-colors">
                        <td className="py-3.5 px-4 align-top">
                          <div className="flex flex-col gap-0.5">
                            <Link
                              href={`/customer/requests/${order.id}`}
                              className="font-mono font-bold text-[#A67C2E] hover:underline text-xs"
                            >
                              {code}
                            </Link>
                            <div className="flex items-center gap-1.5 text-xs text-[#181A17] font-semibold">
                              <span className="truncate max-w-[150px]">{firstHorse || '—'}</span>
                              {extraHorses > 0 && (
                                <span className="text-[10px] font-bold text-[#5F6977] bg-[#FAF8F4] px-1.5 py-0.5 rounded border border-[#E5DDD0] shrink-0">
                                  +{extraHorses}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-3 text-xs text-[#181A17] align-top">
                          <div
                            className="font-medium leading-snug max-w-[210px] line-clamp-2"
                            title={`${order.originLocation} → ${order.destinationLocation}`}
                          >
                            {shortPlace(order.originLocation)} → {shortPlace(order.destinationLocation)}
                          </div>
                        </td>

                        <td className="py-3.5 px-3 text-xs text-[#5F6977] whitespace-nowrap align-top tabular-nums">
                          {formatDate(order.departureDate || order.requestedDate, language)}
                        </td>

                        <td
                          className={`py-3.5 px-3 text-xs font-bold whitespace-nowrap text-right align-top tabular-nums ${
                            order.totalCost > 0 ? 'text-[#181A17]' : 'text-[#747D88]'
                          }`}
                        >
                          {formatCurrency(order.totalCost)}
                        </td>

                        <td className="py-3.5 px-3 align-top">
                          <div className="flex flex-col items-start gap-1">
                            <span
                              className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap"
                              style={{
                                backgroundColor: meta.bg,
                                color: meta.color,
                                border: `1px solid ${meta.border}`,
                              }}
                            >
                              {formatShipmentStatusLabel(order.status, isEn)}
                            </span>
                            {statusLower === 'awaiting_payment' && (
                              <PaymentCountdownBadge
                                paymentDueAt={order.paymentDueAt}
                                createdAt={order.createdAt}
                                compact
                              />
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap align-top">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {renderContextualAction(order)}
                            <Link
                              href={`/customer/requests/${order.id}`}
                              className="px-2.5 py-1.5 rounded-lg border border-[#D8CEBE] bg-white hover:bg-[#FAF8F4] text-xs text-[#181A17] font-semibold inline-flex items-center gap-1 no-underline transition-colors"
                            >
                              <Eye size={13} aria-hidden="true" />
                              <span>{t('common.view', isEn ? 'View' : 'Xem')}</span>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List (< 768px) */}
            <div className="md:hidden divide-y divide-[#EFEAE0]">
              {displayedOrders.map((order) => {
                const code =
                  order.customerRequestCode ||
                  order.requestCode ||
                  `REQ-${String(order.id).padStart(3, '0')}`;
                const meta = getShipmentStatusMeta(order.status);
                const statusLower = (order.status || '').toLowerCase();
                const firstHorse = order.horses?.[0]?.name;
                const extraHorses = (order.horses?.length || 0) - 1;

                return (
                  <div key={order.id} className="p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/customer/requests/${order.id}`}
                          className="font-mono font-bold text-[#A67C2E] text-sm no-underline hover:underline"
                        >
                          {code}
                        </Link>
                        <div className="text-xs font-bold text-[#181A17] mt-0.5 truncate">
                          {firstHorse || '—'}
                          {extraHorses > 0 ? ` (+${extraHorses})` : ''}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap"
                          style={{
                            backgroundColor: meta.bg,
                            color: meta.color,
                            border: `1px solid ${meta.border}`,
                          }}
                        >
                          {formatShipmentStatusLabel(order.status, isEn)}
                        </span>
                        {statusLower === 'awaiting_payment' && (
                          <PaymentCountdownBadge
                            paymentDueAt={order.paymentDueAt}
                            createdAt={order.createdAt}
                            compact
                          />
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-1.5 text-xs text-[#181A17] bg-[#FAF8F4] px-3 py-2 rounded-xl border border-[#EFEAE0]">
                      <MapPin size={13} className="text-[#A67C2E] shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="font-medium">
                        {shortPlace(order.originLocation)} → {shortPlace(order.destinationLocation)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1 text-[#5F6977]">
                        <Calendar size={12} aria-hidden="true" />
                        {formatDate(order.departureDate || order.requestedDate, language)}
                      </span>
                      <span className="font-extrabold text-[#181A17] tabular-nums">
                        {formatCurrency(order.totalCost)}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F4EFE6]">
                      {renderContextualAction(order)}
                      <Link
                        href={`/customer/requests/${order.id}`}
                        className="px-3 py-1.5 rounded-lg border border-[#D8CEBE] bg-white text-xs text-[#181A17] font-semibold inline-flex items-center gap-1 no-underline"
                      >
                        <Eye size={13} aria-hidden="true" />
                        <span>{t('common.viewDetails', isEn ? 'Details' : 'Chi tiết')}</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Pagination Footer */}
        {!loading && totalFiltered > 0 && (
          <div className="px-4 sm:px-5 py-3.5 border-t border-[#EFEAE0] bg-[#FAF8F4] flex items-center justify-between flex-wrap gap-3">
            <div className="text-xs text-[#5F6977]">
              {`${t('common.showing', isEn ? 'Showing' : 'Hiển thị')} ${(safePage - 1) * limit + 1}–${Math.min(safePage * limit, totalFiltered)} / ${totalFiltered} ${t('common.requestsUnit', isEn ? 'orders' : 'đơn')}`}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="px-2.5 py-1.5 rounded-lg border border-[#D8CEBE] bg-white text-xs font-semibold text-[#181A17] hover:bg-[#FAF8F4] disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft size={14} aria-hidden="true" /> {t('common.prev', isEn ? 'Prev' : 'Trước')}
                </button>

                {(() => {
                  const maxButtons = 5;
                  let startPage = Math.max(1, safePage - Math.floor(maxButtons / 2));
                  let endPage = startPage + maxButtons - 1;
                  if (endPage > totalPages) {
                    endPage = totalPages;
                    startPage = Math.max(1, endPage - maxButtons + 1);
                  }
                  const pages: number[] = [];
                  for (let i = startPage; i <= endPage; i++) pages.push(i);
                  return pages.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      aria-current={safePage === p ? 'page' : undefined}
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                        safePage === p
                          ? 'bg-[#181A17] text-white border-[#181A17]'
                          : 'bg-white text-[#5F6977] border-[#D8CEBE] hover:bg-[#FAF8F4]'
                      }`}
                    >
                      {p}
                    </button>
                  ));
                })()}

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="px-2.5 py-1.5 rounded-lg border border-[#D8CEBE] bg-white text-xs font-semibold text-[#181A17] hover:bg-[#FAF8F4] disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center gap-1 cursor-pointer"
                >
                  {t('common.next', isEn ? 'Next' : 'Sau')} <ChevronRight size={14} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Inline SePay Payment Popup */}
      {payModalOrder && (
        <SepayPaymentModal
          isOpen={Boolean(payModalOrder)}
          shipmentId={payModalOrder.id}
          requestCode={
            payModalOrder.customerRequestCode ||
            payModalOrder.requestCode ||
            `REQ-${String(payModalOrder.id).padStart(3, '0')}`
          }
          amount={Number(payModalOrder.totalCost || 0)}
          paymentDueAt={payModalOrder.paymentDueAt}
          createdAt={payModalOrder.createdAt}
          onClose={() => setPayModalOrder(null)}
          onPaid={() => {
            void fetchOrders();
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('customer-orders-updated'));
            }
          }}
        />
      )}
    </div>
  );
}
