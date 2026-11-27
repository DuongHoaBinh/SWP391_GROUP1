'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Search,
  Filter,
  Eye,
  CheckCircle,
  Truck,
  Plane,
  Ship,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  XCircle,
  FileText,
  FileEdit,
  Download,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge, BadgeVariant } from '@/components/ui/StatusBadge';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { escapeQuotationText } from '@/features/orders/quotation-html';
import {
  BookingSummary,
  BookingQuoteSummary,
  ManagerFreightSuggestionCard,
} from '@/features/orders/components/BookingSummary';
import { InsuranceSummary } from '@/features/orders/components/InsuranceSummary';
import { SnapshotBreakdown } from '@/features/orders/components/SnapshotBreakdown';
import type { InsuredHorse } from '@/features/orders/insurance-policy';
import {
  bookingName,
  bookingQuotePayload,
  suggestManagerFreightQuote,
  type BookingType,
} from '@/features/orders/booking-policy';
import { buildEquineRoute } from '@/lib/geo-corridors';
import {
  formatShipmentStatusLabel,
  getShipmentStatusMeta,
} from '@/features/orders/shipment-status';

// ─── Types ─────────────────────────────────────────────────────────────────────
type ShipmentStatus =
  | 'requested'
  | 'awaiting_payment'
  | 'paid_pending_review'
  | 'paid_pending_feasibility'
  | 'refund_requested'
  | 'refunded'
  | 'change_requested'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'planning'
  | 'confirmed'
  | 'ready_to_depart'
  | 'in_transit'
  | 'return_pending'
  | 'return_in_transit'
  | 'completed'
  | 'cancelled'
  | 'cancelled_operational'
  | 'payment_overdue'
  | string;

const STATUS_LABELS: Record<ShipmentStatus, string> = {
  requested: 'Pending Approval',
  awaiting_payment: 'Awaiting Payment',
  paid_pending_review: 'Paid - Pending Review',
  refund_requested: 'Refund Requested',
  refunded: 'Refunded',
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

const STATUS_COLORS: Record<ShipmentStatus, { bg: string; color: string; border: string }> = {
  requested: { bg: '#F8F0DF', color: '#966516', border: '#DFCA9A' },
  awaiting_payment: { bg: '#F8F0DF', color: '#966516', border: '#DFCA9A' },
  paid_pending_review: { bg: '#E8F2EB', color: '#287653', border: '#B7DBC4' },
  refund_requested: { bg: '#F8EAEA', color: '#B33E3E', border: '#E5B8B8' },
  refunded: { bg: '#F0EEE8', color: '#5B6779', border: '#D8CEBE' },
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

interface OrderHorse extends Partial<InsuredHorse> {
  horseId?: number;
  name?: string;
  breed?: string | null;
  age?: number | null;
  requiresPrivateStall?: boolean;
  color?: string | null;
  weight?: number | null;
  medicalStatus?: string | null;
  microchipNo?: string | null;
  passportNo?: string | null;
  specialRequirements?: string | null;
}

interface TransportOrder {
  id: number;
  requestCode?: string | null;
  userId: number;
  customerName?: string;
  customerEmail?: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  originLocation: string;
  originAddress?: string;
  destinationLocation: string;
  destinationAddress?: string;
  requestedDate: string;
  estimatedArrival?: string | null;
  status: ShipmentStatus;
  totalCost: number;
  transportCost?: number | null;
  insuranceFee?: number | null;
  insurancePlan?: string | null;
  insuranceCoverage?: number | null;
  specialRequirements?: string | null;
  internalNotes?: string | null;
  rejectionReason?: string | null;
  transportMode?: 'road' | 'air' | 'sea' | null;
  seaMode?: 'vessel' | null;
  quoteId?: string | number | null;
  pricingSnapshot?: any | null;
  distanceKm?: number | null;
  distanceSource?: string | null;
  bookingType?: BookingType;
  stallUnitPrice?: number | null;
  requestedHorseCount?: number;
  createdAt: string;
  updatedAt: string;
  horses?: OrderHorse[];
}

type SortField = 'createdAt' | 'requestedDate' | 'totalCost' | 'status' | 'id';
type SortOrder = 'asc' | 'desc';

// Helper for status config
function getStatusBadgeConfig(status: ShipmentStatus): { variant: BadgeVariant } {
  return { variant: getShipmentStatusMeta(status).variant };
}

// ─── Formatters ────────────────────────────────────────────────────────────────
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('vi-VN');
  } catch {
    return dateStr;
  }
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) return 'Chưa định giá';
  if (amount === 0) return '0 ₫';
  return amount.toLocaleString('vi-VN') + ' ₫';
}

