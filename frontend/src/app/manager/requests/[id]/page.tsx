'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Truck,
  FileText,
  Download,
  ShieldCheck,
  AlertCircle,
  Check,
  ChevronRight,
  RefreshCw,
  User,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  ArrowRight,
  Route as RouteIcon,
  Radio,
  FileCheck2,
  Eye,
  ExternalLink,
} from 'lucide-react';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { ManagerSectionTabs } from '@/components/layout/ManagerSectionTabs';
import { getShipmentStatusMeta } from '@/features/orders/shipment-status';
import { DocumentReviewModal } from '@/features/documents/components/DocumentReviewModal';
import { ReservedVehiclesPanel } from '@/features/fleet/components/ReservedVehiclesPanel';
import { routesApi, RouteDetail } from '@/features/routes/api/routes.api';
import { trackingApi } from '@/features/tracking/api/tracking.api';
import { VerticalTimeline, buildTimeline } from '@/features/tracking/timeline';
import { InsuranceSummary } from '@/features/orders/components/InsuranceSummary';
import { SnapshotBreakdown } from '@/features/orders/components/SnapshotBreakdown';
import {
  BookingQuoteSummary,
  BookingSummary,
  ManagerFreightSuggestionCard,
} from '@/features/orders/components/BookingSummary';
import { ManagerOrderFinanceGovernanceCard } from '@/features/orders/components/ManagerOrderFinanceGovernanceCard';
import { DeliveryHandoverPanel } from '@/features/tracking/components/DeliveryHandoverPanel';
import { RoundTripPanel } from '@/features/orders/components/RoundTripPanel';
import {
  bookingQuotePayload,
  suggestManagerFreightQuote,
} from '@/features/orders/booking-policy';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { buildEquineRoute } from '@/lib/geo-corridors';

const fetcher = (url: string) => apiClient<any>(url);

interface StatusMeta {
  vi: string;
  en: string;
  bg: string;
  color: string;
  border: string;
}

const STATUS_CONFIG: Record<string, StatusMeta> = {
  requested: { vi: 'Chờ duyệt', en: 'Pending Approval', bg: '#F8F0DF', color: '#966516', border: '#DFCA9A' },
  awaiting_payment: { vi: 'Chờ thanh toán', en: 'Awaiting Payment', bg: '#F8F0DF', color: '#966516', border: '#DFCA9A' },
  paid_pending_review: { vi: 'Đã thanh toán, chờ duyệt khả thi', en: 'Paid - Pending Review', bg: '#E8F2EB', color: '#287653', border: '#B7DBC4' },
  refund_requested: { vi: 'Chờ hoàn tiền 100%', en: 'Refund Requested', bg: '#F8EAEA', color: '#B33E3E', border: '#E5B8B8' },
  refunded: { vi: 'Đã hoàn tiền', en: 'Refunded', bg: '#F0EEE8', color: '#5C6658', border: '#D8CEBE' },
  under_review: { vi: 'Đang thẩm định', en: 'Under Review', bg: '#FAF8F4', color: '#242722', border: '#D4C5A3' },
  change_requested: { vi: 'Yêu cầu chỉnh sửa', en: 'Change Requested', bg: '#F8F0DF', color: '#966516', border: '#DFCA9A' },
  approved: { vi: 'Đã duyệt báo giá', en: 'Approved / Quoted', bg: '#E8F2EB', color: '#287653', border: '#B7DBC4' },
  rejected: { vi: 'Đã từ chối', en: 'Rejected', bg: '#F8EAEA', color: '#B33E3E', border: '#E5B8B8' },
  planning: { vi: 'Đang lập kế hoạch', en: 'Route Planning', bg: '#FAF8F4', color: '#A67C2E', border: '#D4C5A3' },
  confirmed: { vi: 'Đã xác nhận chuyến', en: 'Trip Confirmed', bg: '#FAF8F4', color: '#181A17', border: '#D4C5A3' },
  ready_to_depart: { vi: 'Sẵn sàng xuất phát', en: 'Ready to Depart', bg: '#E8F2EB', color: '#287653', border: '#B7DBC4' },
  in_transit: { vi: 'Đang vận chuyển', en: 'In Transit', bg: '#FAF8F4', color: '#A67C2E', border: '#C4B38E' },
  return_pending: { vi: 'Chờ chặng về', en: 'Return Pending', bg: '#F8F0DF', color: '#966516', border: '#DFCA9A' },
  completed: { vi: 'Đã hoàn thành', en: 'Completed', bg: '#E8F2EB', color: '#287653', border: '#B7DBC4' },
  delivered: { vi: 'Đã hoàn thành', en: 'Delivered', bg: '#E8F2EB', color: '#287653', border: '#B7DBC4' },
  cancelled: { vi: 'Đã hủy', en: 'Cancelled', bg: '#F0EEE8', color: '#5C6658', border: '#D8CEBE' },
  cancelled_operational: { vi: 'Đã hủy vận hành', en: 'Cancelled (Operational)', bg: '#F8EAEA', color: '#B33E3E', border: '#E5B8B8' },
};

function formatCurrencyVND(amount: number, unquotedLabel = 'Chưa định giá') {
  if (!amount || amount === 0) return unquotedLabel;
  return amount.toLocaleString('vi-VN') + ' ₫';
}

function formatUSD(amount: number) {
  if (!amount || amount === 0) return '$0.00 USD';
  const usd = Math.round((amount / 25400) * 100) / 100;
  return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}

