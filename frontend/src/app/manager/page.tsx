'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Plane,
  FileCheck2,
  AlertTriangle,
  Calendar,
  Target,
  ArrowRight,
  TrendingUp,
  Filter,
  ChevronRight,
  DollarSign,
  PieChart,
  Map,
  Users,
  BarChart3,
  ClipboardCheck,
  CheckCircle2,
  X,
  RefreshCw,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getCurrentUser } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { useFleetRouteStore } from '@/lib/fleet-route-store';
import { Modal } from '@/components/ui/Modal';
import { FlightyRouteDisplay } from '@/components/ui/FlightyRouteDisplay';
import { NumberTicker } from '@/components/ui/NumberTicker';
import {
  BookingQuoteSummary,
  ManagerFreightSuggestionCard,
} from '@/features/orders/components/BookingSummary';
import {
  bookingName,
  bookingQuotePayload,
  suggestManagerFreightQuote,
  type BookingType,
} from '@/features/orders/booking-policy';
import { buildEquineRoute } from '@/lib/geo-corridors';
import { formatShipmentStatusLabel } from '@/features/orders/shipment-status';
import useSWR from 'swr';
import toast from 'react-hot-toast';

interface OrderSummary {
  id: number;
  requestCode?: string | null;
  originLocation: string;
  destinationLocation: string;
  contactName?: string;
  contactEmail?: string;
  requestedDate?: string | null;
  status: string;
  totalCost?: number | null;
  transportCost?: number | null;
  insuranceFee?: number | null;
  stallUnitPrice?: number | null;
  requestedHorseCount?: number | null;
  bookingType?: BookingType;
  transportMode?: 'road' | 'air' | 'sea' | null;
  specialRequirements?: string | null;
  horses?: Array<{ id?: number; name?: string }>;
}

interface NotificationRecord {
  id: number | string;
  title?: string;
  message?: string;
  type?: string;
  isRead?: boolean;
  createdAt?: string;
  shipmentId?: number | null;
}

const ordersFetcher = async (url: string): Promise<OrderSummary[]> => {
  const res = await apiClient<OrderSummary[] | { data?: OrderSummary[] }>(url);
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.data)) return res.data;
  return [];
};

const notificationsFetcher = async (url: string): Promise<NotificationRecord[]> => {
  const res = await apiClient<NotificationRecord[] | { data?: NotificationRecord[] }>(url);
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.data)) return res.data;
  return [];
};

const REVENUE_ELIGIBLE_STATUSES = new Set([
  'approved',
  'planning',
  'confirmed',
  'ready_to_depart',
  'in_transit',
  'completed',
]);

const ACTIVE_SHIPMENT_STATUSES = new Set([
  'planning',
  'confirmed',
  'ready_to_depart',
  'in_transit',
]);