// ─── PDF Export (Safe with XSS Escaping & Pop-up Handling) ──────────────────────
function exportQuotationPDF(order: TransportOrder, isEn = false, statusLabel?: string) {
  const resolvedStatusLabel = statusLabel || STATUS_LABELS[order.status] || order.status;
  const sc = STATUS_COLORS[order.status] || { bg: '#F0EEE8', color: '#5B6779', border: '#D8CEBE' };
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    toast.error(
      isEn
        ? 'Browser blocked new window. Please allow popups to print quotation.'
        : 'Trình duyệt đang chặn mở cửa sổ mới. Vui lòng cho phép pop-up để in báo giá.'
    );
    return;
  }

  const horsesHtml =
    order.horses && order.horses.length > 0
      ? order.horses
          .map(
            (h) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #D8CEBE;font-weight:600;">${escapeQuotationText(h.name || '—')}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #D8CEBE;">${escapeQuotationText(h.breed || '—')}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #D8CEBE;">${h.age !== null && h.age !== undefined ? `${h.age} ${isEn ? 'yo' : 'tuổi'}` : '—'}</td>
      </tr>`
          )
          .join('')
      : `<tr><td colspan="3" style="padding:12px;text-align:center;color:#5C6658;">${isEn ? 'No horse manifest information' : 'Chưa có thông tin ngựa'}</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="${isEn ? 'en' : 'vi'}">
<head>
  <meta charset="UTF-8">
  <title>${isEn ? 'Transport Quotation' : 'Báo Giá Vận Chuyển'} - ${escapeQuotationText(order.requestCode || `#${order.id}`)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #181A17; background: #fff; line-height: 1.5; }
    .page { max-width: 820px; margin: 0 auto; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 3px solid #A67C2E; margin-bottom: 28px; }
    .brand-name { font-size: 22px; font-weight: 800; color: #181A17; letter-spacing: 0.02em; }
    .brand-sub { font-size: 12px; color: #5C6658; margin-top: 2px; }
    .doc-info { text-align: right; }
    .doc-title { font-size: 20px; font-weight: 800; color: #A67C2E; }
    .doc-id { font-size: 13px; color: #2C2F2A; margin-top: 4px; font-weight: 600; }
    .doc-date { font-size: 12px; color: #5C6658; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: ${sc.bg}; color: ${sc.color}; border: 1px solid ${sc.border}; margin-top: 6px; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #5C6658; border-bottom: 1px solid #D8CEBE; padding-bottom: 6px; margin-bottom: 12px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
    .info-box { background: #FAF8F4; border: 1px solid #D8CEBE; border-radius: 8px; padding: 12px 14px; }
    .info-label { font-size: 11px; color: #5C6658; font-weight: 600; text-transform: uppercase; }
    .info-value { font-size: 13px; font-weight: 600; color: #181A17; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #F0EEE8; padding: 8px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #2C2F2A; }
    .cost-section { background: #FAF8F4; border: 2px solid #B49A68; border-radius: 12px; padding: 20px 24px; text-align: center; margin: 28px 0; }
    .cost-label { font-size: 13px; font-weight: 700; color: #181A17; text-transform: uppercase; }
    .cost-value { font-size: 32px; font-weight: 900; color: #A67C2E; margin: 4px 0; }
    .cost-sub { font-size: 12px; color: #5C6658; }
    .note-box { background: #F8F0DF; border: 1px solid #DFCA9A; border-radius: 8px; padding: 12px 14px; font-size: 12px; color: #7A591C; margin-top: 8px; }
    .footer { border-top: 1px solid #D8CEBE; padding-top: 16px; margin-top: 32px; font-size: 11px; color: #5C6658; display: flex; justify-content: space-between; }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .page { padding: 20px; }
    }
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="brand-name">EquiTransit Logistics</div>
      <div class="brand-sub">${isEn ? 'Cross-Border Racehorse Transportation System' : 'Hệ Thống Vận Chuyển Ngựa Đua Xuyên Biên Giới'}</div>
      <div class="brand-sub" style="margin-top:6px;">Hotline: +84 28 3456 7890 | Email: dispatch@equitransit.vn</div>
    </div>
    <div class="doc-info">
      <div class="doc-title">${isEn ? 'OFFICIAL QUOTATION' : 'BÁO GIÁ VẬN CHUYỂN'}</div>
      <div class="doc-id">${isEn ? 'Request Code:' : 'Mã yêu cầu:'} ${escapeQuotationText(order.requestCode || `#${order.id}`)}</div>
      <div class="doc-date">${isEn ? 'Issued Date:' : 'Ngày xuất:'} ${new Date().toLocaleDateString(isEn ? 'en-US' : 'vi-VN')}</div>
      <div><span class="status-badge">${escapeQuotationText(resolvedStatusLabel)}</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">${isEn ? 'Customer Details' : 'Thông tin khách hàng'}</div>
    <div class="grid-2">
      <div class="info-box">
        <div class="info-label">${isEn ? 'Contact Person' : 'Người liên hệ'}</div>
        <div class="info-value">${escapeQuotationText(order.contactName || '—')}</div>
      </div>
      <div class="info-box">
        <div class="info-label">${isEn ? 'Account Email' : 'Email tài khoản'}</div>
        <div class="info-value">${escapeQuotationText(order.contactEmail || order.customerEmail || '—')}</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">${isEn ? 'Route & Schedule' : 'Thông tin lộ trình vận tải'}</div>
    <div class="grid-3">
      <div class="info-box">
        <div class="info-label">${isEn ? 'Origin Location' : 'Điểm xuất phát'}</div>
        <div class="info-value">${escapeQuotationText(order.originLocation)}</div>
      </div>
      <div class="info-box">
        <div class="info-label">${isEn ? 'Destination Location' : 'Điểm đến'}</div>
        <div class="info-value">${escapeQuotationText(order.destinationLocation)}</div>
      </div>
      <div class="info-box">
        <div class="info-label">${isEn ? 'Requested Departure Date' : 'Ngày yêu cầu xuất phát'}</div>
        <div class="info-value">${formatDate(order.requestedDate)}</div>
      </div>
    </div>
    ${
      order.specialRequirements
        ? `<div class="note-box"><strong>${isEn ? 'Special Requirements:' : 'Yêu cầu đặc biệt:'}</strong> ${escapeQuotationText(
            order.specialRequirements
          )}</div>`
        : ''
    }
  </div>

  <div class="section">
    <div class="section-title">${isEn ? `Racehorse Manifest (${order.horses?.length || 0} horses)` : `Danh sách ngựa (${order.horses?.length || 0} con)`}</div>
    <table>
      <thead>
        <tr>
          <th>${isEn ? 'Horse Name' : 'Tên ngựa'}</th>
          <th>${isEn ? 'Breed' : 'Giống'}</th>
          <th>${isEn ? 'Age' : 'Tuổi'}</th>
        </tr>
      </thead>
      <tbody>
        ${horsesHtml}
      </tbody>
    </table>
  </div>

  <div class="cost-section">
    <p style="font-size:12px;margin-bottom:4px;color:#1e293b;">${isEn ? 'Booking Mode' : 'Hình thức'}: <strong>${bookingName(order.bookingType)}</strong></p>
    ${order.stallUnitPrice != null ? `<p style="font-size:12px;margin-bottom:6px;color:#475569;">${order.stallUnitPrice.toLocaleString('vi-VN')} VNĐ / ô × ${order.requestedHorseCount ?? 1} ${isEn ? 'horses' : 'ngựa'}</p>` : ''}
    <div class="cost-label">${isEn ? 'Official Freight Quotation' : 'Tổng cước vận chuyển và bảo hiểm'}</div>
    ${order.transportCost != null ? `<p style="font-size:12px;color:#475569;margin:4px 0;">${isEn ? 'Base Freight:' : 'Cước cơ bản:'} ${order.transportCost.toLocaleString('vi-VN')} VNĐ · ${isEn ? 'Insurance:' : 'Phí bảo hiểm:'} ${(order.insuranceFee ?? 0).toLocaleString('vi-VN')} VNĐ</p>` : ''}
    <div class="cost-value">${
      order.totalCost > 0 ? order.totalCost.toLocaleString('vi-VN') + ' ₫' : (isEn ? 'Not Quoted' : 'Chưa định giá')
    }</div>
    <div class="cost-sub">${
      order.totalCost > 0
        ? (isEn
            ? 'Includes: Road/Air cargo freight, international veterinary quarantine clearances, and transit insurance'
            : 'Đã bao gồm: cước chặng bộ/hàng không, thủ tục kiểm dịch hải quan và bảo hiểm hành trình')
        : (isEn
            ? 'Awaiting Logistics Manager official review and confirmation'
            : 'Vui lòng chờ Logistics Manager kiểm tra và xác nhận báo giá chi tiết')
    }</div>
  </div>

  ${
    order.rejectionReason
      ? `
  <div class="section">
    <div class="section-title" style="color:#b91c1c;">${isEn ? 'Rejection Reason' : 'Lý do từ chối'}</div>
    <div class="note-box" style="background:#fee2e2;border-color:#fecaca;color:#b91c1c;">${escapeQuotationText(
      order.rejectionReason
    )}</div>
  </div>`
      : ''
  }

  <div class="footer">
    <div>${isEn ? 'Generated automatically by Equine Transport Logistics Management System' : 'Được tạo tự động bởi Hệ Thống Quản Lý Vận Chuyển Ngựa Đua Xuyên Quốc Gia'}</div>
    <div>${isEn ? 'Page 1 of 1' : 'Trang 1 / 1'}</div>
  </div>
</div>
<script>
  window.onload = function() { window.print(); }
</script>
</body>
</html>`;

  printWindow.document.open?.();
  printWindow.document.write(html);
  printWindow.document.close();
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function ManagerRequestsPage() {
  const lang = useLanguage() || ({} as any);
  const { t = (_k: string, fb?: string) => fb || _k, language = "vi" } = lang;
  const isEn = language === 'en';

  // Data state
  const [orders, setOrders] = useState<TransportOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter / Sort / Pagination state
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [departureDateFrom, setDepartureDateFrom] = useState('');
  const [departureDateTo, setDepartureDateTo] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(1);
  const [limit] = useState<number>(10);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get('search');
      if (q) setSearch(q);
    } catch {
      // ignore
    }
  }, []);

  // Modals state
  const [viewOrder, setViewOrder] = useState<TransportOrder | null>(null);
  const [approveOrder, setApproveOrder] = useState<TransportOrder | null>(null);
  const [totalCostInput, setTotalCostInput] = useState('');
  const [operatingCostInput, setOperatingCostInput] = useState('');
  const [rejectOrder, setRejectOrder] = useState<TransportOrder | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [requestChangeOrder, setRequestChangeOrder] = useState<TransportOrder | null>(null);
  const [requestChangeReason, setRequestChangeReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Road/Air/Sea transport mode & USD/VND currency states for approval
  const [selectedTransportMode, setSelectedTransportMode] = useState<'road' | 'air' | 'sea'>('road');
  const [costCurrency, setCostCurrency] = useState<'USD' | 'VND'>('VND');
  const [usdToVndRate, setUsdToVndRate] = useState<number>(25400);

  useEffect(() => {
    apiClient<{ usdToVnd?: number }>('/orders/insurance-policy')
      .then((res) => {
        const rate = Number(res?.usdToVnd);
        if (Number.isFinite(rate) && rate > 0) setUsdToVndRate(rate);
      })
      .catch(() => {});
  }, []);

  const openApproveModal = (order: TransportOrder) => {
    setApproveOrder(order);
    const oStr = (order.originLocation || '').toLowerCase();
    const dStr = (order.destinationLocation || '').toLowerCase();
    const reqNotes = (order.specialRequirements || '').toLowerCase();

    const isDomestic =
      (oStr.includes('vietnam') || oStr.includes('việt nam') || oStr.includes('hồ chí minh') || oStr.includes('ho chi minh')) &&
      (dStr.includes('vietnam') || dStr.includes('việt nam') || dStr.includes('hà nội') || dStr.includes('ha noi'));
    const isRoadRequested = reqNotes.includes('đường bộ') || reqNotes.includes('road') || isDomestic;

    const initialMode: 'road' | 'air' | 'sea' =
      order.transportMode === 'air' || order.transportMode === 'road' || order.transportMode === 'sea'
        ? order.transportMode
        : (reqNotes.includes('đường thủy') || reqNotes.includes('tàu biển') || reqNotes.includes('sea')
        ? 'sea'
        : reqNotes.includes('hàng không') || reqNotes.includes('air')
        ? 'air'
        : isRoadRequested
        ? 'road'
        : 'air');
    setSelectedTransportMode(initialMode);

    const routeInfo = buildEquineRoute(order.originLocation || '', order.destinationLocation || '', initialMode);
    const horseCount = order.requestedHorseCount || (order.horses?.length || 1);
    const suggestion = suggestManagerFreightQuote({
      transportMode: initialMode,
      bookingType: order.bookingType ?? 'dedicated_charter',
      horseCount,
      distanceKm: routeInfo.distanceKm,
      customsCount: routeInfo.customsCount,
      usdToVndRate,
    });

    setCostCurrency('VND');
    const shared = order.bookingType !== 'dedicated_charter';
    const existingQuote = shared
      ? Number(order.stallUnitPrice || 0)
      : Number(order.transportCost || 0);
    setTotalCostInput(String(existingQuote > 0 ? existingQuote : suggestion.suggestedInputVnd));
    setOperatingCostInput(String(suggestion.suggestedOperatingCostVnd));
  };

  const handleModeToggle = (newMode: 'road' | 'air' | 'sea') => {
    if (!approveOrder || newMode === selectedTransportMode) return;
    setSelectedTransportMode(newMode);
    const routeInfo = buildEquineRoute(approveOrder.originLocation || '', approveOrder.destinationLocation || '', newMode);
    const horseCount = approveOrder.requestedHorseCount || (approveOrder.horses?.length || 1);
    const suggestion = suggestManagerFreightQuote({
      transportMode: newMode,
      bookingType: approveOrder.bookingType ?? 'dedicated_charter',
      horseCount,
      distanceKm: routeInfo.distanceKm,
      customsCount: routeInfo.customsCount,
      usdToVndRate,
    });
    if (costCurrency === 'USD') {
      setTotalCostInput(String(suggestion.suggestedInputUsd));
    } else {
      setTotalCostInput(String(suggestion.suggestedInputVnd));
    }
    setOperatingCostInput(String(suggestion.suggestedOperatingCostVnd));
  };

  const handleCurrencyToggle = (newCurr: 'USD' | 'VND') => {
    if (newCurr === costCurrency) return;
    const val = parseFloat(totalCostInput);
    if (!isNaN(val) && val > 0) {
      if (newCurr === 'VND') {
        setTotalCostInput(String(Math.round(val * usdToVndRate)));
      } else {
        const usd = val / usdToVndRate;
        setTotalCostInput(usd < 100 ? usd.toFixed(2) : String(Math.round(usd * 100) / 100));
      }
    }
    setCostCurrency(newCurr);
  };

  // Fetch orders from real backend API
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams();
      query.append('page', String(page));
      query.append('limit', String(limit));
      if (filterStatus && filterStatus !== 'all') {
        query.append('status', filterStatus);
      }
      if (departureDateFrom) {
        query.append('departureDateFrom', departureDateFrom);
      }
      if (departureDateTo) {
        query.append('departureDateTo', departureDateTo);
      }
      if (sortBy) {
        query.append('sortBy', sortBy);
        query.append('sortOrder', sortOrder);
      }

      const res = await apiClient<{
        data: TransportOrder[];
        pagination: { total: number; totalPages: number; page: number; limit: number };
      }>(`/orders?${query.toString()}`);

      if (res && Array.isArray(res.data)) {
        setOrders(res.data);
        setPagination({
          total: res.pagination?.total || res.data.length,
          totalPages: res.pagination?.totalPages || 1,
        });
      } else if (Array.isArray(res)) {
        setOrders(res as any);
        setPagination({ total: (res as any).length, totalPages: 1 });
      } else {
        setOrders([]);
        setPagination({ total: 0, totalPages: 1 });
      }
    } catch (err: any) {
      console.error('Failed to fetch orders:', err);
      setError(err?.message || 'Không thể tải danh sách yêu cầu');
      setOrders([]);
      setPagination({ total: 0, totalPages: 1 });
    } finally {
      setLoading(false);
    }
  }, [page, limit, filterStatus, departureDateFrom, departureDateTo, sortBy, sortOrder]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Client-side search, date filtering & sorting
  const filteredAndSortedOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = orders.filter((o) => {
      if (filterStatus && filterStatus !== 'all' && o.status !== filterStatus) {
        return false;
      }
      if (departureDateFrom || departureDateTo) {
        const rawDate = o.requestedDate;
        const dateStr = rawDate ? new Date(rawDate).toISOString().split('T')[0] : '';
        if (departureDateFrom && (!dateStr || dateStr < departureDateFrom)) return false;
        if (departureDateTo && (!dateStr || dateStr > departureDateTo)) return false;
      }
      if (!q) return true;
      return (
        String(o.id).includes(q) ||
        (o.requestCode && o.requestCode.toLowerCase().includes(q)) ||
        (o.contactName && o.contactName.toLowerCase().includes(q)) ||
        (o.contactEmail && o.contactEmail.toLowerCase().includes(q)) ||
        (o.originLocation && o.originLocation.toLowerCase().includes(q)) ||
        (o.destinationLocation && o.destinationLocation.toLowerCase().includes(q))
      );
    });

    return [...filtered].sort((a, b) => {
      const dir = sortOrder === 'asc' ? 1 : -1;
      if (sortBy === 'id') {
        return (Number(a.id) - Number(b.id)) * dir;
      }
      if (sortBy === 'totalCost') {
        return ((Number(a.totalCost) || 0) - (Number(b.totalCost) || 0)) * dir;
      }
      if (sortBy === 'status') {
        return String(a.status || '').localeCompare(String(b.status || '')) * dir;
      }
      if (sortBy === 'requestedDate') {
        const tA = new Date(a.requestedDate || 0).getTime() || 0;
        const tB = new Date(b.requestedDate || 0).getTime() || 0;
        return (tA - tB) * dir;
      }
      const cA = new Date(a.createdAt || 0).getTime() || Number(a.id) || 0;
      const cB = new Date(b.createdAt || 0).getTime() || Number(b.id) || 0;
      return (cA - cB) * dir;
    });
  }, [orders, search, filterStatus, departureDateFrom, departureDateTo, sortBy, sortOrder]);

  const displayedOrders = filteredAndSortedOrders;

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return <ArrowUpDown size={14} className="text-slate-400 opacity-60" />;
    return sortOrder === 'asc' ? (
      <ArrowUp size={14} className="text-[#A67C2E]" />
    ) : (
      <ArrowDown size={14} className="text-[#A67C2E]" />
    );
  };

  // Actions
  const handleApprove = async () => {
    if (!approveOrder || actionLoading) return;
    const hasQuote = Boolean(approveOrder.quoteId);
    if (!hasQuote) {
      const quoted = Number(totalCostInput);
      if (!quoted || isNaN(quoted) || quoted <= 0) {
        toast.error(t('manager.requests.toastValidPrice', 'Vui lòng nhập báo giá hợp lệ (lớn hơn 0)'));
        return;
      }
    }
    const operating = Number(operatingCostInput) || 0;
    setActionLoading(true);
    try {
      const payload = hasQuote
        ? {
            transportMode: selectedTransportMode,
            estimatedOperatingCost: operating,
          }
        : {
            ...bookingQuotePayload(totalCostInput, approveOrder.bookingType ?? 'dedicated_charter', approveOrder.requestedHorseCount ?? 1, costCurrency, usdToVndRate),
            transportMode: selectedTransportMode,
            estimatedOperatingCost: operating,
          };
      await apiClient(`/orders/${approveOrder.id}/approve`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      toast.success(
        t('manager.requests.toastApproveSuccess', `Đã phê duyệt và báo giá thành công cho đơn #${approveOrder.id}`, {
          id: approveOrder.id,
        })
      );
      setApproveOrder(null);
      setTotalCostInput('');
      setOperatingCostInput('');
      fetchOrders();
    } catch (err: any) {
      toast.error(err.message || t('manager.requests.loadFailed', 'Không thể phê duyệt đơn hàng'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectOrder || actionLoading) return;
    if (!rejectReason.trim() || rejectReason.trim().length < 5) {
      toast.error(t('manager.requests.toastRejectMinChars', 'Lý do từ chối phải có ít nhất 5 ký tự'));
      return;
    }
    setActionLoading(true);
    try {
      await apiClient(`/orders/${rejectOrder.id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      toast.success(
        t('manager.requests.toastRejectSuccess', `Đã từ chối đơn hàng #${rejectOrder.id}`, {
          id: rejectOrder.id,
        })
      );
      setRejectOrder(null);
      setRejectReason('');
      fetchOrders();
    } catch (err: any) {
      toast.error(err.message || t('manager.requests.loadFailed', 'Không thể từ chối đơn hàng'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!requestChangeOrder || actionLoading) return;
    if (!requestChangeReason.trim() || requestChangeReason.trim().length < 5) {
      toast.error(t('manager.requests.toastChangeMinChars', 'Vui lòng nhập nội dung yêu cầu sửa đổi (tối thiểu 5 ký tự)'));
      return;
    }
    setActionLoading(true);
    try {
      await apiClient(`/orders/${requestChangeOrder.id}/request-changes`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: requestChangeReason.trim() }),
      });
      toast.success(
        t('manager.requests.toastChangeSuccess', `Đã gửi yêu cầu chỉnh sửa cho đơn #${requestChangeOrder.id}`, {
          id: requestChangeOrder.id,
        })
      );
      setRequestChangeOrder(null);
      setRequestChangeReason('');
      fetchOrders();
    } catch (err: any) {
      toast.error(err.message || t('manager.requests.loadFailed', 'Không thể gửi yêu cầu chỉnh sửa'));
    } finally {
      setActionLoading(false);
    }
  };

  const translateStatus = (s: ShipmentStatus): string => {
    return formatShipmentStatusLabel(s, isEn);
  };

  return (
    <div className="flex flex-col gap-6 max-w-[1600px] mx-auto pb-16">
      {/* ─── Compact Header ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5 flex-wrap m-0">
          {filterStatus === 'all'
            ? isEn
              ? 'Transport Orders'
              : 'Quản Lý Đơn Vận Chuyển'
            : `${isEn ? 'Orders' : 'Đơn Vận Chuyển'}: ${translateStatus(filterStatus)}`}
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#F3EFE4] text-[#181A17] font-bold">
            {pagination.total} {t('manager.requests.totalUnit', 'đơn')}
          </span>
        </h1>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => fetchOrders()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#D8CEBE] bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer shadow-sm transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin shrink-0' : 'shrink-0'} />
            <span>{t('manager.requests.btnRefresh', 'Làm mới')}</span>
          </button>
        </div>
      </div>

      {/* Quick Core Status Pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { key: 'all', label: isEn ? 'All' : 'Tất cả' },
          { key: 'paid_pending_review', label: isEn ? 'Paid · Review' : 'Đã TT · Chờ duyệt' },
          { key: 'awaiting_payment', label: isEn ? 'Awaiting Pay' : 'Chờ thanh toán' },
          { key: 'in_transit', label: isEn ? 'In Transit' : 'Đang vận chuyển' },
          { key: 'completed', label: isEn ? 'Completed' : 'Hoàn tất' },
          { key: 'refund_requested', label: isEn ? 'Refunds' : 'Chờ hoàn tiền' },
        ].map((pill) => (
          <button
            key={pill.key}
            type="button"
            onClick={() => {
              setFilterStatus(pill.key);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
              filterStatus === pill.key
                ? 'bg-[#181A17] text-[#FAF8F4] border-[#181A17]'
                : 'bg-white text-[#5F6977] border-[#E5DDD0] hover:bg-[#FAF8F4] hover:text-[#181A17]'
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* ─── Search & Filters Bar ────────────────────────────────────────────── */}
      <div className="bg-white p-4 rounded-2xl border border-[#D8CEBE] shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            aria-label={t('manager.requests.searchPlaceholder', 'Tìm kiếm theo ID, mã đơn, khách hàng, điểm đi, điểm đến...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('manager.requests.searchPlaceholder', 'Tìm kiếm theo ID, mã đơn, khách hàng, điểm đi, điểm đến...')}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#C4B38E]/20 focus:border-[#181A17] transition-all font-medium"
          />
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status Select */}
          <div className="flex items-center gap-1.5 bg-[#FAF9F5] border border-[#D8CEBE] rounded-xl px-2.5 py-1">
            <Filter size={13} className="text-slate-500" />
            <select
              aria-label={t('manager.requests.colStatus', 'Trạng thái')}
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer py-1"
            >
              <option value="all">{t('manager.requests.filterAllStatus', 'Tất cả trạng thái')}</option>
              <option value="paid_pending_review">{t('manager.requests.statusPaidPendingReview', 'Đã thanh toán, chờ duyệt')}</option>
              <option value="awaiting_payment">{t('manager.requests.statusAwaitingPayment', 'Chờ thanh toán')}</option>
              <option value="requested">{t('manager.requests.statusRequested', 'Mới tạo')}</option>
              <option value="refund_requested">{t('manager.requests.statusRefundRequested', 'Chờ hoàn tiền')}</option>
              <option value="refunded">{t('manager.requests.statusRefunded', 'Đã hoàn tiền')}</option>
              <option value="under_review">{t('manager.requests.statusUnderReview', 'Đang thẩm định')}</option>
              <option value="approved">{t('manager.requests.statusApproved', 'Đã duyệt / Báo giá')}</option>
              <option value="rejected">{t('manager.requests.statusRejected', 'Đã từ chối')}</option>
              <option value="change_requested">{t('manager.requests.statusChangeRequested', 'Yêu cầu chỉnh sửa')}</option>
              <option value="planning">{t('manager.requests.statusPlanning', 'Đang lập tuyến')}</option>
              <option value="confirmed">{t('manager.requests.statusConfirmed', 'Đã xác nhận chuyến')}</option>
              <option value="ready_to_depart">{t('manager.requests.statusReadyToDepart', 'Sẵn sàng xuất phát')}</option>
              <option value="in_transit">{t('manager.requests.statusInTransit', 'Đang vận chuyển')}</option>
              <option value="return_pending">{isEn ? 'Return Leg Pending' : 'Chờ chặng về'}</option>
              <option value="completed">{t('manager.requests.statusCompleted', 'Đã hoàn tất')}</option>
              <option value="cancelled">{t('manager.requests.statusCancelled', 'Đã hủy')}</option>
              <option value="cancelled_operational">{isEn ? 'Cancelled (Operational)' : 'Đã hủy vận hành'}</option>
            </select>
          </div>

          {/* Date Range From */}
          <div className="flex items-center gap-1.5 bg-[#FAF9F5] border border-[#D8CEBE] rounded-xl px-2 py-1">
            <label htmlFor="requests-date-from" className="text-[10px] uppercase font-bold text-slate-500">
              {t('manager.requests.dateFrom', 'Từ')}
            </label>
            <input
              id="requests-date-from"
              type="date"
              value={departureDateFrom}
              onChange={(e) => {
                setDepartureDateFrom(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-xs text-slate-700 focus:outline-none cursor-pointer py-0.5"
            />
          </div>

          {/* Date Range To */}
          <div className="flex items-center gap-1.5 bg-[#FAF9F5] border border-[#D8CEBE] rounded-xl px-2 py-1">
            <label htmlFor="requests-date-to" className="text-[10px] uppercase font-bold text-slate-500">
              {t('manager.requests.dateTo', 'Đến')}
            </label>
            <input
              id="requests-date-to"
              type="date"
              value={departureDateTo}
              onChange={(e) => {
                setDepartureDateTo(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-xs text-slate-700 focus:outline-none cursor-pointer py-0.5"
            />
          </div>

          {/* Clear Filter */}
          {(filterStatus !== 'all' || departureDateFrom || departureDateTo || search) && (
            <button
              type="button"
              onClick={() => {
                setFilterStatus('all');
                setDepartureDateFrom('');
                setDepartureDateTo('');
                setSearch('');
                setPage(1);
              }}
              className="text-xs text-rose-600 font-bold hover:underline px-2 py-1 cursor-pointer"
            >
              {t('manager.requests.clearFilter', 'Xóa lọc')}
            </button>
          )}
        </div>
      </div>

      {/* ─── Error Message ───────────────────────────────────────────────────── */}
      {error && (
        <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchOrders()}
            className="text-xs font-bold underline hover:no-underline cursor-pointer"
          >
            {t('manager.requests.retry', 'Thử lại')}
          </button>
        </div>
      )}

      {/* ─── Requests Table ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-[#D8CEBE] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-[#FAF9F5] border-b border-[#D8CEBE]">
                <th
                  aria-sort={sortBy === 'id' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => handleSort('id')}
                  className="py-3 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-600 cursor-pointer select-none whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    {t('manager.requests.colId', 'MÃ ĐƠN')}
                    <SortIcon field="id" />
                  </div>
                </th>
                <th className="py-3 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap">
                  {t('manager.requests.colCustomer', 'KHÁCH HÀNG')}
                </th>
                <th
                  aria-sort={sortBy === 'requestedDate' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => handleSort('requestedDate')}
                  className="py-3 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-600 cursor-pointer select-none whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    {isEn ? 'ROUTE & DEPARTURE' : 'LỘ TRÌNH & KHỞI HÀNH'}
                    <SortIcon field="requestedDate" />
                  </div>
                </th>
                <th
                  aria-sort={sortBy === 'totalCost' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => handleSort('totalCost')}
                  className="py-3 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-600 cursor-pointer select-none whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    {t('manager.requests.colPrice', 'BÁO GIÁ')}
                    <SortIcon field="totalCost" />
                  </div>
                </th>
                <th
                  aria-sort={sortBy === 'status' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => handleSort('status')}
                  className="py-3 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-600 cursor-pointer select-none whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    {t('manager.requests.colStatus', 'TRẠNG THÁI')}
                    <SortIcon field="status" />
                  </div>
                </th>
                <th className="py-3 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-600 text-right whitespace-nowrap">
                  {t('manager.requests.colActions', 'THAO TÁC')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0EEE8]">
              {displayedOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-500 text-sm">
                    {loading ? (
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw size={24} className="animate-spin text-[#A67C2E]" />
                        <span>{t('manager.requests.loading', 'Đang tải danh sách yêu cầu...')}</span>
                      </div>
                    ) : (
                      t('manager.requests.noOrdersFound', 'Không tìm thấy yêu cầu vận chuyển nào.')
                    )}
                  </td>
                </tr>
              ) : (
                displayedOrders.map((order) => {
                  const statusConfig = getStatusBadgeConfig(order.status);
                  const orderCode = order.requestCode || `#${order.id}`;
                  const fullRouteText = `${order.originLocation} → ${order.destinationLocation}`;
                  return (
                    <tr key={order.id} className="hover:bg-[#FAF9F5] transition-colors">
                      <td className="py-3 px-3 whitespace-nowrap">
                        <Link href={`/manager/requests/${order.id}`} className="font-bold text-[#181A17] hover:text-[#A67C2E] no-underline hover:underline block text-[13px]">
                          {orderCode}
                        </Link>
                        <span className="text-[11px] text-slate-400 font-medium tabular-nums">
                          {formatDate(order.createdAt)}
                        </span>
                      </td>
                      <td className="py-3 px-3 max-w-[155px]">
                        <div className="font-bold text-slate-900 truncate text-[13px]" title={order.contactName || ''}>
                          {order.contactName || '—'}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate" title={order.customerEmail || order.contactEmail || ''}>
                          {order.customerEmail || order.contactEmail}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-700 font-medium min-w-[200px] max-w-[250px]">
                        <div className="line-clamp-2 text-[12.5px] leading-snug" title={fullRouteText}>
                          {fullRouteText}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 tabular-nums">
                          <span className="font-semibold text-[#7A591C]">
                            {order.bookingType === 'dedicated_charter'
                              ? isEn
                                ? 'Charter'
                                : 'Bao chuyến'
                              : isEn
                              ? 'Shared'
                              : 'Ghép ô'}
                          </span>
                          <span>•</span>
                          <span>{isEn ? 'Dep:' : 'Đi:'} {formatDate(order.requestedDate)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-extrabold text-slate-900 whitespace-nowrap tabular-nums text-[12.5px]">
                        {order.totalCost > 0 ? (
                          <span className="text-emerald-700">{formatCurrency(order.totalCost)}</span>
                        ) : (
                          <span className="text-slate-500 font-normal text-xs">{t('manager.requests.notQuoted', 'Chưa báo giá')}</span>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <StatusBadge label={translateStatus(order.status)} variant={statusConfig.variant} />
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex gap-1 justify-end items-center">
                          {/* Open Full Lifecycle Workspace */}
                          <Link
                            href={`/manager/requests/${order.id}`}
                            title={t('manager.requests.btnOpenWorkspace', 'Mở chi tiết & xử lý đơn')}
                            className="no-underline px-2.5 py-1.5 rounded-lg border border-[#D8CEBE] bg-white text-slate-700 hover:bg-[#FAF8F4] hover:border-[#A67C2E] font-bold text-xs inline-flex items-center gap-1 transition-colors whitespace-nowrap"
                          >
                            <Eye size={13} />
                            <span>
                              {order.status === 'paid_pending_review'
                                ? isEn
                                  ? 'Review'
                                  : 'Duyệt'
                                : isEn
                                ? 'Open'
                                : 'Xem'}
                            </span>
                          </Link>

                          {/* Print Quotation PDF */}
                          <button
                            type="button"
                            onClick={() =>
                              exportQuotationPDF(
                                order,
                                language === 'en',
                                translateStatus(order.status)
                              )
                            }
                            aria-label={t('manager.requests.btnPrintQuotation', 'In Báo Giá PDF')}
                            title={t('manager.requests.btnPrintQuotation', 'In Báo Giá PDF')}
                            className="p-1.5 rounded-lg border border-[#D8CEBE] bg-white text-slate-600 hover:text-[#181A17] hover:bg-[#FAF8F4] font-bold text-xs inline-flex items-center cursor-pointer transition-colors"
                          >
                            <Download size={13} />
                          </button>

                          {/* Approve (Only for 'requested') */}
                          {order.status === 'requested' && (
                            <button
                              type="button"
                              onClick={() => openApproveModal(order)}
                              title={t('manager.requests.btnApprove', 'Phê duyệt')}
                              className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center cursor-pointer transition-colors shadow-sm"
                            >
                              <CheckCircle size={13} />
                            </button>
                          )}

                          {/* Reject (Only for 'requested') */}
                          {order.status === 'requested' && (
                            <button
                              type="button"
                              onClick={() => {
                                setRejectOrder(order);
                                setRejectReason('');
                              }}
                              title={t('manager.requests.btnReject', 'Từ chối')}
                              className="p-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs inline-flex items-center cursor-pointer transition-colors shadow-sm"
                            >
                              <XCircle size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ─── Pagination ────────────────────────────────────────────────────── */}
        {pagination.totalPages > 1 && (
          <div className="p-4 border-t border-[#D8CEBE] bg-[#FAF9F5] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 font-medium">
            <div>
              {t(
                'manager.requests.paginationShowing',
                `Hiển thị ${(page - 1) * limit + 1} - ${Math.min(page * limit, pagination.total)} trong tổng số ${pagination.total} đơn`,
                {
                  from: (page - 1) * limit + 1,
                  to: Math.min(page * limit, pagination.total),
                  total: pagination.total,
                }
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg border border-[#D8CEBE] bg-white text-slate-700 hover:bg-slate-50 font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft size={14} /> {t('manager.requests.prevPage', 'Trước')}
              </button>
              <div className="px-3 py-1.5 rounded-lg bg-white border border-[#D8CEBE] font-bold text-slate-800">
                {page} / {pagination.totalPages}
              </div>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="px-3 py-1.5 rounded-lg border border-[#D8CEBE] bg-white text-slate-700 hover:bg-slate-50 font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
              >
                {t('manager.requests.nextPage', 'Sau')} <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── MODAL 1: Detail Modal ──────────────────────────────────────────────── */}
      <Modal
        isOpen={!!viewOrder}
        onClose={() => setViewOrder(null)}
        title={t('manager.requests.modalDetailTitle', `Chi Tiết Yêu Cầu Vận Chuyển #${viewOrder?.id}`, { id: viewOrder?.id || '' })}
        subtitle={t('manager.requests.modalDetailSubtitle', `Được tạo vào ngày ${formatDate(viewOrder?.createdAt || null)}`, { date: formatDate(viewOrder?.createdAt || null) })}
        maxWidth="max-w-2xl"
      >
        {viewOrder && (
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex items-center justify-between pb-3 border-b border-[#F0EEE8]">
              <div>
                <span className="text-xs text-slate-500 font-bold uppercase">{t('manager.requests.modalDetailStatus', 'Trạng Thái Đơn:')}</span>
                <div className="mt-1">
                  <StatusBadge
                    label={translateStatus(viewOrder.status)}
                    variant={getStatusBadgeConfig(viewOrder.status).variant}
                  />
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 font-bold uppercase">{t('manager.requests.modalDetailPrice', 'Chi Phí Báo Giá:')}</span>
                <div className="text-xl font-extrabold text-emerald-700 mt-0.5">
                  {formatCurrency(viewOrder.totalCost)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-[#FAF9F5] p-4 rounded-xl border border-[#D8CEBE]">
              <div>
                <div className="text-xs text-slate-500 font-bold uppercase">{t('manager.requests.modalDetailCustomer', 'Khách hàng')}</div>
                <div className="font-bold text-slate-900 mt-0.5">{viewOrder.contactName || '—'}</div>
                <div className="text-xs text-slate-600 mt-0.5">{viewOrder.contactPhone || '—'}</div>
                <div className="text-xs text-slate-600">{viewOrder.contactEmail || viewOrder.customerEmail}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 font-bold uppercase">{t('manager.requests.modalDetailSchedule', 'Thời gian vận chuyển')}</div>
                <div className="text-xs text-slate-700 mt-1">
                  <span className="font-semibold">{t('manager.requests.departureDate', 'Khởi hành:')}</span> {formatDate(viewOrder.requestedDate)}
                </div>
                <div className="text-xs text-slate-700 mt-0.5">
                  <span className="font-semibold">{t('manager.requests.arrivalDate', 'Dự kiến đến:')}</span> {formatDate(viewOrder.estimatedArrival)}
                </div>
              </div>
            </div>

            {/* Booking & Insurance summary if available */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <BookingSummary
                bookingType={viewOrder.bookingType}
                horseCount={viewOrder.requestedHorseCount || viewOrder.horses?.length || 1}
                stallUnitPrice={viewOrder.stallUnitPrice}
                status={viewOrder.status}
                departureDate={viewOrder.requestedDate}
              />
              <InsuranceSummary
                horses={(viewOrder.horses ?? []).map((h) => ({
                  horseId: h.horseId,
                  name: h.name ?? 'Ngựa',
                  quantity: h.quantity ?? 1,
                  declaredValue: h.declaredValue ?? 0,
                  declaredCurrency: h.declaredCurrency ?? 'VND',
                  exchangeRate: h.exchangeRate ?? 1,
                  declaredValueVnd: h.declaredValueVnd ?? 0,
                  insurancePackage: h.insurancePackage ?? 'basic',
                  insuranceFee: h.insuranceFee ?? 0,
                  maxCompensation: h.maxCompensation ?? 50000000,
                  emergencyVetCovered: Boolean(h.emergencyVetCovered),
                }))}
                transportCost={viewOrder.transportCost ?? null}
                insuranceFee={Number(viewOrder.insuranceFee ?? 0)}
                totalCost={viewOrder.totalCost}
              />
            </div>

            {/* Route Details */}
            <div className="p-3.5 bg-[#FAF8F4] rounded-xl border border-[#D8CEBE] text-xs">
              <div className="font-bold text-[#181A17] mb-1">{t('manager.requests.modalDetailRoute', 'Hành Trình Vận Chuyển')}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                <div>
                  <span className="text-slate-500 font-semibold">{t('manager.requests.originPoint', 'Điểm đi:')}</span> {viewOrder.originLocation}
                  {viewOrder.originAddress && <div className="text-slate-500 text-[11px]">{viewOrder.originAddress}</div>}
                </div>
                <div>
                  <span className="text-slate-500 font-semibold">{t('manager.requests.destinationPoint', 'Điểm đến:')}</span> {viewOrder.destinationLocation}
                  {viewOrder.destinationAddress && <div className="text-slate-500 text-[11px]">{viewOrder.destinationAddress}</div>}
                </div>
              </div>
            </div>

            {/* Horse Manifest */}
            <div>
              <div className="text-xs font-bold text-slate-700 uppercase mb-2">
                {t('manager.requests.modalDetailHorseManifest', `Danh Sách Ngựa (${viewOrder.horses?.length || 0} con):`, {
                  count: viewOrder.horses?.length || 0,
                })}
              </div>
              {viewOrder.horses && viewOrder.horses.length > 0 ? (
                <div className="border border-[#D8CEBE] rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[440px]">
                    <thead className="bg-[#FAF9F5] border-b border-[#D8CEBE]">
                      <tr>
                        <th className="p-2.5 font-bold text-slate-600">{t('manager.requests.horseName', 'Tên ngựa')}</th>
                        <th className="p-2.5 font-bold text-slate-600">{t('manager.requests.horseBreed', 'Giống')}</th>
                        <th className="p-2.5 font-bold text-slate-600">{t('horses.requiresPrivateStall', 'Cần chuồng riêng')}</th>
                        <th className="p-2.5 font-bold text-slate-600">{t('manager.requests.horseAge', 'Tuổi')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0EEE8]">
                      {viewOrder.horses.map((h, idx) => (
                        <tr key={idx}>
                          <td className="p-2.5 font-bold text-slate-900">{h.name || '—'}</td>
                          <td className="p-2.5 text-slate-600">{h.breed || '—'}</td>
                          <td className="p-2.5 text-slate-600">{h.requiresPrivateStall ? t('common.yes', isEn ? 'Yes' : 'Có') : t('common.no', isEn ? 'No' : 'Không')}</td>
                          <td className="p-2.5 text-slate-600">{h.age !== null && h.age !== undefined ? `${h.age}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  {t('manager.requests.noHorseManifest', 'Không có thông tin ngựa trong đơn.')}
                </p>
              )}
            </div>

            {/* Special Requirements */}
            {(() => {
              const cleaned = (viewOrder.specialRequirements || '')
                .split('|')
                .map((s) => s.trim())
                .filter((s) => s && !/^\[(Tiêu đề|Hình thức|Lộ trình):/i.test(s))
                .join(' | ');
              if (!cleaned) return null;
              return (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                  <span className="font-bold">{t('manager.requests.specialReq', 'Yêu cầu đặc biệt:')}</span> {cleaned}
                </div>
              );
            })()}

            {/* Rejection / Note */}
            {viewOrder.rejectionReason && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900">
                <span className="font-bold">{t('manager.requests.rejectionReason', 'Lý do từ chối:')}</span> {viewOrder.rejectionReason}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-[#F0EEE8]">
              <button
                type="button"
                onClick={() =>
                  exportQuotationPDF(
                    viewOrder,
                    language === 'en',
                    translateStatus(viewOrder.status)
                  )
                }
                className="px-4 py-2 rounded-xl border border-[#D8CEBE] text-slate-700 font-bold text-xs hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
              >
                <Download size={14} /> {t('manager.requests.btnPrintQuotation', 'In Báo Giá PDF')}
              </button>
              <button
                type="button"
                onClick={() => setViewOrder(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 cursor-pointer"
              >
                {t('manager.common.close', 'Đóng')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── MODAL 2: Approve & Set Price ───────────────────────────────────────── */}
      <Modal
        isOpen={!!approveOrder}
        onClose={() => { if (!actionLoading) setApproveOrder(null); }}
        closeDisabled={actionLoading}
        title={t('manager.requests.modalApproveTitle', `Phê Duyệt Đơn #${approveOrder?.id}`, { id: approveOrder?.id || '' })}
        subtitle={`${approveOrder?.originLocation} → ${approveOrder?.destinationLocation}`}
        maxWidth="max-w-xl"
      >
        {approveOrder && (() => {
          const routeInfo = buildEquineRoute(
            approveOrder.originLocation || '',
            approveOrder.destinationLocation || '',
            selectedTransportMode
          );

          return (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleApprove();
              }}
              className="flex flex-col gap-4 text-sm"
            >
              {Boolean(approveOrder.quoteId) ? (
                <div className="space-y-3">
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs">
                    <strong>{isEn ? `Quotation Locked (Quote #${approveOrder.quoteId})` : `Báo giá đã khóa theo Quote #${approveOrder.quoteId}`}</strong>
                    <p className="mt-1 mb-0">
                      {isEn
                        ? 'This order has locked pricing from the official quotation snapshot. Manual override is disabled.'
                        : 'Đơn này có báo giá đã khóa từ máy chủ. Giá cước và phương án đã được cố định theo bảng giá.'}
                    </p>
                  </div>
                  <SnapshotBreakdown
                    quoteId={approveOrder.quoteId as any}
                    pricingSnapshot={approveOrder.pricingSnapshot}
                    transportCost={approveOrder.transportCost}
                    insuranceFee={approveOrder.insuranceFee}
                    totalCost={approveOrder.totalCost}
                  />
                </div>
              ) : (
                <>
                  {/* Route & Mode Selection Card */}
                  <div className="p-3.5 bg-[#FAF8F4] border border-[#D8CEBE] rounded-xl flex flex-col gap-2.5">
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <span className="text-xs font-bold text-[#242722]">
                        {t('manager.requests.transportMethod', 'Phương thức vận chuyển:')}
                      </span>
                      <div className="flex gap-1 bg-white p-1 rounded-lg border border-[#D8CEBE]">
                        <button
                          type="button"
                          onClick={() => handleModeToggle('road')}
                          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                            selectedTransportMode === 'road' ? 'bg-[#181A17] text-[#FAF8F4] shadow-sm' : 'text-slate-600 hover:text-[#181A17]'
                          }`}
                        >
                          <Truck size={12} /> {t('manager.requests.modeRoad', 'Đường bộ')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleModeToggle('air')}
                          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                            selectedTransportMode === 'air' ? 'bg-[#181A17] text-[#FAF8F4] shadow-sm' : 'text-slate-600 hover:text-[#181A17]'
                          }`}
                        >
                          <Plane size={12} /> {t('manager.requests.modeAir', 'Hàng không')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleModeToggle('sea')}
                          className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                            selectedTransportMode === 'sea' ? 'bg-[#0E7490] text-white shadow-sm' : 'text-slate-600 hover:text-[#181A17]'
                          }`}
                        >
                          <Ship size={12} /> {t('manager.requests.modeSea', isEn ? 'Sea Freight' : 'Đường thủy')}
                        </button>
                      </div>
                    </div>

                    <div className="text-xs font-bold text-[#181A17]">
                      {approveOrder.originLocation} → {approveOrder.destinationLocation}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500 block text-[11px]">{t('manager.requests.distance', 'Khoảng cách:')}</span>
                        <strong className="text-[#7A591C]">{routeInfo.distanceKm.toLocaleString('vi-VN')} km</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">{t('manager.requests.estDuration', 'Thời gian ước tính:')}</span>
                        <strong className="text-[#181A17]">~{routeInfo.durationHours} {isEn ? 'hrs' : 'giờ'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">{t('manager.requests.borderGates', 'Cửa khẩu:')}</span>
                        <strong className="text-[#181A17]">{routeInfo.customsCount} {isEn ? 'posts' : 'trạm'}</strong>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="flex flex-wrap justify-end gap-2.5 pt-3 border-t border-[#F0EEE8] mt-2">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => setApproveOrder(null)}
                  className="px-4 py-2.5 rounded-xl border border-[#D8CEBE] text-slate-700 font-bold text-xs hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  {t('manager.common.cancel', 'Hủy')}
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading ? t('manager.requests.btnApproving', 'Đang duyệt...') : `✓ ${t('manager.requests.btnConfirmApprove', 'Xác Nhận Phê Duyệt')}`}
                </button>
              </div>
            </form>
          );
        })()}
      </Modal>

      {/* ─── MODAL 3: Request Changes ───────────────────────────────────────────── */}
      <Modal
        isOpen={!!requestChangeOrder}
        onClose={() => { if (!actionLoading) setRequestChangeOrder(null); }}
        closeDisabled={actionLoading}
        title={t('manager.requests.modalChangeTitle', `Yêu Cầu Chỉnh Sửa Đơn #${requestChangeOrder?.id}`, { id: requestChangeOrder?.id || '' })}
        subtitle={t('manager.requests.modalChangeSubtitle', 'Gửi ghi chú yêu cầu khách hàng cập nhật lại thông tin lộ trình hoặc hồ sơ')}
        maxWidth="max-w-md"
      >
        {requestChangeOrder && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleRequestChanges();
            }}
            className="flex flex-col gap-4 text-sm"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="requests-change-reason" className="text-xs font-bold text-slate-700">
                  {t('manager.requests.fieldChangeReason', 'Nội Dung Yêu Cầu Chỉnh Sửa (Tối thiểu 5 ký tự) *')}
                </label>
                <span className="text-[11px] text-slate-500">{requestChangeReason.trim().length} / 5+</span>
              </div>
              <textarea
                id="requests-change-reason"
                rows={4}
                required
                value={requestChangeReason}
                onChange={(e) => setRequestChangeReason(e.target.value)}
                placeholder={t('manager.requests.fieldChangePlaceholder', 'VD: Vui lòng bổ sung giấy kiểm dịch và chọn lại ngày đón ngựa...')}
                className="w-full p-3 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-slate-900 text-sm outline-none focus:ring-2 focus:ring-[#C4B38E]/20 focus:border-[#181A17]"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2.5 pt-3 border-t border-[#F0EEE8]">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setRequestChangeOrder(null)}
                className="px-4 py-2.5 rounded-xl border border-[#D8CEBE] text-slate-700 font-bold text-xs hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                {t('manager.common.cancel', 'Hủy')}
              </button>
              <button
                type="submit"
                disabled={actionLoading || requestChangeReason.trim().length < 5}
                className="px-5 py-2.5 rounded-xl bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
              >
                {actionLoading ? t('manager.requests.btnSending', 'Đang gửi...') : t('manager.requests.btnSendChange', 'Gửi Yêu Cầu Cho Khách')}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ─── MODAL 4: Reject Order ──────────────────────────────────────────────── */}
      <Modal
        isOpen={!!rejectOrder}
        onClose={() => { if (!actionLoading) setRejectOrder(null); }}
        closeDisabled={actionLoading}
        title={t('manager.requests.modalRejectTitle', `Từ Chối Đơn Vận Chuyển #${rejectOrder?.id}`, { id: rejectOrder?.id || '' })}
        subtitle={t('manager.requests.modalRejectSubtitle', 'Vui lòng nêu rõ lý do từ chối để thông báo đến khách hàng')}
        maxWidth="max-w-md"
      >
        {rejectOrder && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleReject();
            }}
            className="flex flex-col gap-4 text-sm"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="requests-reject-reason" className="text-xs font-bold text-slate-700">
                  {t('manager.requests.fieldRejectReason', 'Lý Do Từ Chối (Tối thiểu 5 ký tự) *')}
                </label>
                <span className="text-[11px] text-slate-500">{rejectReason.trim().length} / 5+</span>
              </div>
              <textarea
                id="requests-reject-reason"
                rows={4}
                required
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={t('manager.requests.fieldRejectPlaceholder', 'VD: Tuyến vận chuyển qua cửa khẩu hiện đang đóng băng do dịch bệnh...')}
                className="w-full p-3 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-slate-900 text-sm outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2.5 pt-3 border-t border-[#F0EEE8]">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setRejectOrder(null)}
                className="px-4 py-2.5 rounded-xl border border-[#D8CEBE] text-slate-700 font-bold text-xs hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                {t('manager.common.cancel', 'Hủy')}
              </button>
              <button
                type="submit"
                disabled={actionLoading || rejectReason.trim().length < 5}
                className="px-5 py-2.5 rounded-xl bg-red-600 text-white font-bold text-xs hover:bg-red-700 disabled:opacity-50 cursor-pointer"
              >
                {actionLoading ? t('manager.requests.btnRejecting', 'Đang từ chối...') : `✗ ${t('manager.requests.btnConfirmReject', 'Xác Nhận Từ Chối')}`}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
