'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Plane,
  Truck,
  Ship,
  FileText,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Shield,
  FileCheck2,
  LayoutGrid,
  List,
  Search,
  CreditCard,
  RotateCcw,
  ClipboardCheck,
  Navigation,
  Edit3,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { DocumentUploadModal } from '@/features/documents/components/DocumentUploadModal';
import { useCustomerStore, getFullPhotoUrl } from '@/lib/customer-store';
import { UserProfile, Horse } from '@/lib/types';
import { getCurrentUser } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { documentsApi } from '@/features/documents/api/documents.api';
import { trackingApi, type DeliveryHandoverItem } from '@/features/tracking/api/tracking.api';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { NumberTicker } from '@/components/ui/NumberTicker';
import { StatusBadge, type BadgeVariant } from '@/components/ui/StatusBadge';
import { PaymentCountdownBadge } from '@/features/orders/components/PaymentCountdownBadge';
import { SepayPaymentModal } from '@/features/orders/components/SepayPaymentModal';

const FALLBACK_HORSE_PHOTO =
  'https://images.unsplash.com/photo-1598974357801-cbca100e65d3?auto=format&fit=crop&w=800&q=80';

const TERMINAL_STATUSES = new Set([
  'completed',
  'cancelled',
  'cancelled_operational',
  'rejected',
  'refunded',
]);

function getOrderBadgeVariant(status: string): BadgeVariant {
  const s = (status || '').toLowerCase();
  if (s === 'in_transit' || s === 'return_pending') return 'transit';
  if (s === 'approved' || s === 'completed' || s === 'confirmed' || s === 'ready_to_depart') return 'success';
  if (s === 'rejected' || s === 'cancelled' || s === 'cancelled_operational' || s === 'refunded') return 'danger';
  if (
    s === 'requested' ||
    s === 'awaiting_payment' ||
    s === 'paid_pending_review' ||
    s === 'under_review' ||
    s === 'planning' ||
    s === 'change_requested' ||
    s === 'refund_requested'
  ) {
    return 'pending';
  }
  return 'neutral';
}

function getModeIcon(mode?: string) {
  const m = String(mode || '').toLowerCase();
  if (m === 'air') return <Plane size={13} className="text-[#A67C2E] shrink-0" aria-hidden="true" />;
  if (m === 'sea') return <Ship size={13} className="text-[#A67C2E] shrink-0" aria-hidden="true" />;
  return <Truck size={13} className="text-[#A67C2E] shrink-0" aria-hidden="true" />;
}