export default function ManagerDashboardPage() {
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const fleetStore = useFleetRouteStore();

  const [managerName, setManagerName] = useState<string>('');
  useEffect(() => {
    setManagerName(getCurrentUser()?.name || '');
  }, []);

  // Fetch data using SWR
  const {
    data: allOrders = [],
    error: loadingError,
    isLoading: loadingRequests,
    mutate: mutateAllOrders,
  } = useSWR('/orders', ordersFetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  });

  const pendingRequests = useMemo(
    () =>
      allOrders.filter(
        (o) =>
          o.status === 'requested' ||
          o.status === 'paid_pending_review' ||
          o.status === 'paid_pending_feasibility',
      ),
    [allOrders],
  );
  const mutatePendingRequests = mutateAllOrders;

  const {
    data: notifications = [],
    mutate: mutateNotifications,
  } = useSWR('/notifications', notificationsFetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
  });

  // Filter State
  const [requestCostFilter, setRequestCostFilter] = useState<'ALL' | 'NEEDS_COST' | 'HAS_COST'>('ALL');
  const [showRequestFilterDropdown, setShowRequestFilterDropdown] = useState(false);
  const [requestPage, setRequestPage] = useState(1);
  const requestPageSize = 5;

  useEffect(() => {
    if (!showRequestFilterDropdown) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowRequestFilterDropdown(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showRequestFilterDropdown]);

  const filteredPendingRequests = useMemo(() => {
    return pendingRequests.filter((req) => {
      if (requestCostFilter === 'NEEDS_COST') return req.totalCost == null || req.totalCost <= 0;
      if (requestCostFilter === 'HAS_COST') return req.totalCost != null && req.totalCost > 0;
      return true;
    });
  }, [pendingRequests, requestCostFilter]);

  const totalRequestPages = Math.max(1, Math.ceil(filteredPendingRequests.length / requestPageSize));
  const safeRequestPage = Math.min(requestPage, totalRequestPages);
  const paginatedPendingRequests = filteredPendingRequests.slice(
    (safeRequestPage - 1) * requestPageSize,
    safeRequestPage * requestPageSize
  );

  // Derived real metrics
  const inTransitCount = useMemo(
    () => allOrders.filter((o) => o.status === 'in_transit').length,
    [allOrders]
  );
  const upcomingCount = useMemo(
    () => allOrders.filter((o) => o.status === 'approved' || o.status === 'confirmed' || o.status === 'ready_to_depart').length,
    [allOrders]
  );
  const activeCount = useMemo(
    () => allOrders.filter((o) => ACTIVE_SHIPMENT_STATUSES.has(o.status)).length,
    [allOrders]
  );
  const completedCount = useMemo(
    () => allOrders.filter((o) => o.status === 'completed').length,
    [allOrders]
  );
  const changeRequestedOrders = useMemo(
    () => allOrders.filter((o) => o.status === 'change_requested'),
    [allOrders]
  );

  const liveIncidentItems = useMemo(() => {
    const storeAlerts = (fleetStore?.alerts || [])
      .filter((a) => !a.isAcknowledged)
      .map((a) => ({
        key: `store-${a.id}`,
        title: a.message || a.type || (isEn ? 'Route / Dispatch Alert' : 'Cảnh báo tuyến vận tải'),
        location: a.location || a.tripCode || '—',
        severity: a.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
        createdAt: a.timeAgo,
      }));

    const notifAlerts = notifications
      .filter(
        (n) =>
          !n.isRead &&
          /sos|incident|sự cố|khẩn|emergency|delay|trễ|alert|cảnh báo|warning/i.test(
            `${n.title || ''} ${n.message || ''} ${n.type || ''}`
          )
      )
      .map((n) => ({
        key: `notif-${n.id}`,
        title: n.title || n.message || (isEn ? 'Operational Alert' : 'Cảnh báo vận hành'),
        location: n.shipmentId ? `#${n.shipmentId}` : '—',
        severity: /sos|critical|khẩn|emergency/i.test(`${n.title || ''} ${n.message || ''}`)
          ? 'CRITICAL'
          : 'WARNING',
        createdAt: n.createdAt,
      }));

    return [...storeAlerts, ...notifAlerts];
  }, [fleetStore?.alerts, notifications, isEn]);

  const totalApprovedRevenueVnd = useMemo(
    () =>
      allOrders
        .filter((o) => REVENUE_ELIGIBLE_STATUSES.has(o.status))
        .reduce((sum, o) => sum + Number(o.totalCost || 0), 0),
    [allOrders]
  );

  const completionRatePct = useMemo(() => {
    const EXCLUDED_COMPLETION = new Set(['cancelled', 'cancelled_operational', 'rejected', 'refunded', 'refund_requested', 'awaiting_payment']);
    const eligible = allOrders.filter((o) => !EXCLUDED_COMPLETION.has(String(o.status || '').toLowerCase()));
    if (eligible.length === 0) return 0;
    return Math.round((completedCount / eligible.length) * 1000) / 10;
  }, [allOrders, completedCount]);

  // Modal States
  const [activeModal, setActiveModal] = useState<'NONE' | 'APPROVE' | 'REJECT' | 'CHANGE'>('NONE');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [approveQuotedPrice, setApproveQuotedPrice] = useState('');
  const [approveTransportMode, setApproveTransportMode] = useState<'road' | 'air' | 'sea'>('road');
  const [approveNote, setApproveNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  const selectedOrder = useMemo(
    () => pendingRequests.find((req) => req.id === selectedOrderId) || null,
    [pendingRequests, selectedOrderId]
  );

  const inferOrderTransportMode = (ord?: OrderSummary | null): 'road' | 'air' | 'sea' => {
    if (!ord) return 'road';
    if (ord.transportMode === 'road' || ord.transportMode === 'air' || ord.transportMode === 'sea') {
      return ord.transportMode;
    }
    const notes = String(ord.specialRequirements || '').toLowerCase();
    if (notes.includes('đường thủy') || notes.includes('tàu biển') || notes.includes('sea')) return 'sea';
    if (notes.includes('hàng không') || notes.includes('air') || notes.includes('bay')) return 'air';
    const o = String(ord.originLocation || '').toLowerCase();
    const d = String(ord.destinationLocation || '').toLowerCase();
    const isDom =
      (o.includes('vietnam') || o.includes('việt nam') || o.includes('hồ chí minh') || o.includes('hà nội') || o.includes('đà nẵng')) &&
      (d.includes('vietnam') || d.includes('việt nam') || d.includes('hồ chí minh') || d.includes('hà nội') || d.includes('đà nẵng'));
    return isDom ? 'road' : 'air';
  };

  const openModal = (type: 'APPROVE' | 'REJECT' | 'CHANGE', id: number) => {
    setActiveModal(type);
    setSelectedOrderId(id);
    setInputValue('');
    const target = pendingRequests.find((req) => req.id === id);
    if (type === 'APPROVE' && target) {
      const mode = inferOrderTransportMode(target);
      setApproveTransportMode(mode);
      const routeInfo = buildEquineRoute(target.originLocation || '', target.destinationLocation || '', mode);
      const horseCount = target.requestedHorseCount || target.horses?.length || 1;
      const suggestion = suggestManagerFreightQuote({
        transportMode: mode,
        bookingType: target.bookingType ?? 'dedicated_charter',
        horseCount,
        distanceKm: routeInfo.distanceKm,
        customsCount: routeInfo.customsCount,
      });
      const existingQuote =
        target.bookingType === 'dedicated_charter'
          ? Number(target.transportCost || 0)
          : Number(target.stallUnitPrice || 0);
      setApproveQuotedPrice(String(existingQuote > 0 ? existingQuote : suggestion.suggestedInputVnd));
    } else {
      setApproveQuotedPrice('');
    }
    setApproveNote('');
    setModalError('');
  };

  const handleDashboardModeToggle = (mode: 'road' | 'air' | 'sea') => {
    setApproveTransportMode(mode);
    if (!selectedOrder) return;
    const routeInfo = buildEquineRoute(
      selectedOrder.originLocation || '',
      selectedOrder.destinationLocation || '',
      mode
    );
    const horseCount = selectedOrder.requestedHorseCount || selectedOrder.horses?.length || 1;
    const suggestion = suggestManagerFreightQuote({
      transportMode: mode,
      bookingType: selectedOrder.bookingType ?? 'dedicated_charter',
      horseCount,
      distanceKm: routeInfo.distanceKm,
      customsCount: routeInfo.customsCount,
    });
    setApproveQuotedPrice(String(suggestion.suggestedInputVnd));
  };

  const closeModal = () => {
    if (isSubmitting) return;
    setActiveModal('NONE');
    setSelectedOrderId(null);
    setInputValue('');
    setApproveQuotedPrice('');
    setApproveNote('');
    setModalError('');
  };

  const handleConfirmAction = async () => {
    if (!selectedOrderId || isSubmitting) return;
    setIsSubmitting(true);
    setModalError('');

    try {
      if (activeModal === 'APPROVE') {
        const bookingType: BookingType = selectedOrder?.bookingType ?? 'dedicated_charter';
        const horseCount =
          selectedOrder?.requestedHorseCount || selectedOrder?.horses?.length || 1;
        const quotePayload = bookingQuotePayload(
          approveQuotedPrice,
          bookingType,
          horseCount,
          'VND'
        );

        await apiClient(`/orders/${selectedOrderId}/approve`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...quotePayload,
            transportMode: approveTransportMode,
            ...(approveNote.trim() ? { note: approveNote.trim() } : {}),
          }),
        });
      } else if (activeModal === 'REJECT') {
        const trimmed = inputValue.trim();
        if (trimmed.length < 5) {
          setModalError(
            t('manager.dashboard.errRejectMin', 'Lý do từ chối phải có ít nhất 5 ký tự.')
          );
          setIsSubmitting(false);
          return;
        }
        await apiClient(`/orders/${selectedOrderId}/reject`, {
          method: 'PATCH',
          body: JSON.stringify({ reason: trimmed }),
        });
      } else if (activeModal === 'CHANGE') {
        const trimmed = inputValue.trim();
        if (trimmed.length < 5) {
          setModalError(
            t('manager.dashboard.errChangeMin', 'Nội dung yêu cầu chỉnh sửa phải có ít nhất 5 ký tự.')
          );
          setIsSubmitting(false);
          return;
        }
        await apiClient(`/orders/${selectedOrderId}/request-changes`, {
          method: 'PATCH',
          body: JSON.stringify({ reason: trimmed }),
        });
      }

      await Promise.all([mutatePendingRequests(), mutateAllOrders(), mutateNotifications()]);
      const processedId = selectedOrderId;
      const processedAction = activeModal;
      setActiveModal('NONE');
      setSelectedOrderId(null);
      setInputValue('');
      setApproveQuotedPrice('');
      setApproveNote('');
      setModalError('');

      if (processedAction === 'APPROVE') {
        toast.success(
          isEn
            ? `Order #${processedId} approved & quoted successfully!`
            : `Đơn #${processedId} đã được phê duyệt và báo giá thành công!`
        );
      } else if (processedAction === 'REJECT') {
        toast.success(
          isEn ? `Order #${processedId} rejected.` : `Đơn #${processedId} đã bị từ chối.`
        );
      } else if (processedAction === 'CHANGE') {
        toast.success(
          isEn
            ? `Revision request sent for order #${processedId}.`
            : `Đã gửi yêu cầu chỉnh sửa cho đơn #${processedId}.`
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setModalError(
        msg || t('manager.dashboard.errGeneric', 'Không thể xử lý yêu cầu. Vui lòng thử lại.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatVndCompact = (amount: number) => `${amount.toLocaleString('vi-VN')} ₫`;

  const greetingName = managerName || t('manager.roleLabel', 'Logistics Manager');

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-10">
      {/* 1. COMPACT LIGHT HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E5DDD0]">
        <h1 className="text-2xl font-extrabold tracking-tight text-[#181A17] m-0 leading-snug">
          {t('manager.dashboard.greetingPrefix', 'Xin chào,')}{' '}
          <span className="text-[#966516] whitespace-nowrap">{greetingName.replace(/\s*\([^)]*\)\s*$/, '').trim() || greetingName}</span>
        </h1>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              const tableElem = document.getElementById('pending-requests-table');
              if (tableElem) {
                tableElem.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            className="px-4 py-2 rounded-xl bg-[#181A17] hover:bg-[#2A2D28] text-white text-xs font-bold shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
          >
            <span>{t('manager.dashboard.btnReviewPending', 'Xem Yêu Cầu Chờ Duyệt')}</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#D4C5A3]" />
          </button>
        </div>
      </div>

      {/* 2. CLICKABLE 4-KPI ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Pending Approvals */}
        <button
          type="button"
          onClick={() => {
            const tableElem = document.getElementById('pending-requests-table');
            if (tableElem) tableElem.scrollIntoView({ behavior: 'smooth' });
          }}
          className={`text-left rounded-2xl p-5 border shadow-sm flex flex-col justify-between group transition-all hover:shadow-md cursor-pointer ${
            pendingRequests.length > 0
              ? 'bg-[#FAF8F4] border-[#C4B38E]'
              : 'bg-white border-[#E5DDD0] hover:border-[#C4B38E]'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-[#966516]">
              {t('manager.dashboard.kpiPending', 'Chờ Phê Duyệt')}
            </span>
            <div className="w-9 h-9 rounded-xl bg-[#F3ECE0] flex items-center justify-center text-[#966516] group-hover:bg-[#A67C2E] group-hover:text-white transition-colors">
              <FileCheck2 className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black tabular-num-luxury text-[#181A17] tracking-tight">
              <NumberTicker value={pendingRequests.length} padZero />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-[#966516] font-bold">
              <span>{t('manager.dashboard.kpiPendingSub', 'Đơn cần phê duyệt báo giá')}</span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            </div>
          </div>
        </button>

        {/* KPI 2: Active & Upcoming Trips */}
        <Link
          href="/manager/planning"
          className="no-underline bg-white rounded-2xl p-5 border border-[#E5DDD0] hover:border-[#C4B38E] shadow-sm flex flex-col justify-between group transition-all hover:shadow-md"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-[#7A591C]">
              {t('manager.dashboard.kpiTransit', 'Đang Vận Chuyển')}
            </span>
            <div className="w-9 h-9 rounded-xl bg-[#FAF8F4] flex items-center justify-center text-[#A67C2E] group-hover:bg-[#A67C2E] group-hover:text-white transition-colors border border-[#EAE5DA]">
              <Plane className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black tabular-num-luxury text-[#181A17] tracking-tight">
              <NumberTicker value={inTransitCount} padZero />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-[#5F6977] font-semibold">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#A67C2E] animate-pulse" />
                {upcomingCount > 0
                  ? `${upcomingCount} ${t('manager.dashboard.kpiUpcomingInline', 'sắp khởi hành')}`
                  : t('manager.dashboard.kpiTransitSub', 'Đang trên hành trình')}
              </span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-[#966516]" />
            </div>
          </div>
        </Link>

        {/* KPI 3: Incidents */}
        <Link
          href="/manager/incidents"
          className={`no-underline rounded-2xl p-5 border shadow-sm flex flex-col justify-between group transition-all hover:shadow-md ${
            liveIncidentItems.length > 0
              ? 'bg-[#FDF6F6] border-[#E5B8B8]'
              : 'bg-white border-[#E5DDD0] hover:border-[#B7DBC4]'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span
              className={`text-[11px] font-bold tracking-wider uppercase ${
                liveIncidentItems.length > 0 ? 'text-[#B33E3E]' : 'text-[#287653]'
              }`}
            >
              {t('manager.dashboard.kpiIncidents', 'Sự Cố & Cảnh Báo')}
            </span>
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                liveIncidentItems.length > 0
                  ? 'bg-[#F8EAEA] text-[#B33E3E] group-hover:bg-[#B33E3E] group-hover:text-white'
                  : 'bg-[#E8F2EB] text-[#287653] group-hover:bg-[#287653] group-hover:text-white'
              }`}
            >
              {liveIncidentItems.length > 0 ? (
                <AlertTriangle className="w-4 h-4" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
            </div>
          </div>
          <div>
            <div className="text-3xl font-black tabular-num-luxury text-[#181A17] tracking-tight">
              <NumberTicker value={liveIncidentItems.length} padZero />
            </div>
            <div
              className={`mt-2 flex items-center justify-between text-xs font-bold ${
                liveIncidentItems.length > 0 ? 'text-[#B33E3E]' : 'text-[#287653]'
              }`}
            >
              <span>
                {liveIncidentItems.length > 0
                  ? t('manager.dashboard.kpiIncidentsNeedAction', 'Cảnh báo chưa xác nhận')
                  : t('manager.dashboard.chipSafe', 'Vận Hành An Toàn')}
              </span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            </div>
          </div>
        </Link>

        {/* KPI 4: Completion Rate */}
        <Link
          href="/manager/requests"
          className="no-underline bg-white rounded-2xl p-5 border border-[#E5DDD0] hover:border-[#B7DBC4] shadow-sm flex flex-col justify-between group transition-all hover:shadow-md"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold tracking-wider uppercase text-[#287653]">
              {t('manager.dashboard.kpiCompletion', 'Tỷ Lệ Hoàn Tất')}
            </span>
            <div className="w-9 h-9 rounded-xl bg-[#E8F2EB] flex items-center justify-center text-[#287653] group-hover:bg-[#287653] group-hover:text-white transition-colors">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-3xl font-black tabular-num-luxury text-[#181A17] tracking-tight">
              <NumberTicker value={completionRatePct} decimals={1} suffix="%" />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-[#287653] font-bold">
              <span className="inline-flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                {completedCount}/{allOrders.length}{' '}
                {t('manager.dashboard.kpiCompletionSub', 'đơn hoàn tất')}
              </span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            </div>
          </div>
        </Link>
      </div>

      {/* 3. MAIN GRID (2 Cols Left, 1 Col Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* LEFT COLUMN: Collapsible Incidents Alert + Transport Requests Table */}
        <div className="flex flex-col gap-5 lg:col-span-2 min-w-0">
          {/* ACTIVE INCIDENTS TABLE (hidden when 0; KPI 3 already reflects 0 incidents) */}
          {liveIncidentItems.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E5B8B8] shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E5B8B8] flex flex-wrap justify-between items-center gap-3 bg-[#FDF6F6]">
                <div>
                  <h2 className="text-base font-bold text-[#181A17] flex items-center gap-2 m-0">
                    <AlertTriangle size={18} className="text-[#B33E3E]" />
                    {t('manager.dashboard.incidentsTitle', 'Sự Cố Cần Chú Ý')}
                  </h2>
                  <p className="text-xs font-medium text-[#B33E3E] mt-0.5 mb-0">
                    {liveIncidentItems.length}{' '}
                    {t('manager.dashboard.incidentsSubCount', 'cảnh báo vận hành cần kiểm tra')}
                  </p>
                </div>

                <Link
                  href="/manager/incidents"
                  className="text-[13px] font-semibold text-[#B33E3E] hover:text-[#181A17] flex items-center gap-1 bg-white border border-[#E5B8B8] px-3 py-1.5 rounded-lg no-underline transition-colors"
                >
                  {t('manager.dashboard.viewAll', 'Xem tất cả')} <ChevronRight size={13} />
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-[13px] min-w-[540px]">
                  <thead>
                    <tr className="bg-[#FAF8F4] border-b border-[#E5DDD0] text-[11px] font-bold text-[#5F6977] uppercase tracking-wider">
                      <th className="py-3 px-6">{t('manager.dashboard.colIncident', 'Sự Cố')}</th>
                      <th className="py-3 px-4">{t('manager.dashboard.colTripLoc', 'Chuyến / Vị Trí')}</th>
                      <th className="py-3 px-4">{t('manager.dashboard.colSeverity', 'Mức Độ')}</th>
                      <th className="py-3 px-4 text-right">{t('manager.dashboard.colAction', 'Thao Tác')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveIncidentItems.slice(0, 3).map((item) => (
                      <tr key={item.key} className="border-b border-[#F0EEE8] hover:bg-[#FAF9F5]">
                        <td className="py-3.5 px-6 font-semibold text-[#181A17]">{item.title}</td>
                        <td className="py-3.5 px-4 text-[#5C6658]">{item.location}</td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              item.severity === 'CRITICAL'
                                ? 'bg-[#F8EAEA] text-[#B33E3E]'
                                : 'bg-[#F8F0DF] text-[#966516]'
                            }`}
                          >
                            {item.severity}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Link
                            href="/manager/incidents"
                            className="text-xs font-bold text-[#A67C2E] hover:underline no-underline"
                          >
                            {t('manager.dashboard.handle', 'Xử lý')}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TRANSPORT REQUESTS TABLE */}
          <div
            id="pending-requests-table"
            className="bg-white rounded-2xl border border-[#D8CEBE] shadow-sm relative"
          >
            <div className="px-6 py-4 border-b border-[#EAE5DA] flex flex-wrap justify-between items-center gap-3 rounded-t-2xl bg-white">
              <div>
                <h2 className="text-base font-bold text-[#181A17] m-0">
                  {t('manager.dashboard.requestsTitle', 'Yêu Cầu Vận Chuyển Chờ Duyệt')}
                </h2>
                <p className="text-xs font-medium text-[#5C6658] mt-0.5 mb-0">
                  {t(
                    'manager.dashboard.requestsSub',
                    'Các đơn hàng đang chờ quản lý thẩm định và báo giá'
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <button
                    type="button"
                    aria-expanded={showRequestFilterDropdown}
                    aria-haspopup="menu"
                    onClick={() => setShowRequestFilterDropdown((prev) => !prev)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold border cursor-pointer transition-colors ${
                      requestCostFilter !== 'ALL'
                        ? 'border-[#A67C2E] text-[#7A591C] bg-[#FAF8F4]'
                        : 'border-[#D8CEBE] text-[#242722] bg-white hover:bg-[#FAF9F5]'
                    }`}
                  >
                    <Filter size={13} className={requestCostFilter !== 'ALL' ? 'text-[#A67C2E]' : 'text-[#7E867B]'} />
                    {requestCostFilter === 'ALL'
                      ? t('manager.dashboard.filter', 'Lọc')
                      : requestCostFilter === 'NEEDS_COST'
                      ? t('manager.dashboard.filterNeedsCost', 'Chưa báo giá')
                      : t('manager.dashboard.filterCosted', 'Đã có giá')}
                  </button>
                  {showRequestFilterDropdown && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setShowRequestFilterDropdown(false)}
                      />
                      <div
                        role="menu"
                        className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-[#D8CEBE] rounded-xl shadow-lg p-1.5 z-40"
                      >
                        {[
                          { label: t('manager.dashboard.filterAll', 'Tất cả yêu cầu'), val: 'ALL' as const },
                          { label: t('manager.dashboard.filterNeedsCost', 'Chưa báo giá'), val: 'NEEDS_COST' as const },
                          { label: t('manager.dashboard.filterCosted', 'Đã có giá'), val: 'HAS_COST' as const },
                        ].map((item) => (
                          <button
                            key={item.val}
                            role="menuitem"
                            type="button"
                            onClick={() => {
                              setRequestCostFilter(item.val);
                              setRequestPage(1);
                              setShowRequestFilterDropdown(false);
                            }}
                            className={`w-full text-left px-2.5 py-2 text-xs rounded-lg border-0 cursor-pointer transition-colors ${
                              requestCostFilter === item.val
                                ? 'font-bold text-[#7A591C] bg-[#FAF8F4]'
                                : 'font-medium text-[#242722] bg-transparent hover:bg-[#F0EEE8]'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <Link
                  href="/manager/requests"
                  className="text-[13px] font-semibold text-[#A67C2E] hover:text-[#7A591C] flex items-center gap-1 px-2.5 py-1.5 no-underline"
                >
                  {t('manager.dashboard.viewAll', 'Xem tất cả')} <ChevronRight size={13} />
                </Link>
              </div>
            </div>

            {loadingError && (
              <div
                role="alert"
                className="m-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-[#B33E3E] text-xs font-semibold flex flex-wrap items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle size={15} />
                  <span>
                    {t('manager.dashboard.loadError', 'Không thể tải danh sách yêu cầu vận chuyển.')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    mutatePendingRequests();
                    mutateAllOrders();
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-[#B33E3E] font-bold hover:bg-rose-100 cursor-pointer"
                >
                  <RefreshCw size={12} /> {t('common.retry', 'Thử lại')}
                </button>
              </div>
            )}

            {loadingRequests ? (
              <div className="divide-y divide-[#F0EEE8]">
                {[...Array(3)].map((_, idx) => (
                  <div key={idx} className="px-6 py-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="w-32 h-4 bg-[#E5DFD3] rounded animate-pulse" />
                      <div className="w-24 h-4 bg-[#E5DFD3] rounded animate-pulse" />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <div className="w-56 h-5 bg-[#E5DFD3] rounded animate-pulse" />
                      <div className="w-36 h-7 bg-[#E5DFD3] rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredPendingRequests.length === 0 ? (
              <div className="py-10 px-6 text-center text-[13px] text-[#5C6658]">
                {t('manager.dashboard.noPending', 'Không có yêu cầu chờ duyệt phù hợp bộ lọc.')}
              </div>
            ) : (
              <div className="divide-y divide-[#EAE5DA]">
                {paginatedPendingRequests.map((req) => {
                  const horseQty = req.requestedHorseCount || req.horses?.length || 0;
                  const needsQuote = req.totalCost == null || req.totalCost <= 0;
                  const depDateRaw = (req as any).departureDate || req.requestedDate;
                  const depDateStr = depDateRaw
                    ? new Date(depDateRaw).toLocaleDateString(isEn ? 'en-GB' : 'vi-VN')
                    : '—';

                  return (
                    <div
                      key={req.id}
                      className="px-5 py-4 hover:bg-[#FAF9F5] transition-colors flex flex-col gap-3"
                    >
                      {/* Top Meta Row: Order Code + Quote Badge + Customer/Horses + Departure Date + Status */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <Link
                            href={`/manager/requests/${req.id}`}
                            className="technical-id-badge text-[#7A591C] bg-[#FAF8F4] border-[#C4B38E] no-underline hover:underline whitespace-nowrap shrink-0"
                          >
                            {req.requestCode || `REQ-${String(req.id).padStart(3, '0')}`}
                          </Link>
                          {needsQuote ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-[#F8EAEA] text-[#B33E3E] border border-[#E5B8B8] uppercase whitespace-nowrap shrink-0">
                              {t('manager.dashboard.needsCost', 'Chưa báo giá')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-[#E8F2EB] text-[#287653] border border-[#B7DBC4] whitespace-nowrap shrink-0 tabular-nums">
                              {Number(req.totalCost).toLocaleString('vi-VN')} ₫
                            </span>
                          )}
                          <span className="text-xs font-bold text-[#181A17] truncate max-w-[200px]">
                            {req.contactName || t('manager.dashboard.customerFallback', 'Khách hàng')}
                          </span>
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F0EEE8] text-[#5C6658] whitespace-nowrap shrink-0">
                            {horseQty} {isEn ? (horseQty > 1 ? 'horses' : 'horse') : 'ngựa'}
                          </span>
                          <span className="text-[11.5px] text-[#5F6977] whitespace-nowrap shrink-0">
                            • {isEn ? 'Dep:' : 'Khởi hành:'} <strong className="text-[#242722]">{depDateStr}</strong>
                          </span>
                        </div>

                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#F8F0DF] text-[#966516] border border-[#DFCA9A] whitespace-nowrap shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#A67C2E]" />
                          {formatShipmentStatusLabel(req.status, isEn)}
                        </span>
                      </div>

                      {/* Bottom Row: Route Display + Action Buttons */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FAF8F4]/70 border border-[#EAE5DA] rounded-xl px-3.5 py-2.5">
                        <div className="min-w-0 flex-1">
                          <FlightyRouteDisplay
                            origin={req.originLocation}
                            destination={req.destinationLocation}
                            mode={req.transportMode || undefined}
                            variant="compact"
                          />
                        </div>

                        <div className="flex flex-wrap items-center sm:justify-end gap-1.5 shrink-0">
                          {(req.status === 'paid_pending_review' ||
                            req.status === 'paid_pending_feasibility') && (
                            <Link
                              href={`/manager/requests/${req.id}`}
                              className="no-underline px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#287653] hover:bg-[#1f5e42] transition-colors whitespace-nowrap shadow-xs"
                            >
                              {isEn ? 'Review Feasibility' : 'Duyệt khả thi'}
                            </Link>
                          )}
                          {req.status === 'requested' && (
                            <>
                              <button
                                type="button"
                                onClick={() => openModal('APPROVE', req.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#287653] hover:bg-[#1f5e42] border-0 cursor-pointer transition-colors whitespace-nowrap shadow-xs"
                              >
                                {t('manager.requests.approve', 'Phê duyệt')}
                              </button>
                              <button
                                type="button"
                                onClick={() => openModal('REJECT', req.id)}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#B33E3E] bg-white hover:bg-[#FDF6F6] border border-[#E5B8B8] cursor-pointer transition-colors whitespace-nowrap"
                              >
                                {t('manager.requests.reject', 'Từ chối')}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination Controls */}
            {totalRequestPages > 1 && (
              <div className="px-6 py-3 border-t border-[#EAE5DA] bg-[#FAF9F5] rounded-b-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="text-[#5C6658] font-medium">
                  {isEn
                    ? `Showing ${(safeRequestPage - 1) * requestPageSize + 1} - ${Math.min(
                        safeRequestPage * requestPageSize,
                        filteredPendingRequests.length
                      )} of ${filteredPendingRequests.length} requests`
                    : `Hiển thị ${(safeRequestPage - 1) * requestPageSize + 1} - ${Math.min(
                        safeRequestPage * requestPageSize,
                        filteredPendingRequests.length
                      )} / ${filteredPendingRequests.length} yêu cầu`}
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setRequestPage((p) => Math.max(1, p - 1))}
                    disabled={safeRequestPage === 1}
                    className="px-2.5 py-1 rounded-md border border-[#D8CEBE] bg-white text-[#242722] disabled:text-[#A5ACA1] disabled:cursor-not-allowed font-semibold text-xs cursor-pointer"
                  >
                    {t('common.previous', 'Trước')}
                  </button>
                  {Array.from({ length: totalRequestPages }, (_, i) => i + 1)
                    .filter((pg) => {
                      if (totalRequestPages <= 5) return true;
                      return (
                        pg === 1 ||
                        pg === totalRequestPages ||
                        Math.abs(pg - safeRequestPage) <= 1
                      );
                    })
                    .map((pg, idx, arr) => (
                      <React.Fragment key={pg}>
                        {idx > 0 && arr[idx - 1] !== pg - 1 && (
                          <span className="px-1 text-[#7E867B] text-xs">...</span>
                        )}
                        <button
                          type="button"
                          aria-current={pg === safeRequestPage ? 'page' : undefined}
                          onClick={() => setRequestPage(pg)}
                          className={`w-7 h-7 rounded-md font-bold text-xs cursor-pointer transition-colors ${
                            pg === safeRequestPage
                              ? 'bg-[#A67C2E] text-white border-0'
                              : 'bg-white text-[#242722] border border-[#D8CEBE] hover:bg-[#FAF8F4]'
                          }`}
                        >
                          {pg}
                        </button>
                      </React.Fragment>
                    ))}
                  <button
                    type="button"
                    onClick={() => setRequestPage((p) => Math.min(totalRequestPages, p + 1))}
                    disabled={safeRequestPage === totalRequestPages}
                    className="px-2.5 py-1 rounded-md border border-[#D8CEBE] bg-white text-[#242722] disabled:text-[#A5ACA1] disabled:cursor-not-allowed font-semibold text-xs cursor-pointer"
                  >
                    {t('common.next', 'Sau')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Change Requests + Quick Analytics */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* REVISION & EMERGENCY TRACKER */}
          <div className="bg-white rounded-2xl border border-[#E5DDD0] shadow-sm p-5">
            <div className="flex justify-between items-center mb-3.5">
              <h2 className="text-sm font-bold text-[#181A17] m-0">
                {t('manager.dashboard.revisionsTitle', 'Yêu Cầu Điều Chỉnh & Khẩn Cấp')}
              </h2>
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                  changeRequestedOrders.length > 0
                    ? 'text-[#966516] bg-[#F8F0DF] border-[#DFCA9A]'
                    : 'text-[#287653] bg-[#E8F2EB] border-[#B7DBC4]'
                }`}
              >
                {changeRequestedOrders.length}{' '}
                {t('manager.requests.totalUnit', 'đơn')}
              </span>
            </div>

            {changeRequestedOrders.length === 0 ? (
              <div className="border border-[#EAE5DA] bg-[#FAF8F4] rounded-xl py-4 px-4 flex items-center gap-3">
                <CheckCircle2 size={20} className="text-[#287653] shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-[#181A17] m-0">
                    {t('manager.dashboard.noRevisions', 'Không có yêu cầu chỉnh sửa chờ khách')}
                  </p>
                  <p className="text-[11px] text-[#5F6977] mt-0.5 mb-0">
                    {t(
                      'manager.dashboard.noRevisionsDesc',
                      'Các đơn đang yêu cầu bổ sung thông tin hoặc đổi tuyến sẽ hiển thị tại đây.'
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {changeRequestedOrders.slice(0, 3).map((ord) => (
                  <Link
                    key={ord.id}
                    href={`/manager/requests/${ord.id}`}
                    className="no-underline flex items-center justify-between p-3 rounded-xl border border-[#EAE5DA] bg-[#FAF8F4] hover:bg-[#F8F0DF]/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#181A17] m-0 truncate">
                        {ord.requestCode || `REQ-${String(ord.id).padStart(3, '0')}`}
                      </p>
                      <p className="text-[11px] text-[#5F6977] m-0 truncate">
                        {ord.originLocation} → {ord.destinationLocation}
                      </p>
                    </div>
                    <ChevronRight size={14} className="text-[#A67C2E] shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- Action Modals --- */}
      <Modal
        isOpen={activeModal !== 'NONE'}
        onClose={closeModal}
        closeDisabled={isSubmitting}
        title={
          activeModal === 'APPROVE'
            ? t('manager.dashboard.modalApproveTitle', 'Phê Duyệt Yêu Cầu Vận Chuyển')
            : activeModal === 'REJECT'
            ? t('manager.dashboard.modalRejectTitle', 'Từ Chối Yêu Cầu Vận Chuyển')
            : t('manager.dashboard.modalChangeTitle', 'Yêu Cầu Khách Chỉnh Sửa')
        }
        subtitle={`${t('manager.requests.colId', 'Mã đơn')}: ${
          selectedOrder?.requestCode || (selectedOrderId ? `#${selectedOrderId}` : '')
        }`}
        maxWidth="max-w-lg"
      >
        <div className="flex flex-col gap-4">
          {modalError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-50 text-[#B33E3E] text-xs font-semibold border border-rose-200 flex items-center gap-2"
            >
              <AlertTriangle size={14} className="shrink-0" />
              <span>{modalError}</span>
            </div>
          )}

          {activeModal === 'APPROVE' && (
            <div className="flex flex-col gap-3.5">
              {selectedOrder && (() => {
                const routeInfo = buildEquineRoute(
                  selectedOrder.originLocation || '',
                  selectedOrder.destinationLocation || '',
                  approveTransportMode
                );
                const horseCount =
                  selectedOrder.requestedHorseCount || selectedOrder.horses?.length || 1;
                return (
                  <>
                    <div className="p-3 rounded-xl bg-[#FAF8F4] border border-[#D8CEBE] text-xs space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-bold text-[#181A17]">
                          {bookingName(selectedOrder.bookingType)} · {horseCount}{' '}
                          {isEn ? 'horses' : 'ngựa'}
                        </div>
                        <div className="inline-flex p-0.5 rounded-lg bg-white border border-[#D8CEBE]">
                          <button
                            type="button"
                            onClick={() => handleDashboardModeToggle('road')}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                              approveTransportMode === 'road'
                                ? 'bg-[#181A17] text-white'
                                : 'text-[#5C6658]'
                            }`}
                          >
                            {t('manager.requests.modeRoad', 'Đường bộ')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDashboardModeToggle('air')}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                              approveTransportMode === 'air'
                                ? 'bg-[#181A17] text-white'
                                : 'text-[#5C6658]'
                            }`}
                          >
                            {t('manager.requests.modeAir', 'Hàng không')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDashboardModeToggle('sea')}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                              approveTransportMode === 'sea'
                                ? 'bg-[#0E7490] text-white'
                                : 'text-[#5C6658]'
                            }`}
                          >
                            {t('manager.requests.modeSea', isEn ? 'Sea' : 'Đường thủy')}
                          </button>
                        </div>
                      </div>
                      <div className="text-[#5C6658] flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {selectedOrder.originLocation} → {selectedOrder.destinationLocation}
                        </span>
                        <strong className="text-[#181A17]">
                          {routeInfo.distanceKm.toLocaleString('vi-VN')} km · ~{routeInfo.durationHours}h
                        </strong>
                      </div>
                    </div>
                  </>
                );
              })()}

              <div>
                <label
                  htmlFor="dashboard-approve-note"
                  className="text-[13px] font-semibold text-[#242722] block mb-1.5"
                >
                  {t('manager.dashboard.approveNoteLabel', 'Ghi chú phê duyệt')}{' '}
                  <span className="text-[#7E867B] font-normal">
                    ({t('common.optional', 'tùy chọn')})
                  </span>
                </label>
                <input
                  id="dashboard-approve-note"
                  type="text"
                  value={approveNote}
                  onChange={(e) => setApproveNote(e.target.value)}
                  placeholder={t(
                    'manager.dashboard.approveNotePlaceholder',
                    'VD: Đủ điều kiện vận hành, chuyển Coordinator lập tuyến.'
                  )}
                  className="w-full p-3 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-sm text-[#181A17] outline-none focus:border-[#181A17] focus:ring-2 focus:ring-[#C4B38E]/30"
                />
              </div>
            </div>
          )}

          {activeModal === 'REJECT' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="dashboard-reject-reason"
                  className="text-[13px] font-semibold text-[#242722]"
                >
                  {t('manager.requests.rejectionReason', 'Lý do từ chối (Tối thiểu 5 ký tự)')}
                </label>
                <span className="text-[11px] text-[#7E867B]">{inputValue.trim().length} / 5+</span>
              </div>
              <textarea
                id="dashboard-reject-reason"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={t(
                  'manager.requests.fieldRejectPlaceholder',
                  'VD: Tuyến vận chuyển qua cửa khẩu hiện đang đóng...'
                )}
                className="w-full p-3 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-sm min-h-[100px] resize-y outline-none focus:border-[#B33E3E] focus:ring-2 focus:ring-rose-200"
                autoFocus
              />
              <p className="text-xs text-[#5C6658] m-0">
                {t('manager.dashboard.visibleToCustomer', 'Lý do này sẽ hiển thị cho khách hàng.')}
              </p>
            </div>
          )}

          {activeModal === 'CHANGE' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="dashboard-change-reason"
                  className="text-[13px] font-semibold text-[#242722]"
                >
                  {t('manager.requests.revisionNotes', 'Nội dung yêu cầu chỉnh sửa (Tối thiểu 5 ký tự)')}
                </label>
                <span className="text-[11px] text-[#7E867B]">{inputValue.trim().length} / 5+</span>
              </div>
              <textarea
                id="dashboard-change-reason"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={t(
                  'manager.requests.fieldChangePlaceholder',
                  'VD: Vui lòng cập nhật lại ngày khởi hành chính xác...'
                )}
                className="w-full p-3 rounded-xl border border-[#D8CEBE] bg-[#FDFCFB] text-sm min-h-[100px] resize-y outline-none focus:border-[#181A17] focus:ring-2 focus:ring-[#C4B38E]/30"
                autoFocus
              />
              <p className="text-xs text-[#5C6658] m-0">
                {t(
                  'manager.dashboard.customerResubmitHint',
                  'Khách hàng sẽ nhận thông báo và chỉnh sửa lại yêu cầu.'
                )}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-3 border-t border-[#F0EEE8] justify-end">
            <button
              type="button"
              onClick={closeModal}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-[#D8CEBE] bg-white text-[#242722] font-semibold text-[13px] hover:bg-[#FAF9F5] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {t('common.cancel', 'Hủy')}
            </button>
            <button
              type="button"
              onClick={handleConfirmAction}
              disabled={isSubmitting}
              className={`px-5 py-2.5 rounded-xl border-0 text-white font-semibold text-[13px] flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-colors ${
                activeModal === 'APPROVE'
                  ? 'bg-[#287653] hover:bg-[#1f5e42]'
                  : activeModal === 'REJECT'
                  ? 'bg-[#B33E3E] hover:bg-[#963232]'
                  : 'bg-[#A67C2E] hover:bg-[#8E6823]'
              }`}
            >
              {isSubmitting ? (
                <span>{t('common.processing', 'Đang xử lý...')}</span>
              ) : (
                <>
                  {activeModal === 'APPROVE' && <CheckCircle2 size={16} />}
                  {activeModal === 'REJECT' && <X size={16} />}
                  {activeModal === 'CHANGE' && <AlertTriangle size={16} />}
                  <span>{t('common.confirm', 'Xác nhận')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
