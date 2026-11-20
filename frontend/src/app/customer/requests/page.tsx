'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  Download,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api-client';
import { escapeQuotationText } from '@/features/orders/quotation-html';
import { bookingName, type BookingType } from '@/features/orders/booking-policy';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────
type ShipmentStatus =
  | 'requested'
  | 'change_requested'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'planning'
  | 'confirmed'
  | 'ready_to_depart'
  | 'in_transit'
  | 'completed'
  | 'cancelled';

interface OrderHorse {
  horseId: number;
  name: string;
  breed: string | null;
  gender: string | null;
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
  status: ShipmentStatus;
  totalCost: number;
  transportCost?: number | null;
  insuranceFee?: number;
  createdAt: string;
  customerEmail?: string;
  horses?: OrderHorse[];
  specialRequirements?: string | null;
  rejectionReason?: string | null;
}

interface PaginatedOrders {
  data: TransportOrder[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

type SortField = 'createdAt' | 'totalCost' | 'requestedDate';
type SortOrder = 'asc' | 'desc';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<ShipmentStatus, string> = {
  requested: 'Pending Approval',
  under_review: 'Under Review',
  change_requested: 'Change Requested',
  approved: 'Approved',
  rejected: 'Rejected',
  planning: 'Planning',
  confirmed: 'Confirmed',
  ready_to_depart: 'Ready to Depart',
  in_transit: 'In Transit',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_VARIANT: Record<ShipmentStatus, string> = {
  requested: 'pending',
  under_review: 'pending',
  change_requested: 'pending',
  approved: 'success',
  rejected: 'danger',
  planning: 'pending',
  confirmed: 'info',
  ready_to_depart: 'info',
  in_transit: 'transit',
  completed: 'success',
  cancelled: 'danger',
};

const STATUS_COLORS: Record<ShipmentStatus, { bg: string; color: string; border: string }> = {
  requested: { bg: '#F8F0DF', color: '#966516', border: '#DFCA9A' },
  under_review: { bg: '#FAF8F4', color: '#A67C2E', border: '#D4C5A3' },
  change_requested: { bg: '#F8F0DF', color: '#966516', border: '#DFCA9A' },
  approved: { bg: '#E8F2EB', color: '#287653', border: '#B7DBC4' },
  rejected: { bg: '#F8EAEA', color: '#B33E3E', border: '#E5B8B8' },
  planning: { bg: '#FAF8F4', color: '#A67C2E', border: '#D4C5A3' },
  confirmed: { bg: '#FAF8F4', color: '#181A17', border: '#D4C5A3' },
  ready_to_depart: { bg: '#E8F2EB', color: '#287653', border: '#B7DBC4' },
  in_transit: { bg: '#FAF8F4', color: '#A67C2E', border: '#D4C5A3' },
  completed: { bg: '#E8F2EB', color: '#287653', border: '#B7DBC4' },
  cancelled: { bg: '#F0EEE8', color: '#5B6779', border: '#D8CEBE' },
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function toLocalDateString(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatCurrency(n: number) {
  if (!n || n === 0) return '—';
  return n.toLocaleString('vi-VN') + ' ₫';
}

// ─── PDF Export ───────────────────────────────────────────────────────────────
function exportQuotationPDF(order: TransportOrder) {
  const statusColor = STATUS_COLORS[order.status] || { bg: '#F0EEE8', color: '#5B6779', border: '#D8CEBE' };

  const horsesRows =
    order.horses
      ?.map(
        (h) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #EAE5DA;">${escapeQuotationText(h.name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #EAE5DA;">${escapeQuotationText(h.breed || '—')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #EAE5DA;">${escapeQuotationText(h.gender || '—')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #EAE5DA;">${escapeQuotationText(h.age ?? '—')} yrs</td>
    </tr>`,
      )
      .join('') ||
    '<tr><td colspan="4" style="padding:12px;color:#787770;text-align:center;">Không có thông tin ngựa</td></tr>';

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Báo Giá Dự Kiến - ${escapeQuotationText(order.requestCode || `#${order.id}`)}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#181A17;background:#fff}
    .page{max-width:800px;margin:0 auto;padding:40px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:24px;border-bottom:3px solid #A67C2E;margin-bottom:28px}
    .brand-name{font-size:22px;font-weight:800;color:#181A17;letter-spacing:0.02em}
    .brand-sub{font-size:12px;color:#5F6977;margin-top:3px}
    .doc-title{font-size:24px;font-weight:800;color:#A67C2E;text-align:right}
    .doc-id{font-size:13px;color:#57564E;text-align:right;margin-top:4px}
    .doc-date{font-size:12px;color:#787770;text-align:right;margin-top:2px}
    .status-badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;background:${statusColor.bg};color:${statusColor.color};border:1px solid ${statusColor.border};margin-top:6px}
    .section{margin-bottom:24px}
    .section-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#5F6977;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #EAE5DA}
    .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
    .info-box{background:#FAF8F4;padding:14px 16px;border-radius:8px;border:1px solid #D8CEBE}
    .info-label{font-size:11px;color:#5F6977;text-transform:uppercase;font-weight:600;margin-bottom:4px}
    .info-value{font-size:14px;font-weight:600;color:#181A17}
    table{width:100%;border-collapse:collapse;border:1px solid #D8CEBE;border-radius:8px;overflow:hidden}
    thead{background:#181A17}
    thead th{padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#F5EFE2;text-align:left}
    .cost-section{background:linear-gradient(135deg,#181A17,#242722);border:1px solid #A67C2E;border-radius:12px;padding:24px;margin:24px 0;color:#FAF8F4}
    .cost-label{font-size:13px;color:#D4C5A3;margin-bottom:4px}
    .cost-value{font-size:30px;font-weight:800;color:#FFFFFF}
    .cost-sub{font-size:11px;color:rgba(247,247,244,0.72);margin-top:4px}
    .note-box{background:#F8F0DF;border:1px solid #DFCA9A;border-radius:8px;padding:12px 16px;font-size:12px;color:#73521A}
    .footer{margin-top:32px;padding-top:20px;border-top:1px solid #EAE5DA;display:flex;justify-content:space-between;font-size:11px;color:#5F6977}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="brand-name">EquiTransit Logistics</div>
      <div class="brand-sub">Cross-Border Equine Logistics System</div>
      <div class="brand-sub" style="margin-top:8px">Hotline: +84 28 3899 6688 | operations@equitransit.logistics</div>
    </div>
    <div>
      <div class="doc-title">BÁO GIÁ DỰ KIẾN</div><p style="font-size:12px;margin-top:8px;color:#5F6977">Chưa yêu cầu thanh toán. Hóa đơn được phát hành sau khi lộ trình được xác nhận.</p>
      <div class="doc-id">Mã yêu cầu: ${escapeQuotationText(order.requestCode || `#${order.id}`)}</div>
      <div class="doc-date">Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}</div>
      <div style="text-align:right"><span class="status-badge">${escapeQuotationText(STATUS_LABELS[order.status] || order.status)}</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Thông tin khách hàng</div>
    <div class="grid-2">
      <div class="info-box">
        <div class="info-label">Tên liên hệ</div>
        <div class="info-value">${escapeQuotationText(order.contactName || '—')}</div>
      </div>
      <div class="info-box">
        <div class="info-label">Email</div>
        <div class="info-value">${escapeQuotationText(order.contactEmail)}</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Thông tin tuyến vận chuyển</div>
    <div class="grid-3">
      <div class="info-box">
        <div class="info-label">Điểm xuất phát</div>
        <div class="info-value">${escapeQuotationText(order.originLocation)}</div>
      </div>
      <div class="info-box">
        <div class="info-label">Điểm đến</div>
        <div class="info-value">${escapeQuotationText(order.destinationLocation)}</div>
      </div>
      <div class="info-box">
        <div class="info-label">Ngày yêu cầu xuất phát</div>
        <div class="info-value">${formatDate(order.requestedDate)}</div>
      </div>
    </div>
    ${order.specialRequirements ? `<div class="note-box" style="margin-top:12px"><strong>Yêu cầu đặc biệt:</strong> ${escapeQuotationText(order.specialRequirements)}</div>` : ''}
  </div>

  <div class="section">
    <div class="section-title">Danh sách ngựa vận chuyển (${order.horses?.length || 0} con)</div>
    <table>
      <thead>
        <tr>
          <th>Tên ngựa</th><th>Giống</th><th>Giới tính</th><th>Tuổi</th>
        </tr>
      </thead>
      <tbody>${horsesRows}</tbody>
    </table>
  </div>

  <div class="cost-section">
    <p>Hình thức: ${bookingName(order.bookingType)}</p>
    ${order.stallUnitPrice == null ? '' : `<p>${order.stallUnitPrice.toLocaleString('vi-VN')} VNĐ / ô × ${order.requestedHorseCount ?? 1} ngựa</p>`}
    <div class="cost-label">Tổng cước vận chuyển và bảo hiểm</div>
    <p>Cước cơ bản: ${order.transportCost == null ? 'Chờ báo giá' : order.transportCost.toLocaleString('vi-VN') + ' VNĐ'} · Phí bảo hiểm: ${(order.insuranceFee ?? 0).toLocaleString('vi-VN')} VNĐ</p>
    <div class="cost-value">${order.totalCost > 0 ? order.totalCost.toLocaleString('vi-VN') + ' ₫' : 'Chưa định giá'}</div>
    <div class="cost-sub">${order.totalCost > 0 ? 'Đã bao gồm: phí vận chuyển, kiểm dịch và hải quan cơ bản' : 'Vui lòng chờ Logistics Manager xác nhận báo giá chính thức'}</div>
  </div>

  ${order.rejectionReason ? `
  <div class="section">
    <div class="section-title" style="color:#b91c1c">Lý do từ chối</div>
    <div class="note-box" style="background:#fee2e2;border-color:#fecaca;color:#b91c1c">${escapeQuotationText(order.rejectionReason)}</div>
  </div>` : ''}

  <div class="footer">
    <div>
      <div>EquiTransit Logistics</div>
      <div>MST: 0315678901 | Số 123 Đường Nguyễn Huệ, Q.1, TP.HCM</div>
    </div>
    <div style="text-align:right">
      <div>Tài liệu này có giá trị trong 30 ngày kể từ ngày xuất</div>
      <div>Powered by RaceHorse Transport System v2.0</div>
    </div>
  </div>
</div>
<script>window.onload=function(){window.print()}</script>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    toast.error('Trình duyệt đã chặn pop-up. Hệ thống đang tự động tải tệp Báo giá về máy...');
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `BaoGia_${order.requestCode || order.id}.html`;
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
  const lang = useLanguage?.() || ({} as any);
  const language = lang?.language || 'vi';
  const t = lang?.t || ((_k: string, fb?: string) => fb || _k);
  const translateStatus = lang?.translateStatus || ((s: string) => STATUS_LABELS[s as ShipmentStatus] || s);

  // Filter & sort state
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<ShipmentStatus | 'all'>('all');
  const [departureDateFrom, setDepartureDateFrom] = useState('');
  const [departureDateTo, setDepartureDateTo] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<10 | 20>(10);

  // Data state
  const [orders, setOrders] = useState<TransportOrder[]>([]);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (departureDateFrom) params.set('departureDateFrom', departureDateFrom);
      if (departureDateTo) params.set('departureDateTo', departureDateTo);
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);
      params.set('page', String(page));
      params.set('limit', String(limit));

      const result = await apiClient<any>(`/orders/my-orders?${params.toString()}`);
      if (Array.isArray(result)) {
        let list: TransportOrder[] = [...result];
        if (filterStatus !== 'all') {
          list = list.filter((o) => o.status === filterStatus);
        }
        if (departureDateFrom) {
          list = list.filter((o) => {
            const dateStr = toLocalDateString(o.departureDate || o.requestedDate);
            return dateStr && dateStr >= departureDateFrom;
          });
        }
        if (departureDateTo) {
          list = list.filter((o) => {
            const dateStr = toLocalDateString(o.departureDate || o.requestedDate);
            return dateStr && dateStr <= departureDateTo;
          });
        }
        if (sortBy === 'totalCost') {
          list.sort((a, b) => (sortOrder === 'asc' ? a.totalCost - b.totalCost : b.totalCost - a.totalCost));
        } else if (sortBy === 'requestedDate') {
          list.sort((a, b) => (sortOrder === 'asc' ? new Date(a.requestedDate).getTime() - new Date(b.requestedDate).getTime() : new Date(b.requestedDate).getTime() - new Date(a.requestedDate).getTime()));
        } else {
          list.sort((a, b) => (sortOrder === 'asc' ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        }
        const total = list.length;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const paginated = list.slice((page - 1) * limit, page * limit);
        setOrders(paginated);
        setPagination({ total, totalPages });
      } else if (result && Array.isArray(result.data)) {
        setOrders(result.data);
        setPagination({ total: result.total ?? result.data.length, totalPages: result.totalPages ?? 1 });
      } else {
        setOrders([]);
        setPagination({ total: 0, totalPages: 1 });
      }
    } catch (err: any) {
      setOrders([]);
      setPagination({ total: 0, totalPages: 1 });
      setError(err.message || 'Không thể tải đơn hàng. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, departureDateFrom, departureDateTo, sortBy, sortOrder, page, limit]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Reset page khi thay đổi filter
  useEffect(() => {
    setPage(1);
  }, [filterStatus, departureDateFrom, departureDateTo, sortBy, sortOrder, limit]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return <ArrowUpDown size={13} color="#94a3b8" />;
    return sortOrder === 'asc' ? (
      <ArrowUp size={13} color="var(--primary)" />
    ) : (
      <ArrowDown size={13} color="var(--primary)" />
    );
  };

  // Local search filter
  const displayedOrders = orders.filter((o) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      String(o.id).includes(q) ||
      (o.requestCode || '').toLowerCase().includes(q) ||
      (o.customerRequestCode || '').toLowerCase().includes(q) ||
      (o.contactName || '').toLowerCase().includes(q) ||
      o.originLocation.toLowerCase().includes(q) ||
      o.destinationLocation.toLowerCase().includes(q) ||
      (o.horses?.[0]?.name || '').toLowerCase().includes(q)
    );
  });

  const hasActiveFilters = Boolean(search.trim() || filterStatus !== 'all' || departureDateFrom || departureDateTo);

  const clearFilters = () => {
    setSearch('');
    setFilterStatus('all');
    setDepartureDateFrom('');
    setDepartureDateTo('');
    setPage(1);
  };

  const statusFilterOptions: ReadonlyArray<ShipmentStatus | 'all'> = [
    'all',
    'requested',
    'under_review',
    'change_requested',
    'approved',
    'planning',
    'confirmed',
    'ready_to_depart',
    'in_transit',
    'completed',
    'rejected',
    'cancelled',
  ];

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Editorial Header */}
      <header className="border-b border-[#E5DDD0] pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-[#181A17] tracking-tight m-0">
            {t('customer.requests.title', 'Danh Sách Yêu Cầu Vận Chuyển')}
          </h1>
          <p className="text-sm text-[#5F6977] mt-1 mb-0 max-w-3xl">
            {t('customer.requests.subtitle', 'Theo dõi tiến trình phê duyệt, hồ sơ kiểm dịch và trạng thái hành trình ngựa đua.')}
          </p>
        </div>

        <Button
          variant="primary"
          icon={<Plus size={15} className="text-[#C4B38E]" />}
          onClick={() => router.push('/customer/requests/new')}
          className="bg-[#181A17] hover:bg-[#2A2D27] text-[#FBF9F5] font-bold border-0 shadow-sm text-xs px-4 py-2.5 self-start sm:self-auto"
        >
          {t('customer.requests.createNew', 'Tạo Yêu Cầu Mới')}
        </Button>
      </header>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-[#E5DDD0] p-3.5 shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#747D88]" aria-hidden="true" />
          <input
            type="text"
            aria-label={t('customer.requests.searchPlaceholder', 'Tìm theo mã đơn, tên ngựa, địa điểm...')}
            placeholder={t('customer.requests.searchPlaceholder', 'Tìm theo mã đơn, tên ngựa, địa điểm...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#D8CEBE] bg-[#FAF8F4] focus:bg-white text-xs font-medium text-[#181A17] placeholder:text-[#747D88] outline-none focus:border-[#A67C2E] transition-colors"
          />
        </div>

        <select
          aria-label={t('customer.table.status', 'Trạng thái')}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as ShipmentStatus | 'all')}
          className="px-3 py-2 rounded-xl border border-[#D8CEBE] bg-white text-xs font-semibold text-[#181A17] outline-none focus:border-[#A67C2E] cursor-pointer"
        >
          {statusFilterOptions.map((s) => (
            <option key={s} value={s}>
              {s === 'all'
                ? `${t('customer.table.status', 'Trạng thái')}: ${t('common.all', 'Tất cả')}`
                : translateStatus(s)}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5 flex-wrap">
          <label htmlFor="req-date-from" className="text-xs font-semibold text-[#5F6977] hidden md:inline">
            {t('customer.requests.departureDate', 'Khởi hành:')}
          </label>
          <input
            id="req-date-from"
            type="date"
            aria-label={language === 'en' ? 'Departure date from' : 'Từ ngày khởi hành'}
            value={departureDateFrom}
            onChange={(e) => setDepartureDateFrom(e.target.value)}
            className="px-2.5 py-2 rounded-xl border border-[#D8CEBE] bg-white text-xs text-[#181A17] outline-none focus:border-[#A67C2E]"
          />
          <span className="text-xs text-[#747D88]" aria-hidden="true">→</span>
          <input
            id="req-date-to"
            type="date"
            aria-label={language === 'en' ? 'Departure date to' : 'Đến ngày khởi hành'}
            value={departureDateTo}
            min={departureDateFrom}
            onChange={(e) => setDepartureDateTo(e.target.value)}
            className="px-2.5 py-2 rounded-xl border border-[#D8CEBE] bg-white text-xs text-[#181A17] outline-none focus:border-[#A67C2E]"
          />
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="px-3 py-2 rounded-xl border border-[#D4C5A3] bg-[#FAF8F4] text-[#8C6621] hover:bg-[#F5EFE2] text-xs font-semibold cursor-pointer transition-colors"
          >
            {t('common.clearFilter', language === 'en' ? 'Clear Filters' : 'Xóa lọc')}
          </button>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-[#5F6977] font-semibold">{t('common.rows', 'Hiển thị:')}</span>
          <div className="inline-flex p-0.5 rounded-lg bg-[#F0EEE8] border border-[#E5DDD0]">
            {([10, 20] as const).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={limit === n}
                onClick={() => setLimit(n)}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  limit === n ? 'bg-white text-[#181A17] shadow-sm' : 'text-[#5F6977] hover:text-[#181A17]'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-sm">
        {loading ? (
          <div role="status" className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="h-12 w-full rounded-xl bg-[#FAF8F4] animate-pulse motion-reduce:animate-none" />
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
              {t('common.retry', language === 'en' ? 'Retry' : 'Thử lại')}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-left">
            <thead>
              <tr className="bg-[#FAF8F4] border-b border-[#E5DDD0]">
                <th className="py-3 px-4 text-[11px] font-bold uppercase tracking-wider text-[#5F6977] whitespace-nowrap">
                  {t('customer.orderCode', language === 'en' ? 'Order Code' : 'Mã đơn hàng')}
                </th>
                <th className="py-3 px-4 text-[11px] font-bold uppercase tracking-wider text-[#5F6977] whitespace-nowrap">
                  {t('customer.table.horse', 'Chiến mã')}
                </th>
                <th className="py-3 px-4 text-[11px] font-bold uppercase tracking-wider text-[#5F6977] whitespace-nowrap">
                  {t('customer.table.route', 'Tuyến đường')}
                </th>
                <th
                  className="py-3 px-4 whitespace-nowrap"
                  aria-sort={sortBy === 'requestedDate' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button
                    type="button"
                    onClick={() => handleSort('requestedDate')}
                    className="inline-flex items-center gap-1 bg-transparent border-0 p-0 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-[#5F6977]"
                  >
                    {t('customer.table.departure', 'Khởi hành')} <SortIcon field="requestedDate" />
                  </button>
                </th>
                <th
                  className="py-3 px-4 whitespace-nowrap"
                  aria-sort={sortBy === 'totalCost' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button
                    type="button"
                    onClick={() => handleSort('totalCost')}
                    className="inline-flex items-center gap-1 bg-transparent border-0 p-0 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-[#5F6977]"
                  >
                    {t('customer.table.cost', 'Tổng chi phí')} <SortIcon field="totalCost" />
                  </button>
                </th>
                <th className="py-3 px-4 text-[11px] font-bold uppercase tracking-wider text-[#5F6977] whitespace-nowrap">
                  {t('customer.table.status', 'Trạng thái')}
                </th>
                <th
                  className="py-3 px-4 whitespace-nowrap"
                  aria-sort={sortBy === 'createdAt' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button
                    type="button"
                    onClick={() => handleSort('createdAt')}
                    className="inline-flex items-center gap-1 bg-transparent border-0 p-0 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-[#5F6977]"
                  >
                    {t('customer.table.submitted', 'Ngày tạo')} <SortIcon field="createdAt" />
                  </button>
                </th>
                <th className="py-3 px-4 text-[11px] font-bold uppercase tracking-wider text-[#5F6977] text-right whitespace-nowrap">
                  {t('customer.table.action', 'Thao tác')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEAE0]">
              {displayedOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 px-6 text-center text-[#5F6977] text-sm">
                    <div className="flex flex-col items-center gap-3">
                      <span>
                        {hasActiveFilters
                          ? t('common.noResults', language === 'en' ? 'No matching results found' : 'Không tìm thấy đơn phù hợp bộ lọc')
                          : t('customer.requests.empty', 'Chưa có yêu cầu vận chuyển nào.')}
                      </span>
                      {hasActiveFilters ? (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="px-3.5 py-2 rounded-xl border border-[#D4C5A3] bg-[#FAF8F4] text-[#8C6621] text-xs font-semibold cursor-pointer"
                        >
                          {t('common.clearFilter', language === 'en' ? 'Clear Filters' : 'Xóa bộ lọc')}
                        </button>
                      ) : (
                        <Link
                          href="/customer/requests/new"
                          className="px-4 py-2 rounded-xl bg-[#181A17] text-[#FAF8F4] text-xs font-bold no-underline"
                        >
                          {t('customer.requests.createNew', 'Tạo Yêu Cầu Mới')}
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                displayedOrders.map((order) => {
                  const sc = STATUS_COLORS[order.status] || STATUS_COLORS.cancelled;
                  return (
                    <tr key={order.id} className="hover:bg-[#FAF8F4] transition-colors">
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <Link
                          href={`/customer/requests/${order.id}`}
                          className="font-mono font-bold text-[#A67C2E] hover:underline text-xs"
                        >
                          {order.requestCode || order.customerRequestCode || `REQ-${String(order.id).padStart(3, '0')}`}
                        </Link>
                      </td>

                      <td className="py-3.5 px-4">
                        {order.horses && order.horses.length > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-[#181A17] text-xs">
                              {order.horses[0].name}
                            </span>
                            {order.horses.length > 1 && (
                              <span className="text-[11px] text-[#5F6977] bg-[#FAF8F4] px-1.5 py-0.5 rounded border border-[#E5DDD0]">
                                +{order.horses.length - 1}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[#5F6977] text-xs">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-[#181A17] max-w-[260px]">
                        {order.originLocation} → {order.destinationLocation}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-[#5F6977] whitespace-nowrap">
                        {formatDate(order.requestedDate)}
                      </td>

                      <td
                        className={`py-3.5 px-4 text-xs font-bold whitespace-nowrap ${
                          order.totalCost > 0 ? 'text-[#287653]' : 'text-[#5F6977]'
                        }`}
                      >
                        {formatCurrency(order.totalCost)}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
                          style={{
                            backgroundColor: sc.bg,
                            color: sc.color,
                            border: `1px solid ${sc.border}`,
                          }}
                        >
                          {translateStatus(order.status)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-[#5F6977] whitespace-nowrap">
                        {formatDate(order.createdAt)}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => router.push(`/customer/requests/${order.id}`)}
                            className="px-2.5 py-1.5 rounded-lg border border-[#D8CEBE] bg-white hover:bg-[#FAF8F4] text-xs text-[#181A17] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Eye size={13} aria-hidden="true" /> {t('common.view', 'Xem')}
                          </button>
                          <button
                            type="button"
                            onClick={() => exportQuotationPDF(order)}
                            title={language === 'en' ? 'Export Quotation PDF' : 'Xuất báo giá PDF'}
                            aria-label={`${language === 'en' ? 'Export Quotation PDF' : 'Xuất báo giá PDF'} ${order.requestCode || `#${order.id}`}`}
                            className="px-2.5 py-1.5 rounded-lg border border-[#D4C5A3] bg-[#FAF8F4] hover:bg-[#F5EFE2] text-xs text-[#A67C2E] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Download size={13} aria-hidden="true" /> PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!loading && pagination.totalPages >= 1 && (
          <div className="px-5 py-3.5 border-t border-[#EFEAE0] bg-[#FAF8F4] flex items-center justify-between flex-wrap gap-3">
            <div className="text-xs text-[#5F6977]">
              {pagination.total === 0
                ? t('common.noResults', 'Không có kết quả')
                : `${t('common.showing', 'Hiển thị')} ${(page - 1) * limit + 1}–${Math.min(page * limit, pagination.total)} / ${pagination.total} ${t('common.requestsUnit', 'đơn')}`}
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2.5 py-1.5 rounded-lg border border-[#D8CEBE] bg-white text-xs font-semibold text-[#181A17] hover:bg-[#FAF8F4] disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft size={14} aria-hidden="true" /> {t('common.prev', 'Trước')}
                </button>

                {(() => {
                  const maxButtons = 5;
                  const total = pagination.totalPages;
                  let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
                  let endPage = startPage + maxButtons - 1;
                  if (endPage > total) {
                    endPage = total;
                    startPage = Math.max(1, endPage - maxButtons + 1);
                  }
                  const pages: number[] = [];
                  for (let i = startPage; i <= endPage; i++) {
                    pages.push(i);
                  }
                  return pages;
                })().map((pageNum) => (
                  <button
                    key={pageNum}
                    type="button"
                    aria-current={page === pageNum ? 'page' : undefined}
                    onClick={() => setPage(pageNum)}
                    className={`px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                      page === pageNum
                        ? 'border-[#181A17] bg-[#181A17] text-white font-bold'
                        : 'border-[#D8CEBE] bg-white text-[#181A17] font-medium hover:bg-[#FAF8F4]'
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                  className="px-2.5 py-1.5 rounded-lg border border-[#D8CEBE] bg-white text-xs font-semibold text-[#181A17] hover:bg-[#FAF8F4] disabled:opacity-45 disabled:cursor-not-allowed inline-flex items-center gap-1 cursor-pointer"
                >
                  {t('common.next', 'Sau')} <ChevronRight size={14} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