export default function CustomerDashboardPage() {
  const router = useRouter();
  const {
    t,
    language,
    translateStatus,
    translateBreed,
    translateNotification,
    translateTimeAgo,
  } = useLanguage();
  const isEn = language === 'en';

  const {
    horses,
    notifications,
    uploadDocumentForRequest,
    markAllNotificationsRead,
    markNotificationRead,
    refreshHorses,
    refreshRequests,
    refreshNotifications,
  } = useCustomerStore();

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [pendingHandovers, setPendingHandovers] = useState<DeliveryHandoverItem[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [docCount, setDocCount] = useState({ pending: 0, missing: 0, approved: 0, total: 0 });

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [activeRequestForUpload, setActiveRequestForUpload] = useState<string>('');
  const [payModalOrder, setPayModalOrder] = useState<{
    id: number;
    requestCode: string;
    totalCost: number;
    paymentDueAt?: string | null;
    createdAt?: string | null;
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoadingOrders(true);
      setLoadError(null);
      const [ordersRes, docsRes] = await Promise.all([
        apiClient<any[]>('/orders/my-orders'),
        documentsApi.getDocuments().catch(() => []),
      ]);
      const ordersList = Array.isArray(ordersRes) ? ordersRes : [];
      setMyOrders(ordersList);

      if (Array.isArray(docsRes)) {
        const pending = docsRes.filter((d: any) =>
          ['pending', 'submitted', 'under_review'].includes((d.status || '').toLowerCase()),
        ).length;
        const missing = docsRes.filter((d: any) =>
          ['missing', 'rejected', 'expired'].includes((d.status || '').toLowerCase()),
        ).length;
        const approved = docsRes.filter(
          (d: any) => (d.status || '').toLowerCase() === 'approved',
        ).length;
        setDocCount({ pending, missing, approved, total: docsRes.length });
      }

      // Check pending customer handovers on in_transit / completed orders (cap to recent 5)
      const handoverCandidates = ordersList
        .filter((o) => ['in_transit', 'return_pending', 'completed'].includes(String(o.status || '').toLowerCase()))
        .slice(0, 5);
      if (handoverCandidates.length > 0) {
        const handoverResults = await Promise.allSettled(
          handoverCandidates.map((o) => trackingApi.getShipmentHandovers(Number(o.id))),
        );
        const pendingList: DeliveryHandoverItem[] = [];
        for (const r of handoverResults) {
          if (r.status === 'fulfilled' && Array.isArray(r.value)) {
            for (const item of r.value) {
              if (item.status === 'pending') pendingList.push(item);
            }
          }
        }
        setPendingHandovers(pendingList);
      } else {
        setPendingHandovers([]);
      }
    } catch (err: any) {
      setLoadError(
        err?.message ||
          t('common.loadError', isEn ? 'Failed to load dashboard data.' : 'Không thể tải dữ liệu bảng điều khiển.'),
      );
    } finally {
      setIsLoadingOrders(false);
    }
  }, [isEn, t]);

  useEffect(() => {
    setCurrentUser(getCurrentUser());
    const handleUserUpdate = () => setCurrentUser(getCurrentUser());
    const handleOpenUploadModal = () => {
      setActiveRequestForUpload('');
      setIsUploadModalOpen(true);
    };
    window.addEventListener('auth-user-updated', handleUserUpdate);
    window.addEventListener('open-customer-upload-modal', handleOpenUploadModal);
    void loadData();
    void refreshHorses();
    void refreshNotifications();
    return () => {
      window.removeEventListener('auth-user-updated', handleUserUpdate);
      window.removeEventListener('open-customer-upload-modal', handleOpenUploadModal);
    };
  }, [loadData, refreshHorses, refreshNotifications]);

  const handleDocumentUploadSuccess = (uploadedDoc: any) => {
    if (activeRequestForUpload) {
      uploadDocumentForRequest(activeRequestForUpload, uploadedDoc.title);
    }
    setActiveRequestForUpload('');
    setIsUploadModalOpen(false);
    toast.success(t('common.success', isEn ? 'Document uploaded successfully' : 'Tải lên tài liệu thành công'));
    void loadData();
  };

  // Accurate metrics excluding refunded & cancelled_operational from active orders
  const activeShipments = useMemo(
    () => myOrders.filter((o) => !TERMINAL_STATUSES.has(String(o.status || '').toLowerCase())),
    [myOrders],
  );
  const inTransitCount = useMemo(
    () =>
      myOrders.filter((o) =>
        ['in_transit', 'return_pending'].includes(String(o.status || '').toLowerCase()),
      ).length,
    [myOrders],
  );
  const readyOrPlanningCount = useMemo(
    () =>
      myOrders.filter((o) =>
        ['ready_to_depart', 'confirmed', 'planning', 'approved'].includes(
          String(o.status || '').toLowerCase(),
        ),
      ).length,
    [myOrders],
  );
  const historyOrders = useMemo(
    () => myOrders.filter((o) => TERMINAL_STATUSES.has(String(o.status || '').toLowerCase())),
    [myOrders],
  );
  const completedCount = useMemo(
    () => myOrders.filter((o) => String(o.status || '').toLowerCase() === 'completed').length,
    [myOrders],
  );
  const pendingDocsCount = docCount.pending + docCount.missing;
  const docComplianceRate =
    docCount.total > 0 ? Math.round((docCount.approved / docCount.total) * 100) : null;

  // Build "Việc cần xử lý ngay" Action Queue from real APIs
  const actionQueueItems = useMemo(() => {
    const items: Array<{
      id: string;
      severity: 'urgent' | 'warning' | 'info';
      title: string;
      subtitle: string;
      ctaLabel: string;
      href?: string;
      onClick?: () => void;
      paymentDueAt?: string | null;
      createdAt?: string | null;
      icon: React.ReactNode;
    }> = [];

    // 1. Unpaid awaiting_payment orders (with 12h countdown + Quick Pay Popup)
    const awaitingPaymentOrders = myOrders.filter(
      (o) => String(o.status || '').toLowerCase() === 'awaiting_payment',
    );
    for (const o of awaitingPaymentOrders) {
      const code = o.customerRequestCode || o.requestCode || `REQ-${String(o.id).padStart(3, '0')}`;
      items.push({
        id: `pay-${o.id}`,
        severity: 'urgent',
        title: isEn
          ? `Order ${code} awaiting VietQR payment`
          : `Đơn ${code} chờ thanh toán VietQR`,
        subtitle: `${(o.originLocation || '').split(',')[0]} → ${(o.destinationLocation || '').split(',')[0]} · ${Number(o.totalCost || 0).toLocaleString('vi-VN')} đ`,
        ctaLabel: isEn ? 'Pay Now' : 'Thanh toán ngay',
        paymentDueAt: o.paymentDueAt,
        createdAt: o.createdAt,
        icon: <CreditCard size={16} className="text-rose-600" aria-hidden="true" />,
        onClick: () =>
          setPayModalOrder({
            id: Number(o.id),
            requestCode: code,
            totalCost: Number(o.totalCost || 0),
            paymentDueAt: o.paymentDueAt,
            createdAt: o.createdAt,
          }),
      });
    }

    // 2. 100% Refund form required (refund_requested)
    const refundOrders = myOrders.filter(
      (o) => String(o.status || '').toLowerCase() === 'refund_requested',
    );
    for (const o of refundOrders) {
      const code = o.customerRequestCode || o.requestCode || `REQ-${String(o.id).padStart(3, '0')}`;
      items.push({
        id: `refund-${o.id}`,
        severity: 'urgent',
        title: isEn
          ? `Submit bank details for 100% refund (${code})`
          : `Điền tài khoản nhận hoàn tiền 100% (${code})`,
        subtitle: isEn
          ? `Refund amount: ${Number(o.totalCost || 0).toLocaleString('vi-VN')} VND (3–5 business days)`
          : `Số tiền hoàn: ${Number(o.totalCost || 0).toLocaleString('vi-VN')} đ (xử lý 3–5 ngày làm việc)`,
        ctaLabel: isEn ? 'Fill Refund Form' : 'Điền STK hoàn tiền',
        href: `/customer/requests/${o.id}/refund`,
        icon: <RotateCcw size={16} className="text-rose-600" aria-hidden="true" />,
      });
    }

    // 3. Change requested orders
    const changeReqOrders = myOrders.filter(
      (o) => String(o.status || '').toLowerCase() === 'change_requested',
    );
    for (const o of changeReqOrders) {
      const code = o.customerRequestCode || o.requestCode || `REQ-${String(o.id).padStart(3, '0')}`;
      items.push({
        id: `change-${o.id}`,
        severity: 'warning',
        title: isEn
          ? `Order ${code} requires your revision`
          : `Đơn ${code} cần chỉnh sửa thông tin`,
        subtitle:
          o.changeRequestNotes ||
          (isEn
            ? 'Logistics Manager requested updates before approval.'
            : 'Quản lý vận hành yêu cầu bổ sung thông tin trước khi duyệt.'),
        ctaLabel: isEn ? 'Update Order' : 'Cập nhật ngay',
        href: `/customer/requests/${o.id}`,
        icon: <Edit3 size={16} className="text-amber-700" aria-hidden="true" />,
      });
    }

    // 4. Pending handover confirmations
    const uniqueHandoverShipments = new Map<number, DeliveryHandoverItem>();
    for (const h of pendingHandovers) {
      if (!uniqueHandoverShipments.has(h.shipmentId)) {
        uniqueHandoverShipments.set(h.shipmentId, h);
      }
    }
    for (const [sid, h] of uniqueHandoverShipments.entries()) {
      items.push({
        id: `handover-${sid}`,
        severity: 'warning',
        title: isEn
          ? `Confirm delivery handover (${h.requestCode})`
          : `Xác nhận biên bản bàn giao (${h.requestCode})`,
        subtitle: isEn
          ? `Horse ${h.horseName} delivered — please inspect & confirm receipt.`
          : `Chiến mã ${h.horseName} đã bàn giao — vui lòng kiểm tra & ký xác nhận.`,
        ctaLabel: isEn ? 'Confirm Handover' : 'Xác nhận bàn giao',
        href: `/customer/requests/${sid}?tab=horses`,
        icon: <ClipboardCheck size={16} className="text-amber-700" aria-hidden="true" />,
      });
    }

    // 5. Missing / expired / rejected quarantine documents
    if (docCount.missing > 0) {
      items.push({
        id: 'missing-docs',
        severity: 'warning',
        title: isEn
          ? `${docCount.missing} quarantine document(s) missing, expired, or rejected`
          : `${docCount.missing} hồ sơ kiểm dịch thiếu, hết hạn hoặc cần nộp lại`,
        subtitle: isEn
          ? 'Upload updated certificates promptly to prevent departure delays.'
          : 'Bổ sung chứng từ sớm để đảm bảo tiến độ thông quan và xuất phát.',
        ctaLabel: isEn ? 'Upload Documents' : 'Bổ sung hồ sơ',
        href: '/customer/documents',
        icon: <AlertTriangle size={16} className="text-amber-700" aria-hidden="true" />,
      });
    }

    return items;
  }, [myOrders, pendingHandovers, docCount.missing, isEn]);

  const showcaseHorses = horses.slice(0, 4);

  // Contextual Primary Action per status (replaces blanket "Theo dõi" button)
  const renderContextualAction = (ord: any, compact = false) => {
    const s = String(ord.status || '').toLowerCase();
    const code = ord.customerRequestCode || ord.requestCode || `REQ-${String(ord.id).padStart(3, '0')}`;
    const btnSize = compact ? 'px-2.5 py-1 text-[11.5px]' : 'px-3 py-1.5 text-xs';

    if (s === 'awaiting_payment') {
      return (
        <button
          type="button"
          onClick={() =>
            setPayModalOrder({
              id: Number(ord.id),
              requestCode: code,
              totalCost: Number(ord.totalCost || 0),
              paymentDueAt: ord.paymentDueAt,
              createdAt: ord.createdAt,
            })
          }
          className={`${btnSize} rounded-lg bg-[#181A17] hover:bg-[#2C2F2A] text-[#FAF8F4] font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer`}
        >
          <CreditCard size={13} className="text-[#D4C5A3]" aria-hidden="true" />
          <span>{isEn ? 'Pay Now' : 'Thanh toán ngay'}</span>
        </button>
      );
    }

    if (s === 'refund_requested') {
      return (
        <Link
          href={`/customer/requests/${ord.id}/refund`}
          className={`${btnSize} rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold inline-flex items-center gap-1.5 transition-colors no-underline`}
        >
          <RotateCcw size={13} aria-hidden="true" />
          <span>{isEn ? 'Refund Form' : 'Điền STK hoàn tiền'}</span>
        </Link>
      );
    }

    if (s === 'change_requested') {
      return (
        <Link
          href={`/customer/requests/${ord.id}`}
          className={`${btnSize} rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold inline-flex items-center gap-1.5 transition-colors no-underline`}
        >
          <Edit3 size={13} aria-hidden="true" />
          <span>{isEn ? 'Revise Order' : 'Chỉnh sửa đơn'}</span>
        </Link>
      );
    }

    if (s === 'in_transit' || s === 'return_pending') {
      return (
        <Link
          href={`/customer/tracking?shipmentId=${ord.id}`}
          className={`${btnSize} rounded-lg bg-[#181A17] hover:bg-[#2C2F2A] text-[#FAF8F4] font-bold inline-flex items-center gap-1.5 transition-colors no-underline`}
        >
          <Navigation size={13} className="text-[#D4C5A3]" aria-hidden="true" />
          <span>{isEn ? 'Live Tracking' : 'Theo dõi GPS'}</span>
        </Link>
      );
    }

    if (['approved', 'planning', 'confirmed', 'ready_to_depart'].includes(s)) {
      return (
        <Link
          href={`/customer/requests/${ord.id}?tab=documents`}
          className={`${btnSize} rounded-lg bg-[#FAF8F4] border border-[#D8CEBE] hover:bg-[#EFE9DC] text-[#181A17] font-bold inline-flex items-center gap-1.5 transition-colors no-underline`}
        >
          <Shield size={13} className="text-[#A67C2E]" aria-hidden="true" />
          <span>{isEn ? 'Docs & Route' : 'Hồ sơ & Lộ trình'}</span>
        </Link>
      );
    }

    return (
      <Link
        href={`/customer/requests/${ord.id}`}
        className={`${btnSize} rounded-lg bg-[#FAF8F4] border border-[#D8CEBE] hover:bg-[#EFE9DC] text-[#181A17] font-bold inline-flex items-center gap-1 transition-colors no-underline`}
      >
        <span>{isEn ? 'Details' : 'Chi tiết đơn'}</span>
        <ChevronRight size={13} aria-hidden="true" />
      </Link>
    );
  };

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* 0. COMPACT HEADER */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#181A17] tracking-tight m-0 truncate">
          {isEn
            ? `Welcome back${currentUser?.name ? `, ${currentUser.name}` : ''}`
            : `Xin chào${currentUser?.name ? `, ${currentUser.name}` : ''}`}
        </h1>
      </div>

      {loadError && (
        <div
          role="alert"
          className="rounded-2xl border border-[#B33E3E]/30 bg-[#F8EAEA] px-4 py-3 text-xs font-semibold text-[#B33E3E] flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="px-3 py-1.5 rounded-lg bg-[#B33E3E] text-white font-bold hover:opacity-90 transition-opacity cursor-pointer"
          >
            {t('common.retry', isEn ? 'Retry' : 'Thử lại')}
          </button>
        </div>
      )}

      {/* 1. ACTION CENTER: "VIỆC CẦN XỬ LÝ NGAY" */}
      {!isLoadingOrders && actionQueueItems.length > 0 && (
        <section
          aria-label={isEn ? 'Immediate actions required' : 'Việc cần xử lý ngay'}
          className="rounded-2xl border border-[#DFCA9A] bg-gradient-to-br from-[#FFFBF2] to-[#FAF4E6] p-4 sm:p-5 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="w-7 h-7 rounded-lg bg-[#181A17] text-[#D4C5A3] flex items-center justify-center shrink-0">
              <Zap size={14} aria-hidden="true" />
            </span>
            <h2 className="text-sm sm:text-base font-extrabold text-[#181A17] m-0">
              {isEn ? 'Action Required Now' : 'Việc cần xử lý ngay'}
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-[#B33E3E] text-white">
              {actionQueueItems.length}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {actionQueueItems.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border bg-white px-3.5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${
                  item.severity === 'urgent' ? 'border-rose-200' : 'border-[#E5DDD0]'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      item.severity === 'urgent' ? 'bg-rose-50' : 'bg-amber-50'
                    }`}
                  >
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-extrabold text-[#181A17]">{item.title}</span>
                      {(item.paymentDueAt || item.createdAt) && item.id.startsWith('pay-') && (
                        <PaymentCountdownBadge
                          paymentDueAt={item.paymentDueAt}
                          createdAt={item.createdAt}
                          compact
                        />
                      )}
                    </div>
                    <p className="text-[11.5px] text-[#5F6977] mt-0.5 mb-0 line-clamp-2">
                      {item.subtitle}
                    </p>
                  </div>
                </div>

                {item.onClick ? (
                  <button
                    type="button"
                    onClick={item.onClick}
                    className="px-3 py-1.5 rounded-lg bg-[#181A17] hover:bg-[#2C2F2A] text-[#FAF8F4] text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-center"
                  >
                    {item.ctaLabel}
                  </button>
                ) : (
                  <Link
                    href={item.href || '/customer/requests'}
                    className="px-3 py-1.5 rounded-lg bg-[#181A17] hover:bg-[#2C2F2A] text-[#FAF8F4] text-xs font-bold whitespace-nowrap shrink-0 no-underline self-start sm:self-center"
                  >
                    {item.ctaLabel}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 2. KPI STAT SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Link
          href="/customer/requests"
          className="block bg-white rounded-2xl border border-[#E5DDD0] hover:border-[#C5B6A0] p-4 transition-all hover:-translate-y-0.5 shadow-sm no-underline"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] sm:text-xs font-semibold text-[#5F6977]">
              {isEn ? 'Active Orders' : 'Đơn đang mở'}
            </span>
            <FileCheck2 size={15} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[#181A17] tabular-num-luxury mt-2">
            {isLoadingOrders ? '—' : <NumberTicker value={activeShipments.length} duration={500} />}
          </div>
        </Link>

        <Link
          href="/customer/tracking"
          className="block bg-white rounded-2xl border border-[#E5DDD0] hover:border-[#C5B6A0] p-4 transition-all hover:-translate-y-0.5 shadow-sm no-underline"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] sm:text-xs font-semibold text-[#5F6977]">
              {isEn ? 'In Transit' : 'Đang vận chuyển'}
            </span>
            <Plane size={15} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[#181A17] tabular-num-luxury mt-2">
            {isLoadingOrders ? '—' : <NumberTicker value={inTransitCount} duration={500} />}
          </div>
          {readyOrPlanningCount > 0 && (
            <div className="text-[11px] font-medium text-[#747D88] mt-1 truncate">
              {readyOrPlanningCount} {isEn ? 'scheduled' : 'chờ xuất phát'}
            </div>
          )}
        </Link>

        <Link
          href="/customer/documents"
          className="block bg-white rounded-2xl border border-[#E5DDD0] hover:border-[#C5B6A0] p-4 transition-all hover:-translate-y-0.5 shadow-sm no-underline"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] sm:text-xs font-semibold text-[#5F6977]">
              {isEn ? 'Compliant Docs' : 'Hồ sơ hợp lệ'}
            </span>
            <Shield size={15} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[#181A17] tabular-num-luxury mt-2">
            {isLoadingOrders || docComplianceRate === null ? (
              '—'
            ) : (
              <NumberTicker value={docComplianceRate} duration={600} suffix="%" />
            )}
          </div>
          <div
            className={`text-[11px] font-semibold mt-1 ${
              pendingDocsCount > 0 || (docComplianceRate !== null && docComplianceRate < 100)
                ? 'text-[#966516]'
                : docCount.total === 0
                  ? 'text-[#747D88]'
                  : 'text-[#287653]'
            }`}
          >
            {pendingDocsCount > 0
              ? `${pendingDocsCount} ${isEn ? 'pending' : 'cần xử lý'}`
              : docCount.total === 0
                ? '—'
                : `${docCount.approved}/${docCount.total} ${isEn ? 'approved' : 'đã duyệt'}`}
          </div>
        </Link>

        <Link
          href="/customer/reports"
          className="block bg-white rounded-2xl border border-[#E5DDD0] hover:border-[#C5B6A0] p-4 transition-all hover:-translate-y-0.5 shadow-sm no-underline"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] sm:text-xs font-semibold text-[#5F6977]">
              {isEn ? 'Completed' : 'Hoàn thành'}
            </span>
            <CheckCircle2 size={15} className="text-[#287653] shrink-0" aria-hidden="true" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-[#181A17] tabular-num-luxury mt-2">
            {isLoadingOrders ? '—' : <NumberTicker value={completedCount} duration={500} />}
          </div>
        </Link>
      </div>

      {/* 3. ACTIVE SHIPMENTS (Always visible on desktop & mobile without scroll-reveal gating) */}
      <div>
        {isLoadingOrders && myOrders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6 space-y-3 shadow-sm">
            <div className="h-5 w-52 rounded skeleton-shimmer" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="h-36 rounded-xl skeleton-shimmer" />
              <div className="h-36 rounded-xl skeleton-shimmer" />
            </div>
          </div>
        ) : activeShipments.length > 0 ? (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-[#181A17] m-0">
                {isEn ? 'Active Orders' : 'Đơn đang hoạt động'}{' '}
                <span className="text-[#747D88] font-semibold">({activeShipments.length})</span>
              </h2>
              <Link
                href="/customer/requests"
                className="text-xs font-bold text-[#A67C2E] hover:text-[#181A17] inline-flex items-center gap-1 no-underline transition-colors"
              >
                <span>{isEn ? 'All orders' : 'Tất cả đơn'}</span>
                <ChevronRight size={14} aria-hidden="true" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {activeShipments.slice(0, 4).map((ord) => {
                const reqCode = ord.requestCode || `REQ-${String(ord.id).padStart(3, '0')}`;
                const originCity =
                  ord.originLocation?.split(',')?.[0]?.trim() ||
                  ord.originLocation ||
                  (isEn ? 'Origin' : 'Điểm đón');
                const destCity =
                  ord.destinationLocation?.split(',')?.[0]?.trim() ||
                  ord.destinationLocation ||
                  (isEn ? 'Destination' : 'Điểm giao');
                const countVal = Number(ord.requestedHorseCount || 1);
                const horseNames =
                  ord.horses?.map((h: any) => h.name).join(', ') ||
                  `${countVal} ${isEn ? (countVal === 1 ? 'horse' : 'horses') : 'ngựa'}`;
                const statusLower = String(ord.status || '').toLowerCase();

                return (
                  <div
                    key={ord.id}
                    className="bg-white rounded-2xl border border-[#E5DDD0] hover:border-[#C5B6A0] p-4 flex flex-col gap-3 transition-all shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/customer/requests/${ord.id}`}
                          className="technical-id-badge no-underline hover:opacity-80"
                        >
                          {reqCode}
                        </Link>
                        <StatusBadge
                          label={translateStatus(ord.status)}
                          variant={getOrderBadgeVariant(ord.status)}
                          hasDot={statusLower === 'in_transit' || statusLower === 'return_pending'}
                        />
                      </div>
                      {statusLower === 'awaiting_payment' && (
                        <PaymentCountdownBadge
                          paymentDueAt={ord.paymentDueAt}
                          createdAt={ord.createdAt}
                          compact
                        />
                      )}
                    </div>

                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-extrabold text-[#181A17] truncate" title={ord.originLocation}>
                        {originCity}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[#A67C2E] shrink-0">
                        {getModeIcon(ord.transportMode)}
                        <span>→</span>
                      </span>
                      <span className="text-sm font-extrabold text-[#181A17] truncate" title={ord.destinationLocation}>
                        {destCity}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between pt-2.5 border-t border-[#EFEAE0] text-xs gap-2">
                      <span className="text-[#5F6977] truncate">
                        <strong className="text-[#181A17]">{horseNames}</strong>
                        {ord.requestedDate ? ` · ${new Date(ord.requestedDate).toLocaleDateString('vi-VN')}` : ''}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {renderContextualAction(ord, true)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="max-w-xl">
                <h2 className="text-lg font-bold text-[#181A17] m-0 mb-4">
                  {isEn ? 'Create Your Racehorse Transport Order' : 'Khởi Tạo Đơn Vận Chuyển Ngựa Đua'}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0] flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-[#181A17] text-[#C4B38E] flex items-center justify-center font-bold text-xs shrink-0">1</span>
                    <span className="text-xs font-semibold text-[#181A17]">{isEn ? 'Route & Schedule' : 'Chọn tuyến & lịch'}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0] flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-[#181A17] text-[#C4B38E] flex items-center justify-center font-bold text-xs shrink-0">2</span>
                    <span className="text-xs font-semibold text-[#181A17]">{isEn ? 'Horses & Insurance' : 'Ngựa & Bảo hiểm'}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#FAF8F4] border border-[#E5DDD0] flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-[#181A17] text-[#C4B38E] flex items-center justify-center font-bold text-xs shrink-0">3</span>
                    <span className="text-xs font-semibold text-[#181A17]">{isEn ? 'Quote & Instant QR' : 'Báo giá & VietQR'}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-start md:items-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => router.push('/customer/requests/new')}
                  className="px-5 py-2.5 rounded-xl bg-[#181A17] hover:bg-[#2A2D27] text-[#FBF9F5] text-xs font-bold inline-flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  <Plus size={15} className="text-[#C4B38E]" aria-hidden="true" />
                  <span>{isEn ? 'Book Transport Now' : 'Tạo đơn vận chuyển ngay'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. OPERATIONAL GRID */}
      {(() => {
        const showOrdersPanel = historyOrders.length > 0;

        const stableCard = (
          <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 bg-white border-b border-[#EFEAE0] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#181A17] m-0">{isEn ? 'My Racehorses' : 'Chiến mã của bạn'}</h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#FAF8F4] text-[#181A17] border border-[#E5DDD0]">
                  {horses.length}
                </span>
              </div>
              <Link href="/customer/horses" className="text-xs font-bold text-[#A67C2E] hover:underline inline-flex items-center gap-1">
                <span>{t('common.viewAll', 'Tất cả')}</span>
                <ChevronRight size={13} aria-hidden="true" />
              </Link>
            </div>

            {showcaseHorses.length > 0 ? (
              <div className="divide-y divide-[#EFEAE0]">
                {showcaseHorses.map((horse: Horse) => {
                  const isTransit = horse.availabilityStatus === 'In Transit' || horse.status === 'in_transit';
                  const imgSrc = getFullPhotoUrl(horse.photoUrl) || FALLBACK_HORSE_PHOTO;
                  return (
                    <Link
                      key={horse.id}
                      href={`/customer/horses/${horse.id}`}
                      className="p-3.5 flex items-center justify-between gap-3 hover:bg-[#FAF8F4] transition-colors no-underline"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl overflow-hidden border border-[#E5DDD0] shrink-0 bg-[#FAF8F4]">
                          <img
                            src={imgSrc}
                            alt={horse.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = FALLBACK_HORSE_PHOTO;
                            }}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-[#181A17] truncate">{horse.name}</div>
                          <div className="text-[11px] text-[#5F6977] truncate">
                            {translateBreed(horse.breed)}
                            {horse.age && horse.age > 0 ? ` • ${horse.age} ${isEn ? 'yrs' : 'tuổi'}` : ''}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                          isTransit
                            ? 'bg-[#FAF8F4] text-[#A67C2E] border-[#D4C5A3]'
                            : 'bg-[#E8F2EB] text-[#287653] border-[#B7DBC4]'
                        }`}
                      >
                        {isTransit ? (isEn ? 'In Transit' : 'Đang vận chuyển') : isEn ? 'Ready' : 'Sẵn sàng'}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-[#5F6977]">
                <p className="m-0 mb-3">{isEn ? 'No racehorses registered yet.' : 'Chưa có chiến mã trong danh sách.'}</p>
                <Link
                  href="/customer/horses"
                  className="px-3.5 py-1.5 rounded-lg border border-[#D8CEBE] bg-white hover:bg-[#FAF8F4] text-[#181A17] font-bold inline-flex items-center gap-1"
                >
                  <Plus size={13} aria-hidden="true" />
                  <span>{isEn ? 'Register Horse' : 'Đăng ký ngựa'}</span>
                </Link>
              </div>
            )}
          </div>
        );

        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {showOrdersPanel && (
              <div className="lg:col-span-7 flex flex-col gap-5">
                <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-sm">
                  <div className="px-5 py-3.5 bg-white border-b border-[#EFEAE0] flex items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-[#181A17] m-0">
                      {isEn ? 'Recent Order History' : 'Lịch sử đơn vận chuyển'}
                    </h2>
                    <Link href="/customer/requests" className="text-xs font-bold text-[#A67C2E] hover:underline inline-flex items-center gap-1">
                      <span>{t('common.viewAll', 'Xem tất cả')}</span>
                      <ChevronRight size={13} aria-hidden="true" />
                    </Link>
                  </div>

                  <div className="divide-y divide-[#EFEAE0]">
                    {historyOrders.slice(0, 4).map((req) => {
                      const code = req.customerRequestCode || req.requestCode || `REQ-${String(req.id).padStart(3, '0')}`;
                      const orig = req.originLocation?.split(',')?.[0]?.trim() || (isEn ? 'Origin' : 'Điểm đón');
                      const dest = req.destinationLocation?.split(',')?.[0]?.trim() || (isEn ? 'Destination' : 'Điểm giao');
                      return (
                        <Link
                          key={req.id}
                          href={`/customer/requests/${req.id}`}
                          className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-[#FAF8F4] transition-colors no-underline"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-[#FAF8F4] border border-[#E5DDD0] flex items-center justify-center text-[#A67C2E] shrink-0">
                              <FileText size={15} aria-hidden="true" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-[#181A17] font-mono">{code}</div>
                              <div className="text-[11.5px] text-[#5F6977] truncate">
                                {orig} → {dest} ·{' '}
                                {req.requestedDate
                                  ? new Date(req.requestedDate).toLocaleDateString('vi-VN')
                                  : '—'}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <StatusBadge label={translateStatus(req.status)} variant={getOrderBadgeVariant(req.status)} />
                            <ChevronRight size={14} className="text-[#747D88]" aria-hidden="true" />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className={showOrdersPanel ? 'lg:col-span-5' : 'lg:col-span-12'}>
              {stableCard}
            </div>
          </div>
        );
      })()}

      {/* Modals */}
      <DocumentUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => {
          setIsUploadModalOpen(false);
          setActiveRequestForUpload('');
        }}
        onSuccess={handleDocumentUploadSuccess}
      />

      {payModalOrder && (
        <SepayPaymentModal
          isOpen={Boolean(payModalOrder)}
          shipmentId={payModalOrder.id}
          requestCode={payModalOrder.requestCode}
          amount={payModalOrder.totalCost}
          paymentDueAt={payModalOrder.paymentDueAt}
          createdAt={payModalOrder.createdAt}
          onClose={() => setPayModalOrder(null)}
          onPaid={() => {
            void loadData();
            void refreshRequests();
            window.dispatchEvent(new CustomEvent('customer-orders-updated'));
          }}
        />
      )}
    </div>
  );
}