function formatDate(iso: string | null | undefined, locale = 'vi-VN') {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export default function ManagerRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const locale = isEn ? 'en-GB' : 'vi-VN';
  const requestId = params?.id as string;

  // Modals state
  const [activeModal, setActiveModal] = useState<'NONE' | 'APPROVE' | 'REJECT' | 'CHANGE'>('NONE');
  const [inputValue, setInputValue] = useState('');
  const [costCurrency, setCostCurrency] = useState<'VND' | 'USD'>('VND');
  const [selectedTransportMode, setSelectedTransportMode] = useState<'road' | 'air' | 'sea'>('road');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Feasibility review modal state
  const [feasibilityModal, setFeasibilityModal] = useState<'NONE' | 'APPROVE' | 'CANNOT_FULFIL'>('NONE');
  const [cannotFulfilReason, setCannotFulfilReason] = useState<string>('no_vehicle_available');
  const [cannotFulfilNote, setCannotFulfilNote] = useState<string>('');
  const [feasibilitySubmitting, setFeasibilitySubmitting] = useState(false);

  // Lifecycle workspace tab
  const [activeTab, setActiveTab] = useState<'overview' | 'compliance' | 'route' | 'tracking'>('overview');
  const [reviewDoc, setReviewDoc] = useState<{
    id: string;
    numericDocId: number;
    horseName: string;
    docTitle: string;
    fileUrl?: string;
    microchip?: string | null;
    passport?: string | null;
    expiryDate?: string | null;
  } | null>(null);

  // Fetch order details
  const {
    data: order,
    isLoading: loadingOrder,
    error: orderError,
    mutate: mutateOrder,
  } = useSWR(requestId ? `/orders/${requestId}` : null, fetcher, {
    revalidateOnFocus: true,
  });

  // Fetch compliance checklist
  const { data: checklist, mutate: mutateChecklist } = useSWR(
    requestId ? `/documents/order/${requestId}/checklist` : null,
    fetcher,
    { revalidateOnFocus: true }
  );

  // Fetch route plan for Route & Fleet tab
  const numericOrderId = Number(requestId);
  const { data: routePlan } = useSWR<RouteDetail | null>(
    Number.isFinite(numericOrderId) && numericOrderId > 0
      ? `route-detail-${numericOrderId}`
      : null,
    () => routesApi.findRouteByShipmentId(numericOrderId).catch(() => null),
    { revalidateOnFocus: false }
  );

  // Fetch timeline for Tracking & Handover tab
  const { data: timelineData } = useSWR(
    activeTab === 'tracking' && Number.isFinite(numericOrderId) && numericOrderId > 0
      ? `shipment-timeline-${numericOrderId}`
      : null,
    () => trackingApi.getShipmentTimeline(numericOrderId).catch(() => null),
    { revalidateOnFocus: false }
  );
  const timelineItems = React.useMemo(
    () => (timelineData ? buildTimeline({ timelineData, viewer: 'manager' }) : []),
    [timelineData]
  );

  // Fetch SePay payment info
  const { data: paymentInfo } = useSWR(
    requestId ? `/orders/${requestId}/payments/sepay` : null,
    fetcher,
    { revalidateOnFocus: true }
  );

  // Fetch server insurance policy for live USD/VND rate
  const { data: insurancePolicy } = useSWR('/orders/insurance-policy', fetcher);
  const usdToVndRate = Number(insurancePolicy?.usdToVnd) > 0 ? Number(insurancePolicy.usdToVnd) : 25400;

  const statusKey = String(order?.status || 'requested').toLowerCase();
  const statusMeta = STATUS_CONFIG[statusKey] || getShipmentStatusMeta(statusKey);
  const statusLabel = isEn ? statusMeta.en : statusMeta.vi;

  // Determine transportation type
  const rawType = String(order?.transportationType || order?.transportType || '').toLowerCase();
  const specialReqLower = String(order?.specialRequirements || '').toLowerCase();
  let isDomestic = false;
  if (rawType === 'domestic' || rawType.includes('nội địa')) {
    isDomestic = true;
  } else if (rawType === 'international' || rawType.includes('quốc tế')) {
    isDomestic = false;
  } else if (specialReqLower.includes('nội địa') || specialReqLower.includes('domestic')) {
    isDomestic = true;
  } else if (specialReqLower.includes('quốc tế') || specialReqLower.includes('international')) {
    isDomestic = false;
  } else {
    const dest = String(order?.destinationLocation || '').toLowerCase();
    isDomestic =
      dest.includes('vietnam') ||
      dest.includes('việt nam') ||
      dest.includes('đà nẵng') ||
      dest.includes('hà nội') ||
      dest.includes('hồ chí minh');
  }

  const transportationTypeLabel = isDomestic
    ? t('manager.detail.typeDomestic', 'Nội địa (Domestic)')
    : t('manager.detail.typeInternational', 'Quốc tế (International)');

  const effectiveMode: 'road' | 'air' | 'sea' =
    order?.transportMode === 'road' || order?.transportMode === 'air' || order?.transportMode === 'sea'
      ? order.transportMode
      : specialReqLower.includes('đường thủy') || specialReqLower.includes('tàu biển') || specialReqLower.includes('sea')
      ? 'sea'
      : specialReqLower.includes('hàng không') || specialReqLower.includes('air')
      ? 'air'
      : 'road';

  // Calculate route metrics
  const routeMetrics = React.useMemo(() => {
    if (!order?.originLocation || !order?.destinationLocation) {
      return { distanceKm: 650, durationHours: 12, mode: 'road' };
    }
    const mode = activeModal === 'APPROVE' ? selectedTransportMode : effectiveMode;
    return buildEquineRoute(order.originLocation, order.destinationLocation, mode);
  }, [order?.originLocation, order?.destinationLocation, activeModal, selectedTransportMode, effectiveMode]);

  const applyModeAndSuggestedQuote = (mode: 'road' | 'air' | 'sea', forceRecalculate = false) => {
    setSelectedTransportMode(mode);
    const metrics =
      order?.originLocation && order?.destinationLocation
        ? buildEquineRoute(order.originLocation, order.destinationLocation, mode)
        : { distanceKm: 650, durationHours: 12, customsCount: 1, mode };
    const count = Number(order?.requestedHorseCount ?? 1);
    const suggestion = suggestManagerFreightQuote({
      transportMode: mode,
      bookingType: order?.bookingType ?? 'dedicated_charter',
      horseCount: count,
      distanceKm: metrics.distanceKm,
      customsCount: (metrics as any).customsCount ?? (isDomestic ? 1 : 2),
      usdToVndRate,
    });

    if (!forceRecalculate) {
      const existingSaved =
        order?.bookingType === 'dedicated_charter'
          ? Number(order?.transportCost || 0)
          : Number(order?.stallUnitPrice || 0);
      if (existingSaved > 0) {
        setInputValue(
          String(
            costCurrency === 'USD'
              ? Math.round((existingSaved / usdToVndRate) * 100) / 100
              : existingSaved
          )
        );
        return;
      }
    }

    setInputValue(
      String(costCurrency === 'USD' ? suggestion.suggestedInputUsd : suggestion.suggestedInputVnd)
    );
  };

  // Open modal handler
  const handleOpenModal = (type: 'APPROVE' | 'REJECT' | 'CHANGE') => {
    setActiveModal(type);
    if (type === 'APPROVE') {
      const mode: 'road' | 'air' | 'sea' =
        order?.transportMode === 'road' || order?.transportMode === 'air' || order?.transportMode === 'sea'
          ? order.transportMode
          : specialReqLower.includes('đường thủy') || specialReqLower.includes('tàu biển') || specialReqLower.includes('sea')
            ? 'sea'
            : isDomestic && !specialReqLower.includes('hàng không')
              ? 'road'
              : 'air';
      setCostCurrency('VND');
      setSelectedTransportMode(mode);
      const metrics =
        order?.originLocation && order?.destinationLocation
          ? buildEquineRoute(order.originLocation, order.destinationLocation, mode)
          : { distanceKm: 650, durationHours: 12, customsCount: 1, mode };
      const count = Number(order?.requestedHorseCount ?? 1);
      const suggestion = suggestManagerFreightQuote({
        transportMode: mode,
        bookingType: order?.bookingType ?? 'dedicated_charter',
        horseCount: count,
        distanceKm: metrics.distanceKm,
        customsCount: (metrics as any).customsCount ?? (isDomestic ? 1 : 2),
        usdToVndRate,
      });
      const existingSaved =
        order?.bookingType === 'dedicated_charter'
          ? Number(order?.transportCost || 0)
          : Number(order?.stallUnitPrice || 0);
      setInputValue(String(existingSaved > 0 ? existingSaved : suggestion.suggestedInputVnd));
    } else {
      setInputValue('');
    }
  };

  const handleQuoteCurrency = (currency: 'VND' | 'USD') => {
    if (currency === costCurrency) return;
    const value = Number(inputValue);
    if (Number.isFinite(value) && value > 0) {
      setInputValue(
        String(
          currency === 'VND'
            ? Math.round(value * usdToVndRate)
            : Math.round((value / usdToVndRate) * 100) / 100
        )
      );
    }
    setCostCurrency(currency);
  };

  const handleConfirmAction = async () => {
    if (!order || isSubmitting) return;
    setIsSubmitting(true);

    try {
      if (activeModal === 'APPROVE') {
        const hasQuote = Boolean(order.quoteId);
        let payload: any = {
          transportMode: selectedTransportMode,
        };
        if (!hasQuote) {
          const costNum = parseFloat(inputValue);
          if (isNaN(costNum) || costNum <= 0) {
            toast.error(
              t('manager.requests.toastValidPrice', 'Vui lòng nhập chi phí vận chuyển hợp lệ (> 0)')
            );
            setIsSubmitting(false);
            return;
          }
          payload = {
            ...bookingQuotePayload(
              inputValue,
              order.bookingType ?? 'dedicated_charter',
              Number(order.requestedHorseCount ?? 1),
              costCurrency,
              usdToVndRate
            ),
            transportMode: selectedTransportMode,
          };
        }
        const approved = await apiClient<{ totalCost: number }>(`/orders/${order.id}/approve`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });

        toast.success(
          isEn
            ? `Approved order #${order.id} with total quote ${approved.totalCost.toLocaleString('vi-VN')} ₫ (incl. insurance)`
            : `Đã phê duyệt đơn vận chuyển #${order.id} với tổng báo giá ${approved.totalCost.toLocaleString('vi-VN')} ₫ (gồm bảo hiểm)`
        );
      } else if (activeModal === 'REJECT') {
        const trimmed = inputValue.trim();
        if (trimmed.length < 5) {
          toast.error(
            t('manager.requests.toastRejectMinChars', 'Lý do từ chối phải có ít nhất 5 ký tự')
          );
          setIsSubmitting(false);
          return;
        }

        await apiClient(`/orders/${order.id}/reject`, {
          method: 'PATCH',
          body: JSON.stringify({ reason: trimmed }),
        });

        toast.success(
          isEn ? `Rejected order #${order.id}` : `Đã từ chối đơn #${order.id}`
        );
      } else if (activeModal === 'CHANGE') {
        const trimmedReason = inputValue.trim();
        if (trimmedReason.length < 5) {
          toast.error(
            t(
              'manager.requests.toastChangeMinChars',
              'Vui lòng nhập yêu cầu chỉnh sửa (tối thiểu 5 ký tự)'
            )
          );
          setIsSubmitting(false);
          return;
        }

        await apiClient(`/orders/${order.id}/request-changes`, {
          method: 'PATCH',
          body: JSON.stringify({ reason: trimmedReason }),
        });

        toast.success(
          isEn
            ? 'Sent revision request to customer'
            : 'Đã gửi yêu cầu chỉnh sửa đến khách hàng'
        );
      }

      setActiveModal('NONE');
      mutateOrder();
    } catch (err: any) {
      toast.error(err?.message || t('common.actionFailed', 'Thao tác thất bại'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFeasibilitySubmit = async (decision: 'approve' | 'cannot_fulfil') => {
    if (!order || feasibilitySubmitting) return;
    if (decision === 'cannot_fulfil') {
      if (!cannotFulfilReason) {
        toast.error(isEn ? 'Please select a reason' : 'Vui lòng chọn lý do không thể đáp ứng');
        return;
      }
      if (cannotFulfilNote.trim().length < 10) {
        toast.error(isEn ? 'Note must be at least 10 characters' : 'Ghi chú giải trình phải có ít nhất 10 ký tự');
        return;
      }
    }
    setFeasibilitySubmitting(true);
    try {
      const payload = decision === 'approve'
        ? { decision: 'approve' }
        : { decision: 'cannot_fulfil', reasonCode: cannotFulfilReason, note: cannotFulfilNote.trim() };
      await apiClient(`/orders/${order.id}/feasibility`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      toast.success(
        decision === 'approve'
          ? (isEn ? 'Order feasibility approved! Transferred to route planning.' : 'Đã duyệt khả thi đơn hàng thành công! Sẵn sàng lập tuyến.')
          : (isEn ? 'Marked order as cannot fulfil. Transferred to 100% refund.' : 'Đã xác nhận không đáp ứng được đơn. Đã chuyển sang luồng hoàn tiền 100%.')
      );
      setFeasibilityModal('NONE');
      setCannotFulfilNote('');
      mutateOrder();
    } catch (err: any) {
      toast.error(err?.message || (isEn ? 'Failed to submit feasibility review' : 'Thao tác thẩm định thất bại'));
    } finally {
      setFeasibilitySubmitting(false);
    }
  };

  const handleExportPDF = () => {
    window.print();
  };

  if (loadingOrder) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <RefreshCw size={28} className="animate-spin text-[#A67C2E]" />
        <p className="text-sm font-semibold text-[#5C6658]">
          {t('manager.detail.loadingOrder', `Đang tải thông tin chi tiết đơn hàng #${requestId}...`, {
            id: requestId,
          })}
        </p>
      </div>
    );
  }

  if (orderError || !order) {
    return (
      <div
        role="alert"
        className="bg-white rounded-2xl border border-rose-200 p-8 text-center max-w-lg mx-auto mt-12 shadow-sm"
      >
        <AlertCircle size={40} className="text-[#B33E3E] mx-auto mb-3" />
        <h1 className="text-lg font-bold text-[#181A17] mb-1">
          {t('manager.detail.notFoundTitle', 'Không tìm thấy đơn vận chuyển')}
        </h1>
        <p className="text-sm text-[#5C6658] mb-6">
          {t(
            'manager.detail.notFoundDesc',
            `Đơn vận chuyển #${requestId} không tồn tại hoặc không thể tải dữ liệu lúc này.`,
            { id: requestId }
          )}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button type="button" variant="outline" onClick={() => mutateOrder()}>
            <RefreshCw size={14} /> {t('common.retry', 'Thử lại')}
          </Button>
          <Button type="button" variant="primary" onClick={() => router.push('/manager/requests')}>
            {t('manager.detail.backToRequests', 'Quay lại danh sách đơn hàng')}
          </Button>
        </div>
      </div>
    );
  }

  const requestCode = order.requestCode || `REQ-${String(order.id).padStart(3, '0')}`;
  const totalCost = Number(order.totalCost || 0);
  const isPaid = paymentInfo?.payment?.status === 'succeeded';
  const paidAt = paymentInfo?.payment?.paidAt;

  // Stepper calculations
  const steps = [
    {
      title: t('manager.detail.step1Title', 'Tạo yêu cầu'),
      desc: t('manager.detail.step1Desc', 'Khách hàng gửi đơn'),
      done: true,
    },
    {
      title: t('manager.detail.step2Title', 'Phê duyệt báo giá'),
      desc: t('manager.detail.step2Desc', 'Quản lý duyệt đơn'),
      done: !['requested', 'change_requested', 'rejected', 'cancelled'].includes(statusKey),
    },
    {
      title: t('manager.detail.step3Title', 'Hồ sơ kiểm dịch'),
      desc: t('manager.detail.step3Desc', 'Thẩm định giấy tờ'),
      done: Boolean(checklist?.isFullyCompliant),
    },
    {
      title: t('manager.detail.step4Title', 'Lập tuyến xe'),
      desc: t('manager.detail.step4Desc', 'Điều phối & Phân xe'),
      done: ['confirmed', 'ready_to_depart', 'in_transit', 'return_pending', 'completed', 'delivered'].includes(statusKey),
    },
    {
      title: t('manager.detail.step5Title', 'Hoàn tất bàn giao'),
      desc: t('manager.detail.step5Desc', 'Giao ngựa an toàn'),
      done: ['completed', 'delivered'].includes(statusKey),
    },
  ];

  const compliancePct = checklist?.totalRequiredDocuments
    ? Math.min(
        100,
        Math.round(((checklist?.approvedDocumentsCount || 0) / checklist.totalRequiredDocuments) * 100)
      )
    : 0;

  const customerDisplayName = order.contactName || order.customerName || '';
  const customerInitial = (customerDisplayName || 'K')[0].toUpperCase();

  return (
    <div className="flex flex-col gap-6 pb-20 max-w-7xl mx-auto">
      {/* Top Navigation & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/manager/requests"
            aria-label={t('common.back', 'Quay lại danh sách yêu cầu')}
            className="w-10 h-10 rounded-xl bg-white border border-[#D8CEBE] flex items-center justify-center text-[#5C6658] hover:text-[#181A17] hover:bg-[#FAF9F5] transition-colors shadow-sm shrink-0 no-underline"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-extrabold text-[#181A17] tracking-tight m-0">
                  {requestCode}
                </h1>
                <span
                  className="px-3 py-1 rounded-full text-xs font-bold border"
                  style={{
                    backgroundColor: statusMeta.bg,
                    color: statusMeta.color,
                    borderColor: statusMeta.border,
                  }}
                >
                  {statusLabel}
                </span>
              </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href={`/manager/requests/${order.id}/invoice`}
            className="no-underline px-3 py-1.5 rounded-lg border border-[#D8CEBE] bg-white hover:bg-[#FAF8F4] text-[#181A17] text-xs font-bold shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <FileText size={14} className="text-[#A67C2E]" />
            <span>{isEn ? 'View E-Invoice' : 'Xem Hóa Đơn'}</span>
          </Link>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 text-xs font-bold"
          >
            <Download size={14} />
            <span>{t('manager.detail.exportPdf', 'Xuất PDF')}</span>
          </Button>

          {statusKey === 'paid_pending_review' && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFeasibilityModal('CANNOT_FULFIL')}
                className="text-[#B33E3E] border-[#E5B8B8] hover:bg-[#F8EAEA] text-xs font-bold"
              >
                {isEn ? 'Cannot Fulfil' : 'Không đáp ứng được'}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setFeasibilityModal('APPROVE')}
                className="bg-[#287653] hover:bg-[#1f5e42] text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
              >
                <Check size={15} />
                <span>{isEn ? 'Approve Feasibility' : 'Duyệt khả thi'}</span>
              </Button>
            </>
          )}

          {statusKey === 'requested' && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenModal('REJECT')}
                className="text-[#B33E3E] border-[#E5B8B8] hover:bg-[#F8EAEA] text-xs font-bold"
              >
                {t('manager.requests.reject', 'Từ chối')}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => handleOpenModal('APPROVE')}
                className="bg-[#287653] hover:bg-[#1f5e42] text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
              >
                <Check size={15} />
                <span>{t('manager.requests.btnApprove', 'Phê duyệt')}</span>
              </Button>
            </>
          )}

          {statusKey === 'approved' && (
            <Link
              href="/manager/planning"
              className="no-underline px-3.5 py-2 rounded-lg bg-[#181A17] hover:bg-[#242722] text-white text-xs font-bold shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Truck size={14} />
              <span>{t('manager.detail.goPlanning', 'Chuyển sang Lập tuyến')}</span>
            </Link>
          )}
        </div>
      </div>

      {/* 5-Step Process Timeline */}
      <div className="bg-white p-5 rounded-2xl border border-[#D8CEBE] shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {steps.map((st, i) => (
            <div key={i} className="flex flex-col gap-1.5 relative">
              <div className="flex items-center gap-2">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    st.done
                      ? 'bg-[#287653] text-white'
                      : 'bg-[#F0EEE8] text-[#7E867B] border border-[#D8CEBE]'
                  }`}
                >
                  {st.done ? <Check size={13} /> : i + 1}
                </div>
                <div className={`h-1 flex-1 rounded-full ${st.done ? 'bg-[#287653]' : 'bg-[#EAE5DA]'}`} />
              </div>
              <p className={`text-xs font-bold m-0 ${st.done ? 'text-[#181A17]' : 'text-[#7E867B]'}`}>
                {st.title}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Unified Lifecycle Workspace Tabs */}
      <ManagerSectionTabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as 'overview' | 'compliance' | 'route' | 'tracking')}
        ariaLabel={isEn ? 'Order lifecycle workspace' : 'Khu vực xử lý vòng đời đơn hàng'}
        tabs={[
          {
            key: 'overview',
            label: isEn ? 'Overview & Feasibility' : 'Tổng quan & Khả thi',
            icon: <FileText size={14} />,
          },
          {
            key: 'compliance',
            label: isEn ? 'Compliance & Docs' : 'Hồ sơ & Kiểm dịch',
            icon: <FileCheck2 size={14} />,
            badge:
              checklist?.totalRequiredDocuments !== undefined
                ? `${checklist?.approvedDocumentsCount || 0}/${checklist.totalRequiredDocuments}`
                : undefined,
            badgeTone: checklist?.isFullyCompliant ? 'success' : 'amber',
          },
          {
            key: 'route',
            label: isEn ? 'Route & Vehicles' : 'Lộ trình & Phương tiện',
            icon: <RouteIcon size={14} />,
            badge: routePlan?.legs?.length ? `${routePlan.legs.length} chặng` : undefined,
          },
          {
            key: 'tracking',
            label: isEn ? 'Tracking & Handover' : 'Theo dõi & Bàn giao',
            icon: <Radio size={14} />,
          },
        ]}
      />

      {activeTab === 'compliance' && (
        <div className="bg-white rounded-2xl border border-[#D8CEBE] shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[#EAE5DA] flex flex-wrap items-center justify-between gap-3 bg-[#FAF9F5]">
            <div>
              <h2 className="text-base font-extrabold text-[#181A17] m-0 flex items-center gap-2">
                <ShieldCheck size={18} className="text-[#A67C2E]" />
                {isEn ? 'Order Quarantine & Legal Checklist' : 'Kiểm duyệt Hồ sơ Pháp lý & Kiểm dịch của Đơn'}
              </h2>
              <p className="text-xs text-[#5C6658] mt-0.5 mb-0">
                {isEn
                  ? 'Review submitted documents directly here without leaving this order.'
                  : 'Thẩm định trực tiếp từng giấy tờ của các cá thể ngựa trong đơn mà không cần chuyển trang.'}
              </p>
            </div>
            <Link
              href="/manager/compliance/orders"
              className="no-underline inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D8CEBE] bg-white hover:bg-[#FAF8F4] text-xs font-bold text-[#181A17] whitespace-nowrap"
            >
              <span>{isEn ? 'Open Compliance Hub' : 'Mở Trung tâm Kiểm dịch'}</span>
              <ExternalLink size={13} />
            </Link>
          </div>

          <div className="p-6 space-y-5">
            {!checklist || !Array.isArray(checklist.horses) || checklist.horses.length === 0 ? (
              <div className="text-center py-10 text-sm text-[#5C6658] bg-[#FAF9F5] rounded-xl border border-dashed border-[#D8CEBE]">
                {isEn ? 'No compliance requirements generated for this order yet.' : 'Chưa có danh mục giấy tờ kiểm dịch cho đơn hàng này.'}
              </div>
            ) : (
              checklist.horses.map((horse: any) => (
                <div key={horse.horseId} className="rounded-xl border border-[#D8CEBE] overflow-hidden">
                  <div className="px-4 py-3 bg-[#FAF8F4] border-b border-[#EAE5DA] flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-[#181A17]">🏇 {horse.horseName}</span>
                      {horse.microchipNo && (
                        <span className="text-[11px] font-mono text-[#5C6658] bg-white px-2 py-0.5 rounded border border-[#E5DDD0]">
                          Chip: {horse.microchipNo}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                        horse.isCompliant
                          ? 'bg-[#E8F2EB] text-[#287653] border-[#B7DBC4]'
                          : 'bg-[#F8F0DF] text-[#966516] border-[#DFCA9A]'
                      }`}
                    >
                      {horse.isCompliant
                        ? isEn ? 'Compliant' : 'Đủ hồ sơ'
                        : isEn ? 'Action needed' : 'Cần xử lý'}
                    </span>
                  </div>

                  <div className="p-4 space-y-2.5">
                    {Array.from(
                      new Map(
                        (horse.documents || []).map((d: any) => [String(d.id ?? `${d.regulationId}-${d.docType}`), d]),
                      ).values(),
                    ).map((doc: any, docIdx: number) => {
                      const st = String(doc.status || '').toLowerCase();
                      return (
                        <div
                          key={`${doc.id}-${doc.regulationId ?? 'none'}-${docIdx}`}
                          className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-[#EAE5DA] bg-white"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-[#181A17] m-0">
                              {doc.regulationTitle || doc.regulationDocType || doc.docType}
                            </p>
                            <p className="text-xs text-[#5C6658] mt-0.5 mb-0">
                              {doc.expiryDate
                                ? `${isEn ? 'Expires:' : 'Hết hạn:'} ${formatDate(doc.expiryDate, locale)}`
                                : isEn ? 'No expiry date' : 'Chưa cập nhật hạn dùng'}
                              {doc.reviewerNotes ? ` · ${doc.reviewerNotes}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${
                                st === 'approved'
                                  ? 'bg-[#E8F2EB] text-[#287653] border-[#B7DBC4]'
                                  : st === 'rejected' || st === 'expired'
                                  ? 'bg-[#F8EAEA] text-[#B33E3E] border-[#E5B8B8]'
                                  : 'bg-[#F8F0DF] text-[#966516] border-[#DFCA9A]'
                              }`}
                            >
                              {st === 'approved'
                                ? isEn ? 'Approved' : 'Đã duyệt'
                                : st === 'rejected'
                                ? isEn ? 'Rejected' : 'Từ chối'
                                : st === 'expired'
                                ? isEn ? 'Expired' : 'Hết hạn'
                                : isEn ? 'Pending review' : 'Chờ thẩm định'}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setReviewDoc({
                                  id: `DOC-${doc.id}`,
                                  numericDocId: Number(doc.id),
                                  horseName: horse.horseName,
                                  docTitle: doc.regulationTitle || doc.regulationDocType || doc.docType || 'Document',
                                  fileUrl: doc.fileUrl,
                                  microchip: horse.microchipNo,
                                  passport: horse.passportNo,
                                  expiryDate: doc.expiryDate ?? null,
                                })
                              }
                            >
                              <Eye size={13} />
                              {isEn ? 'Inspect' : 'Thẩm định'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}

                    {(horse.missingRegulations || []).map((reg: any, idx: number) => {
                      const deferredMatch = Array.isArray((order as any).deferredDocuments)
                        ? (order as any).deferredDocuments.find(
                            (d: any) =>
                              Number(d.horseId) === Number(horse.horseId) &&
                              String(d.documentTypeCode || '').toLowerCase() ===
                                String(reg.documentType || '').toLowerCase(),
                          )
                        : null;
                      const todayIct = new Intl.DateTimeFormat('en-CA', {
                        timeZone: 'Asia/Ho_Chi_Minh',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                      }).format(new Date());
                      const isOverdue = Boolean(
                        deferredMatch?.submitDeadline &&
                          String(deferredMatch.submitDeadline).slice(0, 10) < todayIct,
                      );
                      return (
                      <div
                        key={`${reg.id}-${idx}`}
                        className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-dashed border-[#E5B8B8] bg-[#FDF6F6]"
                      >
                        <div>
                          <p className="text-sm font-bold text-[#B33E3E] m-0">
                            {reg.description || reg.documentType}
                          </p>
                          <p className="text-xs text-[#9E3B3B] mt-0.5 mb-0">
                            {deferredMatch
                              ? isEn
                                ? `Customer marked "Submit later" (Due: ${deferredMatch.submitDeadline || 'before departure'})`
                                : `Khách chọn "Nộp sau" (Hạn nộp: ${deferredMatch.submitDeadline || 'trước xuất phát'})`
                              : isEn
                                ? 'Missing required regulation document'
                                : 'Chưa nộp giấy tờ bắt buộc theo quy định'}
                          </p>
                        </div>
                        <span
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${
                            deferredMatch && !isOverdue
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-[#F8EAEA] text-[#B33E3E] border-[#E5B8B8]'
                          }`}
                        >
                          {deferredMatch
                            ? isOverdue
                              ? isEn ? 'Deferred · Overdue' : 'Nộp sau · Quá hạn'
                              : isEn ? `Submit later · ${deferredMatch.submitDeadline || ''}` : `Nộp sau · ${deferredMatch.submitDeadline || ''}`
                            : isEn ? 'Missing' : 'Còn thiếu'}
                        </span>
                      </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'route' && (
        <div className="flex flex-col gap-6">
          {Number.isFinite(numericOrderId) && numericOrderId > 0 && (
            <ReservedVehiclesPanel
              shipmentId={numericOrderId}
              onChanged={() => {
                void mutateOrder();
              }}
            />
          )}

          <div className="bg-white rounded-2xl border border-[#D8CEBE] shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#EAE5DA] flex flex-wrap items-center justify-between gap-3 bg-[#FAF9F5]">
              <div>
                <h2 className="text-base font-extrabold text-[#181A17] m-0 flex items-center gap-2">
                  <RouteIcon size={18} className="text-[#A67C2E]" />
                  {isEn ? 'Planned Route Legs & Dispatch' : 'Kế Hoạch Lộ Trình & Điều Phối'}
                </h2>
                <p className="text-xs text-[#5C6658] mt-0.5 mb-0">
                  {routePlan
                    ? `${routePlan.routeName || requestCode} · ${routePlan.legs?.length || 0} chặng · ${routePlan.planStatus || 'draft'}`
                    : isEn
                    ? 'No detailed route plan has been created yet.'
                    : 'Chưa khởi tạo kế hoạch lộ trình chi tiết cho đơn hàng này.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/manager/planning"
                  className="no-underline inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D8CEBE] bg-white hover:bg-[#FAF8F4] text-xs font-bold text-[#181A17] whitespace-nowrap"
                >
                  <span>{isEn ? 'Dispatch & Crew' : 'Điều phối & Phân công'}</span>
                </Link>
                <Link
                  href={`/manager/dispatch/routes?shipmentId=${order.id}`}
                  className="no-underline inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#181A17] hover:bg-[#2A2D28] text-xs font-bold text-[#FAF8F4] whitespace-nowrap"
                >
                  <RouteIcon size={13} />
                  <span>{isEn ? 'Confirm / Edit Route' : 'Xác nhận / Sửa lộ trình'}</span>
                </Link>
              </div>
            </div>

            <div className="p-6">
              {routePlan && Array.isArray(routePlan.legs) && routePlan.legs.length > 0 ? (
                <div className="space-y-3">
                  {routePlan.legs.map((leg: any, idx: number) => (
                    <div
                      key={leg.id || idx}
                      className="p-4 rounded-xl border border-[#EAE5DA] bg-[#FAF9F5] flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <span className="text-[11px] font-bold uppercase text-[#966516]">
                          Chặng {idx + 1} · {leg.legType || leg.transportMode || 'road'}
                        </span>
                        <p className="text-sm font-bold text-[#181A17] mt-0.5 mb-0">
                          {leg.originLocation || leg.origin || '—'} → {leg.destinationLocation || leg.destination || '—'}
                        </p>
                      </div>
                      <div className="text-xs text-[#5C6658] font-semibold">
                        {leg.plannedDeparture ? formatDate(leg.plannedDeparture, locale) : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-[#5C6658] bg-[#FAF9F5] rounded-xl border border-dashed border-[#D8CEBE]">
                  {isEn
                    ? 'Click "Confirm / Edit Route" above to review quote-suggested legs, assign vehicles and lock the dispatch plan.'
                    : 'Nhấn "Xác nhận / Sửa lộ trình" ở trên để kiểm tra chặng từ báo giá, gán phương tiện và chốt kế hoạch xuất phát.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tracking' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-[#D8CEBE] shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#EAE5DA] flex flex-wrap items-center justify-between gap-3 bg-[#FAF9F5]">
              <div>
                <h2 className="text-base font-extrabold text-[#181A17] m-0 flex items-center gap-2">
                  <Radio size={18} className="text-[#A67C2E]" />
                  {isEn ? 'Live Progress Timeline' : 'Timeline Tiến Độ Hành Trình'}
                </h2>
                <p className="text-xs text-[#5C6658] mt-0.5 mb-0">
                  {isEn ? 'Synchronized milestones and vital alerts.' : 'Đồng bộ mốc kiểm soát thực địa và sinh hiệu ngựa.'}
                </p>
              </div>
              <Link
                href={`/manager/monitoring?shipmentId=${order.id}`}
                className="no-underline inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#181A17] hover:bg-[#2A2D28] text-xs font-bold text-[#FAF8F4] whitespace-nowrap"
              >
                <Radio size={13} />
                <span>{isEn ? 'Open Live GPS Map' : 'Mở Bản đồ GPS trực tuyến'}</span>
              </Link>
            </div>
            <div className="p-6">
              <VerticalTimeline
                items={timelineItems}
                viewer="manager"
                emptyText={isEn ? 'No tracking milestones recorded yet.' : 'Chưa có mốc hành trình nào được ghi nhận.'}
              />
            </div>
          </div>

          <div className="flex flex-col gap-6">
            {order && Number(order.id || requestId) > 0 && (
              <DeliveryHandoverPanel
                role="manager"
                shipmentId={Number(order.id || requestId)}
                shipmentStatus={statusKey}
              />
            )}
          </div>
        </div>
      )}

      {/* Main Grid: 2 Columns (Overview Tab) */}
      {activeTab === 'overview' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: 2 Spans */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Card 1: Request Summary */}
          <div className="bg-white rounded-2xl border border-[#D8CEBE] shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#EAE5DA] flex flex-wrap items-center justify-between gap-2 bg-[#FAF9F5]">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-[#A67C2E]" />
                <h2 className="text-base font-extrabold text-[#181A17] m-0">
                  {t('manager.detail.tripOverview', 'Thông Tin Tổng Quan Chuyến Đi')}
                </h2>
              </div>
              <span className="text-xs font-semibold text-[#5C6658]">
                {t('manager.detail.submittedDate', 'Ngày gửi:')} {formatDate(order.createdAt, locale)}
              </span>
            </div>

            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
              <div>
                <span className="text-xs font-semibold text-[#7E867B] block uppercase">
                  {t('manager.requests.colId', 'Mã Yêu Cầu')}
                </span>
                <span className="text-base font-bold text-[#181A17]">{requestCode}</span>
              </div>

              <div>
                <span className="text-xs font-semibold text-[#7E867B] block uppercase">
                  {t('manager.detail.transportType', 'Loại Hình Vận Chuyển')}
                </span>
                <span className={`inline-flex items-center gap-1.5 font-bold ${isDomestic ? 'text-[#287653]' : 'text-[#181A17]'}`}>
                  {transportationTypeLabel}
                </span>
              </div>

              <div className="sm:col-span-2 p-4 bg-[#FAF9F5] border border-[#EAE5DA] rounded-xl">
                <span className="text-xs font-bold text-[#7E867B] block uppercase mb-1.5">
                  {t('manager.requests.colRoute', 'Lộ Trình Vận Chuyển')}
                </span>
                <div className="flex items-center gap-3 text-[#181A17] font-bold text-base flex-wrap">
                  <span className="flex items-center gap-1">
                    <MapPin size={16} className="text-[#A67C2E] shrink-0" />
                    {order.originLocation}
                  </span>
                  <ArrowRight size={16} className="text-[#7E867B] shrink-0" />
                  <span className="flex items-center gap-1">
                    <MapPin size={16} className="text-[#287653] shrink-0" />
                    {order.destinationLocation}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 mt-2.5 pt-2.5 border-t border-[#EAE5DA] text-xs text-[#5C6658]">
                  <span>
                    {t('manager.requests.distance', 'Khoảng cách:')}{' '}
                    <strong className="text-[#181A17] font-bold">
                      {routeMetrics.distanceKm.toLocaleString('vi-VN')} km
                    </strong>
                  </span>
                  <span>
                    {t('manager.requests.estDuration', 'Thời gian ước tính:')}{' '}
                    <strong className="text-[#181A17] font-bold">
                      ~{routeMetrics.durationHours} {isEn ? 'hrs' : 'giờ'}
                    </strong>
                  </span>
                  <span>
                    {t('manager.requests.transportMethod', 'Phương thức:')}{' '}
                    <strong className="text-[#181A17] font-bold">
                      {effectiveMode === 'air'
                        ? t('manager.detail.modeAirLong', 'Đường Hàng Không')
                        : effectiveMode === 'sea'
                          ? t('manager.detail.modeSeaLong', isEn ? 'Sea Freight (Dedicated Vessel)' : 'Đường Thủy (Tàu Biển Chuyên Dụng)')
                          : t('manager.detail.modeRoadLong', 'Đường Bộ Liên Vận')}
                    </strong>
                  </span>
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold text-[#7E867B] block uppercase">
                  {t('manager.detail.requestedDeparture', 'Ngày Xuất Phát Yêu Cầu')}
                </span>
                <span className="font-bold text-[#181A17]">{formatDate(order.requestedDate, locale)}</span>
              </div>

              <div>
                <span className="text-xs font-semibold text-[#7E867B] block uppercase">
                  {t('manager.detail.expectedArrival', 'Ngày Dự Kiến Cập Bến')}
                </span>
                <span className="font-bold text-[#181A17]">
                  {formatDate(order.estimatedArrival || order.expectedArrivalDate, locale)}
                </span>
              </div>

              <div>
                <span className="text-xs font-semibold text-[#7E867B] block uppercase">
                  {t('manager.detail.horseCount', 'Số Lượng Cá Thể Ngựa')}
                </span>
                <span className="font-bold text-[#A67C2E] text-base">
                  {order.requestedHorseCount || order.horses?.length || 1} {isEn ? 'horses' : 'con'}
                </span>
              </div>

              <div>
                <span className="text-xs font-semibold text-[#7E867B] block uppercase">
                  {t('manager.detail.quotedPrice', 'Chi Phí Vận Chuyển (Báo Giá)')}
                </span>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-lg font-extrabold text-[#287653]">
                    {formatCurrencyVND(totalCost, t('manager.requests.notQuoted', 'Chưa định giá'))}
                  </span>
                  {totalCost > 0 && (
                    <span className="text-xs font-semibold text-[#5C6658]">
                      (~{formatUSD(totalCost)})
                    </span>
                  )}
                </div>
              </div>

              {(order.quoteId || order.pricingSnapshot) && (
                <div className="sm:col-span-2 pt-3 border-t border-[#EAE5DA]">
                  <SnapshotBreakdown
                    quoteId={order.quoteId}
                    pricingSnapshot={order.pricingSnapshot}
                    transportCost={order.transportCost}
                    insuranceFee={order.insuranceFee}
                    totalCost={order.totalCost}
                  />
                </div>
              )}

              {(() => {
                const cleaned = String(order.specialRequirements || '')
                  .split('|')
                  .map((s: string) => s.trim())
                  .filter((s: string) => s && !/^\[(Tiêu đề|Hình thức|Lộ trình):/i.test(s))
                  .join(' | ');
                if (!cleaned) return null;
                return (
                  <div className="sm:col-span-2 pt-2 border-t border-[#F0EEE8]">
                    <span className="text-xs font-semibold text-[#7E867B] block uppercase mb-1">
                      {t('manager.requests.specialReq', 'Ghi Chú & Yêu Cầu Đặc Biệt')}
                    </span>
                    <p className="text-xs text-[#7A591C] bg-[#F8F0DF]/70 border border-[#DFCA9A] p-3 rounded-lg leading-relaxed m-0">
                      {cleaned}
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Card 2: Horses Dossier */}
          <div className="bg-white rounded-2xl border border-[#D8CEBE] shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#EAE5DA] flex items-center justify-between bg-[#FAF9F5]">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-[#287653]" />
                <h2 className="text-base font-extrabold text-[#181A17] m-0">
                  {t('manager.detail.horsesDossier', 'Hồ Sơ Ngựa Vận Chuyển')} ({order.horses?.length || 0}{' '}
                  {isEn ? 'records' : 'hồ sơ'} / {order.requestedHorseCount || order.horses?.length || 1}{' '}
                  {isEn ? 'horses' : 'ngựa'})
                </h2>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-5 space-y-4">
                <BookingSummary
                  bookingType={order.bookingType}
                  horseCount={Number(order.requestedHorseCount ?? 1)}
                  stallUnitPrice={order.stallUnitPrice}
                  status={order.status}
                  departureDate={order.requestedDate}
                />
                <InsuranceSummary
                  horses={(order.horses ?? []).map((h: any) => ({
                    horseId: h.horseId,
                    name: h.name ?? (isEn ? 'Horse' : 'Ngựa'),
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
                  transportCost={order.transportCost ?? null}
                  insuranceFee={Number(order.insuranceFee ?? 0)}
                  totalCost={Number(order.totalCost ?? 0)}
                  showCostSummary={false}
                />
              </div>
              {Array.isArray(order.horses) && order.horses.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {order.horses.map((horse: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl border border-[#D8CEBE] bg-white shadow-sm hover:border-[#B49A68] transition-all"
                    >
                      <div className="flex items-start justify-between mb-3 gap-2">
                        <div>
                          <h3 className="text-base font-bold text-[#181A17] m-0">
                            {horse.name || (isEn ? 'Racehorse' : 'Chiến mã')}
                          </h3>
                          <span className="text-xs text-[#5C6658]">
                            {horse.breed || (isEn ? 'Unknown breed' : 'Chưa rõ giống')}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-[#5C6658] pt-2 border-t border-[#F0EEE8]">
                        <div>
                          <span className="text-[#7E867B] block text-[11px]">
                            {t('manager.requests.horseAge', 'Tuổi:')}
                          </span>
                          <strong className="text-[#181A17]">
                            {horse.age ? `${horse.age} ${isEn ? 'yo' : 'tuổi'}` : '—'}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[#7E867B] block text-[11px]">
                            {t('manager.detail.coatColor', 'Màu lông:')}
                          </span>
                          <strong className="text-[#181A17]">{horse.color || '—'}</strong>
                        </div>
                        <div>
                          <span className="text-[#7E867B] block text-[11px]">Microchip:</span>
                          <strong className="font-mono text-[#181A17]">{horse.microchipNo || '—'}</strong>
                        </div>
                        <div>
                          <span className="text-[#7E867B] block text-[11px]">FEI Passport:</span>
                          <strong className="font-mono text-[#181A17]">{horse.passportNo || '—'}</strong>
                        </div>
                      </div>

                      {horse.medicalStatus && (
                        <div className="mt-2.5 pt-2 border-t border-[#F0EEE8] text-xs">
                          <span className="text-[#7E867B] block text-[11px]">
                            {t('manager.detail.vetStatus', 'Tình trạng sức khỏe thú y:')}
                          </span>
                          <span className="text-[#287653] font-semibold">{horse.medicalStatus}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-[#7E867B] text-sm">
                  {t('manager.requests.noHorseManifest', 'Không có danh sách cá thể chi tiết trong hồ sơ.')}
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Compliance & Quarantine Checklist Overview */}
          <div className="bg-white rounded-2xl border border-[#D8CEBE] shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#EAE5DA] flex flex-wrap items-center justify-between gap-2 bg-[#FAF9F5]">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-[#A67C2E]" />
                <h2 className="text-base font-extrabold text-[#181A17] m-0">
                  {t('manager.detail.complianceTitle', 'Tiến Độ Thẩm Định Hồ Sơ & Kiểm Dịch')}
                </h2>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                  checklist?.isFullyCompliant
                    ? 'bg-[#E8F2EB] text-[#287653] border-[#B7DBC4]'
                    : 'bg-[#F8F0DF] text-[#966516] border-[#DFCA9A]'
                }`}
              >
                {checklist?.isFullyCompliant
                  ? t('manager.detail.compliantFull', 'Đạt chuẩn 100%')
                  : t('manager.detail.compliantPending', 'Đang xử lý hồ sơ')}
              </span>
            </div>

            <div className="p-6">
              <div className="flex items-center justify-between text-xs text-[#5C6658] mb-2 font-bold">
                <span>{t('manager.detail.docsApprovedLabel', 'Tài liệu đã được phê duyệt hợp lệ')}</span>
                <span className="text-[#181A17] font-extrabold">
                  {checklist?.approvedDocumentsCount || 0} / {checklist?.totalRequiredDocuments || 0}{' '}
                  {isEn ? 'docs' : 'hồ sơ'}
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={compliancePct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t('manager.detail.complianceTitle', 'Tiến Độ Thẩm Định Hồ Sơ & Kiểm Dịch')}
                className="w-full h-2.5 bg-[#F0EEE8] rounded-full overflow-hidden"
              >
                <div
                  className="h-full bg-[#287653] rounded-full transition-all duration-500"
                  style={{ width: `${compliancePct}%` }}
                />
              </div>

              <p className="text-xs text-[#5C6658] mt-3 leading-relaxed m-0">
                {t(
                  'manager.detail.complianceNote',
                  'Chuyên viên kiểm dịch thẩm định đầy đủ hồ sơ y tế và giấy phép trước khi chuyến đi xuất phát.'
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Customer Info & Payments & Audit */}
        <div className="flex flex-col gap-6">
          {/* Card 1: Customer Profile */}
          <div className="bg-white rounded-2xl border border-[#D8CEBE] shadow-sm p-6">
            <h2 className="text-base font-extrabold text-[#181A17] mb-4 flex items-center gap-2 m-0">
              <User size={18} className="text-[#A67C2E]" />
              <span>{t('manager.detail.customerProfile', 'Khách Hàng Đặt Chuyến')}</span>
            </h2>

            <div className="flex flex-col gap-3.5 text-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#F3EFE4] text-[#181A17] font-bold flex items-center justify-center shrink-0 border border-[#D8CEBE]">
                  {customerInitial}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-[#181A17] leading-tight m-0 truncate">
                    {customerDisplayName || '—'}
                  </p>
                  <span className="text-xs text-[#7E867B]">
                    {t('manager.detail.customerMember', 'Khách hàng đặt chuyến')}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-[#F0EEE8] flex flex-col gap-2.5 text-xs text-[#5C6658]">
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-[#7E867B] shrink-0" />
                  <span className="text-[#181A17] font-medium truncate">
                    {order.contactEmail || order.customerEmail || '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-[#7E867B] shrink-0" />
                  <span className="text-[#181A17] font-medium">{order.contactPhone || '—'}</span>
                </div>
                {order.contactAddress && (
                  <div className="flex items-start gap-2">
                    <MapPin size={14} className="text-[#7E867B] shrink-0 mt-0.5" />
                    <span className="text-[#181A17] font-medium">{order.contactAddress}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Payment & SePay Status */}
          <div className="bg-white rounded-2xl border border-[#D8CEBE] shadow-sm p-6">
            <h2 className="text-base font-extrabold text-[#181A17] mb-4 flex items-center gap-2 m-0">
              <CreditCard size={18} className="text-[#287653]" />
              <span>{t('manager.detail.paymentStatusTitle', 'Trạng Thái Thanh Toán')}</span>
            </h2>

            <div className="flex flex-col gap-3.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[#7E867B] font-semibold">
                  {t('manager.detail.statusLabel', 'Tình Trạng:')}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    isPaid
                      ? 'bg-[#E8F2EB] text-[#287653] border-[#B7DBC4]'
                      : totalCost > 0
                      ? 'bg-[#F8F0DF] text-[#966516] border-[#DFCA9A]'
                      : 'bg-[#F0EEE8] text-[#5C6658] border-[#D8CEBE]'
                  }`}
                >
                  {isPaid
                    ? t('manager.detail.paidSepay', '✓ Đã thanh toán SePay')
                    : totalCost > 0
                    ? t('manager.detail.quotedAwaitPayment', 'Đã chốt báo giá')
                    : t('manager.requests.notQuoted', 'Chưa định giá')}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[#7E867B] font-semibold">
                  {t('manager.detail.quotedAmount', 'Số Tiền Báo Giá:')}
                </span>
                <span className="font-extrabold text-[#181A17] text-base">
                  {formatCurrencyVND(totalCost, t('manager.requests.notQuoted', 'Chưa định giá'))}
                </span>
              </div>

              {paidAt && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#7E867B]">{t('manager.detail.paidAt', 'Thời gian nhận tiền:')}</span>
                  <span className="font-semibold text-[#181A17]">{formatDate(paidAt, locale)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Manager Decision & Audit */}
          <div className="bg-white rounded-2xl border border-[#D8CEBE] shadow-sm p-6">
            <h2 className="text-base font-extrabold text-[#181A17] mb-4 flex items-center gap-2 m-0">
              <ShieldCheck size={18} className="text-[#A67C2E]" />
              <span>{t('manager.detail.auditTitle', 'Lịch Sử Phê Duyệt Quản Lý')}</span>
            </h2>

            <div className="flex flex-col gap-3 text-xs text-[#5C6658]">
              <div className="flex justify-between items-center gap-2">
                <span className="text-[#7E867B]">{t('manager.detail.handler', 'Người xử lý:')}</span>
                <strong className="text-[#181A17] font-bold">{order.approverName || '—'}</strong>
              </div>

              <div className="flex justify-between items-center gap-2">
                <span className="text-[#7E867B]">{t('manager.detail.decisionStatus', 'Trạng thái quyết định:')}</span>
                <span className="font-bold text-[#181A17]">{statusLabel}</span>
              </div>

              {order.rejectionReason && (
                <div className="p-3 bg-[#F8EAEA] border border-[#E5B8B8] rounded-xl text-xs text-[#B33E3E]">
                  <strong>{t('manager.requests.rejectionReason', 'Lý do từ chối:')}</strong> {order.rejectionReason}
                </div>
              )}

              {order.changeRequestNotes && (
                <div className="p-3 bg-[#F8F0DF] border border-[#DFCA9A] rounded-xl text-xs text-[#966516]">
                  <strong>{t('manager.detail.changeNotesLabel', 'Yêu cầu chỉnh sửa:')}</strong> {order.changeRequestNotes}
                </div>
              )}
            </div>
          </div>

          {order && Number(order.id || requestId) > 0 && (
            <>
              <ManagerOrderFinanceGovernanceCard
                shipmentId={Number(order.id || requestId)}
                requestCode={requestCode}
                orderStatus={statusKey}
                bookingType={order.bookingType}
                onUpdated={async () => {
                  await mutateOrder();
                }}
              />
              <RoundTripPanel
                order={order}
                userRole="manager"
                onRefresh={async () => {
                  await mutateOrder();
                }}
              />
            </>
          )}
        </div>
      </div>
      )}

      {/* Inline Document Review Modal from Compliance Tab */}
      {reviewDoc && (
        <DocumentReviewModal
          isOpen={true}
          onClose={() => setReviewDoc(null)}
          documentId={reviewDoc.id}
          numericDocId={reviewDoc.numericDocId}
          horseName={reviewDoc.horseName}
          docTitle={reviewDoc.docTitle}
          fileUrl={reviewDoc.fileUrl}
          horseMicrochip={reviewDoc.microchip}
          horsePassport={reviewDoc.passport}
          currentExpiryDate={reviewDoc.expiryDate}
          onSuccess={() => {
            setReviewDoc(null);
            void mutateChecklist();
            void mutateOrder();
          }}
        />
      )}

      {/* Action Modal (Approve / Reject / Change) */}
      {activeModal !== 'NONE' && (
        <Modal
          isOpen={true}
          onClose={() => { if (!isSubmitting) setActiveModal('NONE'); }}
          closeDisabled={isSubmitting}
          title={
            activeModal === 'REJECT'
              ? `${t('manager.requests.reject', 'Từ chối')} ${requestCode}`
              : activeModal === 'CHANGE'
              ? `${t('manager.dashboard.askChange', 'Yêu cầu chỉnh sửa')} ${requestCode}`
              : `${t('manager.requests.btnApprove', 'Phê duyệt')} ${requestCode}`
          }
          maxWidth={activeModal === 'APPROVE' ? 'max-w-xl' : 'max-w-lg'}
        >
          <div className="flex flex-col gap-4 text-sm">
            {activeModal === 'APPROVE' ? (
              order.quoteId ? (
                <div className="space-y-4">
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2.5">
                    <ShieldCheck size={18} className="text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-bold mb-0.5">
                        {isEn ? `Quotation Locked (Quote #${order.quoteId})` : `Báo giá đã khóa theo Quote #${order.quoteId}`}
                      </strong>
                      <span>
                        {isEn
                          ? 'This shipment was booked via an automated quotation snapshot. Base freight and insurance are locked by tariff and will be used directly upon approval.'
                          : 'Đơn hàng này được tạo kèm báo giá tự động có hiệu lực. Cước phí và phương án xe đã được khóa theo bảng giá máy chủ, không cần nhập lại giá tay.'}
                      </span>
                    </div>
                  </div>

                  <SnapshotBreakdown
                    quoteId={order.quoteId}
                    pricingSnapshot={order.pricingSnapshot}
                    transportCost={order.transportCost}
                    insuranceFee={order.insuranceFee}
                    totalCost={order.totalCost}
                  />
                </div>
              ) : (
                <>
                  <p className="text-xs text-[#5C6658] m-0">
                    {t(
                      'manager.requests.sepayUnlockHint',
                      'Báo giá dự kiến được lưu bằng VND, gồm cước cơ bản và bảo hiểm. Hóa đơn và thanh toán SePay chỉ mở sau khi lộ trình chi tiết đã được xác nhận.'
                    )}
                  </p>

                  {/* Transport Mode Toggle */}
                  <div className="p-3.5 bg-[#FAF9F5] border border-[#D8CEBE] rounded-xl flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[#5C6658]">
                      <span>{t('manager.requests.transportMethod', 'Phương thức vận chuyển:')}</span>
                      <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-[#D8CEBE]">
                        <button
                          type="button"
                          onClick={() => applyModeAndSuggestedQuote('road', true)}
                          className={`px-2.5 py-1 text-xs font-bold rounded cursor-pointer transition-colors ${
                            selectedTransportMode === 'road'
                              ? 'bg-[#181A17] text-white shadow-sm'
                              : 'text-[#5C6658] hover:text-[#181A17]'
                          }`}
                        >
                          {t('manager.requests.modeRoad', 'Đường bộ')}
                        </button>
                        <button
                          type="button"
                          onClick={() => applyModeAndSuggestedQuote('air', true)}
                          className={`px-2.5 py-1 text-xs font-bold rounded cursor-pointer transition-colors ${
                            selectedTransportMode === 'air'
                              ? 'bg-[#181A17] text-white shadow-sm'
                              : 'text-[#5C6658] hover:text-[#181A17]'
                          }`}
                        >
                          {t('manager.requests.modeAir', 'Hàng không')}
                        </button>
                        <button
                          type="button"
                          onClick={() => applyModeAndSuggestedQuote('sea', true)}
                          className={`px-2.5 py-1 text-xs font-bold rounded cursor-pointer transition-colors ${
                            selectedTransportMode === 'sea'
                              ? 'bg-[#0E7490] text-white shadow-sm'
                              : 'text-[#5C6658] hover:text-[#181A17]'
                          }`}
                        >
                          {t('manager.requests.modeSea', isEn ? 'Sea Freight' : 'Đường thủy')}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-[#5C6658] pt-1 border-t border-[#EAE5DA]">
                      <span>
                        {t('manager.requests.distance', 'Khoảng cách:')}{' '}
                        <strong className="text-[#181A17]">
                          {routeMetrics.distanceKm.toLocaleString('vi-VN')} km
                        </strong>
                      </span>
                      <span>
                        {t('manager.requests.estDuration', 'Thời gian ước tính:')}{' '}
                        <strong className="text-[#181A17]">
                          ~{routeMetrics.durationHours} {isEn ? 'hrs' : 'giờ'}
                        </strong>
                      </span>
                    </div>
                  </div>
                </>
              )
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="detail-reason-input" className="text-xs font-bold text-[#242722]">
                    {activeModal === 'REJECT'
                      ? t('manager.requests.fieldRejectReason', 'Lý do từ chối đơn (tối thiểu 5 ký tự):')
                      : t('manager.requests.fieldChangeReason', 'Ghi chú nội dung cần chỉnh sửa (tối thiểu 5 ký tự):')}{' '}
                    <span className="text-[#B33E3E]">*</span>
                  </label>
                  <span className="text-[11px] text-[#7E867B]">{inputValue.trim().length} / 5+</span>
                </div>
                <textarea
                  id="detail-reason-input"
                  rows={4}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={t('manager.detail.reasonPlaceholder', 'Nhập nội dung phản hồi chi tiết...')}
                  className="w-full p-3 border border-[#D8CEBE] rounded-lg text-sm text-[#181A17] focus:outline-none focus:ring-2 focus:ring-[#C4B38E]"
                />
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2.5 pt-3 border-t border-[#F0EEE8] mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSubmitting}
                onClick={() => setActiveModal('NONE')}
              >
                {t('common.cancel', 'Hủy bỏ')}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isSubmitting}
                onClick={handleConfirmAction}
                className={
                  activeModal === 'REJECT'
                    ? 'bg-[#B33E3E] hover:bg-[#963232] text-white font-bold'
                    : activeModal === 'APPROVE'
                    ? 'bg-[#287653] hover:bg-[#1f5e42] text-white font-bold'
                    : 'bg-[#A67C2E] hover:bg-[#8E6823] text-white font-bold'
                }
              >
                {isSubmitting
                  ? t('common.processing', 'Đang xử lý...')
                  : activeModal === 'REJECT'
                  ? t('manager.requests.btnConfirmReject', 'Xác nhận từ chối')
                  : activeModal === 'CHANGE'
                  ? t('manager.requests.btnSendChange', 'Gửi yêu cầu chỉnh sửa')
                  : t('manager.requests.btnConfirmApprove', 'Xác nhận phê duyệt')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Feasibility Review Modal */}
      {feasibilityModal !== 'NONE' && (
        <Modal
          isOpen={true}
          onClose={() => setFeasibilityModal('NONE')}
          title={
            feasibilityModal === 'APPROVE'
              ? (isEn ? 'Approve Shipment Feasibility' : 'Duyệt tính khả thi của đơn hàng')
              : (isEn ? 'Cannot Fulfil Shipment Request' : 'Xác nhận không thể đáp ứng đơn hàng')
          }
        >
          <div className="flex flex-col gap-4">
            {feasibilityModal === 'APPROVE' ? (
              <div className="p-3.5 bg-[#E8F2EB] border border-[#B7DBC4] rounded-xl text-xs text-[#287653] leading-relaxed">
                <p className="font-bold mb-1">
                  {isEn
                    ? 'Confirm operational feasibility for this paid shipment?'
                    : 'Xác nhận tính khả thi vận hành cho đơn hàng đã thanh toán này?'}
                </p>
                <p className="m-0">
                  {isEn
                    ? 'The transport vehicle, stall capacity, and cross-border quarantine corridors are confirmed workable. The shipment will advance to trip and route planning.'
                    : 'Xe chuyên dụng, sức chứa chuồng và hành lang kiểm dịch đã được đối chiếu khả thi. Đơn hàng sẽ chuyển sang trạng thái đã duyệt khả thi để điều phối viên lập tuyến.'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="p-3.5 bg-[#F8EAEA] border border-[#E5B8B8] rounded-xl text-xs text-[#B33E3E]">
                  <p className="font-bold mb-1">
                    {isEn
                      ? 'Shipment will be cancelled with 100% refund guarantee'
                      : 'Đơn hàng sẽ chuyển sang trạng thái hoàn tiền 100%'}
                  </p>
                  <p className="m-0">
                    {isEn
                      ? 'Customer will be notified to submit their banking information for 100% reimbursement within 3-5 business days.'
                      : 'Khách hàng sẽ nhận thông báo cung cấp thông tin tài khoản ngân hàng để hoàn tiền 100% không trừ phí trong vòng 3-5 ngày làm việc.'}
                  </p>
                </div>

                <div>
                  <label htmlFor="feasibility-reason-select" className="block text-xs font-bold text-[#181A17] mb-1">
                    {isEn ? 'Reason Code *' : 'Mã lý do không đáp ứng *'}
                  </label>
                  <select
                    id="feasibility-reason-select"
                    value={cannotFulfilReason}
                    onChange={(e) => setCannotFulfilReason(e.target.value)}
                    className="w-full p-2.5 border border-[#D8CEBE] rounded-lg text-xs font-semibold text-[#181A17] bg-white focus:outline-none focus:ring-2 focus:ring-[#C4B38E]"
                  >
                    <option value="no_vehicle_available">
                      {isEn ? 'No vehicle/stall available at requested schedule' : 'Không có xe/khoang phù hợp thời gian yêu cầu'}
                    </option>
                    <option value="route_restricted">
                      {isEn ? 'Route or border crossing temporarily restricted' : 'Tuyến đường tạm thời hạn chế/đóng cửa khẩu'}
                    </option>
                    <option value="quarantine_capacity_full">
                      {isEn ? 'Quarantine station at maximum capacity' : 'Trạm kiểm dịch quá tải'}
                    </option>
                    <option value="weather_or_force_majeure">
                      {isEn ? 'Severe weather or force majeure' : 'Thời tiết xấu/bất khả kháng'}
                    </option>
                    <option value="other">
                      {isEn ? 'Other reason (specify in notes)' : 'Lý do khác (bắt buộc nêu chi tiết trong ghi chú)'}
                    </option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="feasibility-note-input" className="text-xs font-bold text-[#181A17]">
                      {isEn ? 'Detailed Explanation * (min 10 chars)' : 'Giải trình chi tiết gửi khách hàng * (tối thiểu 10 ký tự)'}
                    </label>
                    <span className="text-[11px] text-[#7E867B]">{cannotFulfilNote.trim().length} / 10+</span>
                  </div>
                  <textarea
                    id="feasibility-note-input"
                    rows={4}
                    value={cannotFulfilNote}
                    onChange={(e) => setCannotFulfilNote(e.target.value)}
                    placeholder={
                      isEn
                        ? 'Provide specific explanation why the shipment cannot be fulfilled...'
                        : 'Nêu rõ lý do cụ thể vì sao hệ thống không thể phục vụ chuyến này...'
                    }
                    className="w-full p-2.5 border border-[#D8CEBE] rounded-lg text-xs text-[#181A17] focus:outline-none focus:ring-2 focus:ring-[#C4B38E]"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-3 border-t border-[#F0EEE8]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={feasibilitySubmitting}
                onClick={() => setFeasibilityModal('NONE')}
              >
                {isEn ? 'Cancel' : 'Hủy bỏ'}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={feasibilitySubmitting}
                onClick={() => handleFeasibilitySubmit(feasibilityModal === 'APPROVE' ? 'approve' : 'cannot_fulfil')}
                className={
                  feasibilityModal === 'APPROVE'
                    ? 'bg-[#287653] hover:bg-[#1f5e42] text-white font-bold'
                    : 'bg-[#B33E3E] hover:bg-[#963232] text-white font-bold'
                }
              >
                {feasibilitySubmitting
                  ? (isEn ? 'Processing...' : 'Đang xử lý...')
                  : feasibilityModal === 'APPROVE'
                  ? (isEn ? 'Confirm Approval' : 'Xác nhận duyệt khả thi')
                  : (isEn ? 'Confirm 100% Refund' : 'Xác nhận hoàn tiền 100%')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
