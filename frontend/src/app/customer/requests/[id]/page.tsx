'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  Check,
  Plane,
  ArrowRight,
  AlertTriangle,
  Upload,
  Eye,
  FileText,
  Building,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Loader2,
  Download,
  CreditCard,
  Route,
  FileCheck2,
  Navigation,
  RotateCcw,
} from 'lucide-react';
import { useCustomerStore } from '@/lib/customer-store';
import { DocumentUploadModal } from '@/features/documents/components/DocumentUploadModal';
import { BatchDocumentUploadModal } from '@/features/documents/components/BatchDocumentUploadModal';
import { HorseDocumentUploadModal } from '@/features/documents/components/HorseDocumentVault';
import { parseOptionalPositiveId } from '@/features/documents/document-upload-resolution';
import { apiClient, openAuthenticatedDocument } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';
import { OrderComplianceChecklist } from '@/features/documents/api/documents.api';
import { buildEquineRoute, geocodeAddress, resolveLocation, GeocodedLocation } from '@/lib/geo-corridors';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { SepayPayment } from '@/features/orders/components/SepayPayment';
import { PaymentCountdownBadge } from '@/features/orders/components/PaymentCountdownBadge';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { InsuranceSummary } from '@/features/orders/components/InsuranceSummary';
import { BookingSummary } from '@/features/orders/components/BookingSummary';
import { InsuranceAmendmentForm } from '@/features/orders/components/InsuranceAmendmentForm';
import { CustomerRefundSummaryCard } from '@/features/orders/components/CustomerRefundSummaryCard';
import { DeliveryHandoverPanel } from '@/features/tracking/components/DeliveryHandoverPanel';
import { RoundTripPanel } from '@/features/orders/components/RoundTripPanel';
import { CustomerClaimsList } from '@/features/orders/components/CustomerClaimsList';
import { escapeQuotationText } from '@/features/orders/quotation-html';
import { VerticalTimeline, buildTimeline, TimelineItem } from '@/features/tracking/timeline';
import { trackingApi } from '@/features/tracking/api/tracking.api';

const fetcher = async (url: string) => {
  let targetUrl = url;
  const segments = url.split('/');
  const rawId = segments[segments.length - 1];
  if (rawId && isNaN(Number(rawId))) {
    try {
      const myOrders = await apiClient<any[]>('/orders/my-orders');
      const matched = myOrders.find((o) =>
        String(o.requestCode || '').toLowerCase() === rawId.toLowerCase() ||
        `req-${o.id}`.toLowerCase() === rawId.toLowerCase() ||
        String(o.id) === rawId
      );
      if (matched) {
        targetUrl = `/orders/${matched.id}`;
      }
    } catch {}
  }
  const data = await apiClient<any>(targetUrl);

  // Normalize horses array to support both backend schema and frontend template schema
  const rawHorses = Array.isArray(data.horses) && data.horses.length > 0
    ? data.horses
    : data.horse
      ? [data.horse]
      : [];

  const normalizedHorses = rawHorses.map((item: any, idx: number) => {
    const rawObj = item.horse || item;
    const horseObj = {
      id: String(rawObj.horseId || rawObj.id || item.horseId || item.id || `hrs-${idx + 1}`),
      name: rawObj.name || item.name || 'Racehorse',
      breed: rawObj.breed || item.breed || 'Thoroughbred',
      age: rawObj.age || item.age || 5,
    };
    return {
      horse: horseObj,
      isComplete: true,
      medicalStatus: item.medicalStatus || 'Healthy',
      docsSummary: item.docsSummary || '4/4 Complete',
    };
  });

  const documents = Array.isArray(data.documents) ? data.documents : [];

  const statusStepMap: Record<string, number> = {
    requested: 2,
    under_review: 2,
    in_review: 2,
    change_requested: 2,
    rejected: 2,
    approved: 3,
    planning: 4,
    confirmed: 4,
    ready_to_depart: 5,
    ready: 5,
    in_transit: 5,
    completed: 6,
    cancelled: 1,
  };
  const activeStepIndex = statusStepMap[String(data.status || '').toLowerCase()] || 2;

  const timeline = [
    { stage: 1, name: 'Request Created', status: 'completed' },
    { stage: 2, name: 'Manager Approval', status: activeStepIndex === 2 ? 'active' : activeStepIndex > 2 ? 'completed' : 'pending' },
    { stage: 3, name: 'Quarantine & Docs', status: activeStepIndex === 3 ? 'active' : activeStepIndex > 3 ? 'completed' : 'pending' },
    { stage: 4, name: 'Trip Planned', status: activeStepIndex === 4 ? 'active' : activeStepIndex > 4 ? 'completed' : 'pending' },
    { stage: 5, name: 'In Transit', status: activeStepIndex === 5 ? 'active' : activeStepIndex > 5 ? 'completed' : 'pending' },
    { stage: 6, name: 'Handover Completed', status: activeStepIndex === 6 ? (String(data.status || '').toLowerCase() === 'completed' ? 'completed' : 'active') : activeStepIndex > 6 ? 'completed' : 'pending' },
  ];

  const statusLabels: Record<string, string> = {
    requested: 'Pending Approval',
    awaiting_payment: 'Awaiting Payment',
    paid_pending_review: 'Paid - Feasibility Review',
    refund_requested: 'Refund Requested',
    refunded: 'Refunded',
    under_review: 'Under Review',
    in_review: 'Under Review',
    approved: 'Approved',
    planning: 'In Planning',
    confirmed: 'Confirmed Plan',
    ready_to_depart: 'Ready to Depart',
    ready: 'Ready to Depart',
    change_requested: 'Change Requested',
    rejected: 'Rejected',
    in_transit: 'In Transit',
    completed: 'Completed',
    cancelled: 'Cancelled',
    cancelled_operational: 'Cancelled (Operational)',
    quotation_sent: 'Quotation Sent',
  };

  const originStr = String(data.originLocation || '');
  const destStr = String(data.destinationLocation || '');
  const specialReq = String(data.specialRequirements || '');
  const specialReqLower = specialReq.toLowerCase();

  // 1. Dynamic Geocoding for Destination to get exact country and coordinates
  let geoDest: GeocodedLocation | null = null;
  if (destStr && destStr.trim().length >= 3) {
    try {
      geoDest = await geocodeAddress(destStr);
    } catch {}
  }

  // 2. Fallback resolution via known locations
  const resolvedDest = resolveLocation(destStr);

  // 3. Parse saved route/mode metrics from backend transportMode or specialRequirements if present
  const routeMatch = specialReq.match(/\[Lộ trình:\s*([^,]+),\s*([0-9,]+)\s*km,\s*~?([0-9]+)h\]/i);
  const rawOrderMode = String(data.transportMode || data.transport_mode || '').toLowerCase();
  const explicitOrderMode: 'road' | 'air' | 'sea' | null =
    rawOrderMode === 'road' || rawOrderMode === 'air' || rawOrderMode === 'sea'
      ? (rawOrderMode as 'road' | 'air' | 'sea')
      : null;
  const savedMode: 'road' | 'air' | 'sea' | null =
    explicitOrderMode ||
    (routeMatch
      ? routeMatch[1].toLowerCase().includes('đường thủy') ||
        routeMatch[1].toLowerCase().includes('tàu biển') ||
        routeMatch[1].toLowerCase().includes('sea') ||
        routeMatch[1].toLowerCase().includes('vessel')
        ? 'sea'
        : routeMatch[1].toLowerCase().includes('hàng không') || routeMatch[1].toLowerCase().includes('air')
          ? 'air'
          : 'road'
      : null);
  const savedDistKm = routeMatch ? Number(routeMatch[2].replace(/,/g, '')) : null;
  const savedHours = routeMatch ? Number(routeMatch[3]) : null;

  // 4. Determine domestic vs international
  const rawType = String(data.transportationType || data.transportType || '').toLowerCase();
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
    const isForeign =
      (geoDest && geoDest.country !== 'Việt Nam' && geoDest.country !== 'Vietnam') ||
      (!geoDest && !resolvedDest.isVietnam);
    isDomestic = !isForeign;
  }

  const transportationType = isDomestic ? 'Domestic' : 'International';

  // 5. Origin and destination country & code
  const originCountryCode = 'VN';
  const destinationCountry = isDomestic
    ? 'Vietnam'
    : geoDest?.country || resolvedDest.country || 'International';

  let destinationCountryCode = 'INTL';
  if (isDomestic) {
    destinationCountryCode = 'VN';
  } else if (geoDest?.countryCode) {
    destinationCountryCode = geoDest.countryCode.toUpperCase();
  } else {
    const cLower = destinationCountry.toLowerCase();
    if (cLower.includes('indonesia')) destinationCountryCode = 'ID';
    else if (cLower.includes('singapore')) destinationCountryCode = 'SG';
    else if (cLower.includes('malaysia')) destinationCountryCode = 'MY';
    else if (cLower.includes('thailand') || cLower.includes('thái')) destinationCountryCode = 'TH';
    else if (cLower.includes('japan') || cLower.includes('nhật')) destinationCountryCode = 'JP';
    else if (cLower.includes('korea') || cLower.includes('hàn')) destinationCountryCode = 'KR';
    else if (cLower.includes('australia') || cLower.includes('úc')) destinationCountryCode = 'AU';
    else if (cLower.includes('china') || cLower.includes('trung')) destinationCountryCode = 'CN';
    else if (cLower.includes('pháp') || cLower.includes('france')) destinationCountryCode = 'FR';
    else if (cLower.includes('anh') || cLower.includes('uk')) destinationCountryCode = 'GB';
    else if (cLower.includes('mỹ') || cLower.includes('usa')) destinationCountryCode = 'US';
    else destinationCountryCode = 'INTL';
  }

  // 6. Build route calculation
  const preferredMode = (savedMode || (isDomestic ? 'road' : 'air')) as 'air' | 'road' | 'sea';
  const routeCalc = buildEquineRoute(
    originStr,
    destStr,
    preferredMode,
    transportationType as any,
    null,
    geoDest?.coords ?? null,
    null,
    geoDest
  );

  const finalDistKm = savedDistKm ?? routeCalc.distanceKm;
  const finalHours = savedHours ?? routeCalc.durationHours;
  const estimatedDistance = data.estimatedDistance || `${finalDistKm.toLocaleString()} km`;
  const modeDisplayLabel =
    preferredMode === 'air' ? 'Air Flight' : preferredMode === 'sea' ? 'Sea Freight' : 'Road Transit';
  const estimatedDuration = data.estimatedDuration || (isDomestic ? `~${finalHours} hours` : `~${finalHours} hours (${modeDisplayLabel})`);
  const transitName = isDomestic
    ? (routeCalc.waypoints.find((w) => w.type === 'checkpoint' || w.type === 'rest' || w.type === 'seaport')?.name || 'Domestic Quarantine Station')
    : (routeCalc.waypoints.find((w) => w.type === 'checkpoint' || w.type === 'airport' || w.type === 'seaport')?.name || 'Border / Transit Checkpoint');

  return {
    ...data,
    insuranceHorses: rawHorses,
    isDomestic,
    transportationType,
    originCountryCode,
    destinationCountryCode,
    destinationCountry,
    transitName,
    requestedHorseCount: data.requestedHorseCount || data.requested_horse_count || (normalizedHorses.length || 1),
    requestCode: data.customerRequestCode || data.requestCode || `REQ-${String(data.id).padStart(3, '0')}`,
    horse: normalizedHorses[0]?.horse || { name: 'Racehorse' },
    horses: normalizedHorses,
    documents,
    timeline,
    activeStepIndex,
    statusLabel: statusLabels[String(data.status || '').toLowerCase()] || data.status || 'Under Review',
    origin: data.originLocation,
    originCode: 'SGN, VN',
    destination: data.destinationLocation,
    destinationCode: 'DEST',
    estimatedDistance,
    estimatedDuration,
    createdDate: data.createdAt ? new Date(data.createdAt).toLocaleDateString('en-GB') : '23 Sep 2026',
    departureDate: data.requestedDate ? new Date(data.requestedDate).toLocaleDateString('en-GB') : 'TBD',
    estimatedArrivalDate: data.expectedArrivalDate
      ? new Date(data.expectedArrivalDate).toLocaleDateString('en-GB')
      : data.requestedDate
      ? new Date(new Date(data.requestedDate).getTime() + (routeCalc.durationHours || 12) * 3600 * 1000).toLocaleDateString('en-GB')
      : 'TBD',
    totalCost: Number(data.totalCost || data.total_cost || 0),
    notes: data.specialRequirements || 'No special requirements specified.',
  };
};

const PAYABLE_SHIPMENT_STATUSES = [
  'awaiting_payment',
  'planning',
  'confirmed',
  'ready_to_depart',
  'in_transit',
  'return_pending',
  'completed',
];

export default function RequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const langContext = useLanguage() || ({} as any);
  const {
    t = (_key: string, fallback?: string) => fallback || _key,
    language = 'vi',
    translateStatus = (s?: string | null) => s || '',
    translateDocType = (s?: string | null) => s || '',
    translateBreed = (s?: string | null) => s || '',
    translateTransportType = (s?: string | null) => s || '',
    translateCountry = (s?: string | null) => s || '',
    translateRejectionReason = (s?: string | null) => s || '',
  } = langContext;
  const isEn = language === 'en';
  const requestId = params?.id as string;

  const { uploadDocumentForRequest, cancelRequest, refreshHorses } = useCustomerStore();
  const { data: request, error, isLoading: loading, mutate } = useSWR(`/orders/${requestId}`, fetcher, {
    revalidateOnFocus: true,
  });

  const { data: checklist, mutate: mutateChecklist } = useSWR<OrderComplianceChecklist>(
    request?.id ? `/documents/order/${request.id}/checklist` : null,
    (url: string) => apiClient<OrderComplianceChecklist>(url),
    { revalidateOnFocus: true }
  );

  // Step 11: Fetch live shipment timeline if order has an associated active shipment
  const isTransitOrBeyondPre = ['ready_to_depart', 'ready', 'in_transit', 'return_pending', 'arrived', 'completed'].includes(
    String(request?.status || '').toLowerCase()
  );
  const targetShipmentId =
    request?.shipment?.id || request?.shipmentId || (isTransitOrBeyondPre ? request?.id : null);
  const { data: timelineData } = useSWR(
    targetShipmentId ? `/tracking/shipments/${targetShipmentId}/timeline` : null,
    async () => {
      try {
        return await trackingApi.getShipmentTimeline(Number(targetShipmentId));
      } catch {
        return null;
      }
    },
    { revalidateOnFocus: false },
  );

  // Tab State: 4 core lifecycle tabs supporting ?tab= and #sepay-payment
  const [activeTab, setActiveTab] = useState<'overview' | 'horses' | 'documents' | 'payment'>('overview');
  const [earlyUploadModal, setEarlyUploadModal] = useState<{
    isOpen: boolean;
    horseId: number;
    documentTypeCode?: string;
  }>({ isOpen: false, horseId: 0 });

  useEffect(() => {
    const tabParam = (searchParams?.get('tab') || '').toLowerCase();
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    if (hash === '#sepay-payment' || tabParam === 'payment' || tabParam === 'quotation') {
      setActiveTab('payment');
    } else if (tabParam === 'horses' || tabParam === 'handover' || tabParam === 'insurance') {
      setActiveTab('horses');
    } else if (tabParam === 'documents' || tabParam === 'docs' || tabParam === 'compliance') {
      setActiveTab('documents');
    } else if (tabParam === 'overview') {
      setActiveTab('overview');
    }
  }, [searchParams]);

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isNegotiateModalOpen, setIsNegotiateModalOpen] = useState(false);
  const [negotiateNotes, setNegotiateNotes] = useState('');
  const [isSubmittingNegotiation, setIsSubmittingNegotiation] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<{
    horseId?: number | string;
    regulationId?: number | string;
  } | null>(null);

  const [isBatchUploadOpen, setIsBatchUploadOpen] = useState(false);
  const [batchTarget, setBatchTarget] = useState<{
    horseId: number | string;
    horseName: string;
    missingRegulations: any[];
  } | null>(null);

  const [reuploadTarget, setReuploadTarget] = useState<{
    docId: number;
    title: string;
    docType?: string;
    horseId?: number | string;
    regulationId?: number | string;
  } | null>(null);
  
  // Resubmit Modal State
  const [isResubmitOpen, setIsResubmitOpen] = useState(false);

  // Cancel Request Modal States
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // ─── ERROR HANDLING: Prevent infinite grey skeleton on 404/500 ───
  if (error) {
    return (
      <div role="alert" style={{ padding: '60px 24px', maxWidth: '580px', margin: '40px auto', textAlign: 'center', backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #D8CEBE', boxShadow: '0 4px 16px rgba(15, 23, 42, 0.06)' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '14px', backgroundColor: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
          <AlertTriangle size={28} />
        </div>
        <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#181A17', marginBottom: '8px' }}>
          {t('requestDetail.notFoundTitle', 'Không thể tìm thấy hoặc tải đơn vận chuyển')}
        </h3>
        <p style={{ fontSize: '13.5px', color: '#64748b', marginBottom: '24px', lineHeight: 1.5 }}>
          {error?.message || t('requestDetail.notFoundDesc', 'Có lỗi xảy ra khi truy vấn dữ liệu từ máy chủ (Mã lỗi 404/500). Vui lòng kiểm tra lại ID đơn hàng hoặc kết nối mạng.')}
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => router.push('/customer/requests')}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: '1px solid #D8CEBE',
              backgroundColor: '#ffffff',
              fontSize: '13.5px',
              fontWeight: 600,
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            {t('requestDetail.backToList', 'Quay lại danh sách')}
          </button>
          <button
            onClick={() => mutate()}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#A67C2E',
              color: '#ffffff',
              fontSize: '13.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <RefreshCw size={15} /> {t('requestDetail.retryBtn', 'Thử lại')}
          </button>
        </div>
      </div>
    );
  }

  // ─── LOADING SKELETON ───
  if (loading || !request) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ height: '40px', width: '30%', backgroundColor: '#e5e7eb', borderRadius: '8px' }} />
        <div style={{ height: '200px', width: '100%', backgroundColor: '#e5e7eb', borderRadius: '16px' }} />
        
      </div>
    );
  }

  const statusLower = String(request?.status || '').toLowerCase();
  const isAwaitingPayment = statusLower === 'awaiting_payment';
  const isPaidPendingReview = statusLower === 'paid_pending_review';
  const isPendingReview =
    statusLower === 'requested' ||
    statusLower === 'under_review' ||
    statusLower === 'paid_pending_review' ||
    statusLower === 'change_requested';
  const isCancelledOrRejected = [
    'rejected',
    'cancelled',
    'cancelled_operational',
    'refund_requested',
    'refunded',
  ].includes(statusLower);
  const isApproved = [
    'approved',
    'planning',
    'confirmed',
    'ready_to_depart',
    'ready',
    'in_transit',
    'return_pending',
    'completed',
  ].includes(statusLower);
  const isAlreadyPaid =
    Boolean(request.paidAt) ||
    String(request.paymentStatus || '').toLowerCase() === 'succeeded' ||
    String(request.paymentStatus || '').toLowerCase() === 'paid' ||
    (request.paymentFlow === 'prepaid' &&
      [
        'paid_pending_review',
        'approved',
        'planning',
        'confirmed',
        'ready_to_depart',
        'in_transit',
        'return_pending',
        'completed',
      ].includes(statusLower));
  const needsPaymentNow =
    !isAlreadyPaid &&
    Number(request.totalCost) > 0 &&
    (isAwaitingPayment ||
      (request.paymentFlow !== 'prepaid' &&
        ['confirmed', 'ready_to_depart'].includes(statusLower)));
  const canTrackGps = ['ready_to_depart', 'ready', 'in_transit', 'return_pending', 'completed'].includes(statusLower);
  const canShowHandoverAndClaims = ['in_transit', 'return_pending', 'completed'].includes(statusLower);
  const requirementsSent = Boolean(checklist?.requirementsSent);
  const totalMissingCount = checklist?.horses?.reduce(
    (acc, h) => acc + (h.missingRegulations?.length || 0),
    0
  ) ?? 0;
  const totalRejectedCount = checklist?.horses?.reduce(
    (acc, h) => acc + (h.documents?.filter((d: any) => d.status === 'rejected')?.length || 0),
    0
  ) ?? 0;

  // Rule: Khách tự hủy khi đơn trả trước chưa thanh toán (awaiting_payment) hoặc đơn cũ chưa duyệt
  // (requested, change_requested). Backend kiểm tra lại và chặn nếu đã ghi nhận giao dịch SePay.
  const cancellableStatuses = ['awaiting_payment', 'requested', 'change_requested'];
  const canCancel = cancellableStatuses.includes(statusLower);

  // Check if order has quotation available
  const hasQuotation = Number(request.totalCost) > 0 || statusLower === 'quotation_sent' || statusLower === 'approved';

  // Step 11: Setup timeline items for request detail
  const isTransitOrBeyond = ['ready_to_depart', 'ready', 'in_transit', 'return_pending', 'arrived', 'completed'].includes(statusLower);

  const fallbackTimelineItems: TimelineItem[] = [
    {
      id: 'req_created',
      group: 'pre_trip',
      kind: 'approval',
      title: language === 'en' ? 'Transport Request Created' : 'Tạo yêu cầu vận chuyển',
      subtitle: request.origin && request.destination ? `${request.origin} → ${request.destination}` : undefined,
      status: 'done',
      actualAt: request.createdAt,
    },
    {
      id: 'req_paid',
      group: 'pre_trip',
      kind: 'payment',
      title: language === 'en' ? 'Deposit / Fee Payment' : 'Thanh toán cước phí / đặt cọc',
      subtitle: request.totalCost ? `${Number(request.totalCost).toLocaleString()} VND` : undefined,
      status: ['paid_pending_review', 'approved', 'planning', 'confirmed', 'ready_to_depart', 'in_transit', 'return_pending', 'completed'].includes(statusLower)
        ? 'done'
        : ['awaiting_payment', 'quotation_sent'].includes(statusLower)
        ? 'current'
        : 'upcoming',
    },
    {
      id: 'req_approved',
      group: 'pre_trip',
      kind: 'approval',
      title: language === 'en' ? 'Logistics Feasibility Approval' : 'Quản lý phê duyệt tính khả thi',
      status: ['approved', 'planning', 'confirmed', 'ready_to_depart', 'in_transit', 'return_pending', 'completed'].includes(statusLower)
        ? 'done'
        : ['requested', 'under_review', 'in_review'].includes(statusLower)
        ? 'current'
        : ['rejected', 'cancelled', 'cancelled_operational'].includes(statusLower)
        ? 'failed'
        : 'upcoming',
    },
    {
      id: 'req_docs',
      group: 'pre_trip',
      kind: 'documents',
      title: language === 'en' ? 'Veterinary & Customs Compliance' : 'Hồ sơ kiểm dịch & hải quan',
      subtitle: checklist?.isFullyCompliant ? (language === 'en' ? 'All mandatory documents verified' : 'Đã duyệt đủ hồ sơ') : undefined,
      status: checklist?.isFullyCompliant || ['confirmed', 'ready_to_depart', 'in_transit', 'return_pending', 'completed'].includes(statusLower)
        ? 'done'
        : statusLower === 'planning'
        ? 'current'
        : 'upcoming',
    },
    {
      id: 'req_planned',
      group: 'outbound',
      kind: 'pickup',
      title: language === 'en' ? 'Route & Fleet Planning' : 'Phân bổ xe & Lập lộ trình di chuyển',
      status: ['ready_to_depart', 'in_transit', 'return_pending', 'completed'].includes(statusLower)
        ? 'done'
        : statusLower === 'confirmed'
        ? 'current'
        : 'upcoming',
    },
    {
      id: 'req_transit',
      group: 'outbound',
      kind: 'delivery',
      title: language === 'en' ? 'In-Transit Execution' : 'Tiến trình vận chuyển thực địa',
      status: statusLower === 'completed'
        ? 'done'
        : statusLower === 'in_transit' || statusLower === 'return_pending'
        ? 'current'
        : 'upcoming',
    },
    {
      id: 'req_handover',
      group: 'post_trip',
      kind: 'handover',
      title: language === 'en' ? 'Delivery Handover & Acceptance' : 'Bàn giao ngựa & Nghiệm thu kết thúc',
      status: statusLower === 'completed' ? 'done' : 'upcoming',
    },
  ];

  const activeTimelineItems =
    timelineData?.items && timelineData.items.length > 0
      ? buildTimeline({ timelineData, viewer: 'customer', language })
      : fallbackTimelineItems;

  // Compute dynamic timeline stepper
  let computedStep = 2;
  if (['requested', 'under_review', 'change_requested', 'rejected', 'cancelled', 'cancelled_operational'].includes(statusLower)) {
    computedStep = 2;
  } else if (statusLower === 'approved' || statusLower === 'quotation_sent') {
    computedStep = 3;
  } else if (statusLower === 'planning') {
    computedStep = checklist?.isFullyCompliant ? 4 : 3;
  } else if (statusLower === 'confirmed') {
    computedStep = 4;
  } else if (statusLower === 'ready_to_depart' || statusLower === 'ready') {
    computedStep = 5;
  } else if (statusLower === 'in_transit' || statusLower === 'return_pending') {
    computedStep = 5;
  } else if (statusLower === 'completed') {
    computedStep = 6;
  }

  const effectiveStep = Math.max(computedStep, request.activeStepIndex || 2);

  const displayTimeline = [
    { stage: 1, name: language === 'en' ? 'Request Created' : 'Tạo yêu cầu', status: 'completed' },
    {
      stage: 2,
      name: language === 'en' ? 'Manager Approval' : 'Quản lý duyệt',
      status: effectiveStep === 2 ? 'active' : effectiveStep > 2 ? 'completed' : 'pending',
    },
    {
      stage: 3,
      name: language === 'en' ? 'Quarantine & Docs' : 'Kiểm dịch & Hồ sơ',
      status:
        checklist?.isFullyCompliant || effectiveStep > 3
          ? 'completed'
          : effectiveStep === 3
          ? 'active'
          : 'pending',
    },
    {
      stage: 4,
      name: language === 'en' ? 'Trip Planned' : 'Lập lộ trình',
      status:
        statusLower === 'ready_to_depart' || statusLower === 'ready' || statusLower === 'in_transit' || statusLower === 'completed' || effectiveStep > 4
          ? 'completed'
          : effectiveStep === 4
          ? 'active'
          : 'pending',
    },
    {
      stage: 5,
      name: language === 'en' ? 'In Transit' : 'Đang vận chuyển',
      status:
        statusLower === 'completed'
          ? 'completed'
          : effectiveStep === 5
          ? 'active'
          : 'pending',
    },
    {
      stage: 6,
      name: language === 'en' ? 'Handover Completed' : 'Hoàn tất bàn giao',
      status: statusLower === 'completed' ? 'completed' : 'pending',
    },
  ];

  const handleOpenUpload = (horseId?: number | string, regulationId?: number | string) => {
    setReuploadTarget(null);
    setUploadTarget({ horseId, regulationId });
    setIsUploadOpen(true);
  };

  const handleOpenBatchUpload = (horseItem?: any) => {
    const targetHorse = horseItem || checklist?.horses?.find((h) => h.missingRegulations.length > 0) || checklist?.horses?.[0];
    if (!targetHorse) return;
    setBatchTarget({
      horseId: targetHorse.horseId,
      horseName: targetHorse.horseName,
      missingRegulations: targetHorse.missingRegulations || [],
    });
    setIsBatchUploadOpen(true);
  };

  const handleOpenReupload = (doc: any, horseId: number | string) => {
    const resolvedRegulationId = parseOptionalPositiveId(doc.regulationId);
    setReuploadTarget({
      docId: doc.id,
      title: doc.regulationTitle || doc.regulationDocType || doc.docType || (language === 'en' ? 'Document' : 'Hồ sơ'),
      docType: doc.documentTypeCode || doc.regulationDocType || doc.docType || undefined,
      horseId,
      regulationId: resolvedRegulationId,
    });
    setUploadTarget({
      horseId,
      regulationId: resolvedRegulationId,
    });
    setIsUploadOpen(true);
  };

  const handleUploadSuccess = (uploadedDoc: any) => {
    uploadDocumentForRequest(request.requestCode, uploadedDoc.title);
    mutateChecklist();
    mutate();
    setIsUploadOpen(false);
    toast.success(t('requestDetail.uploadSuccess', 'Hồ sơ đã được tải lên thành công!'));
  };

  const handleOpenCancelModal = () => {
    setIsCancelModalOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!request) return;
    setIsCancelling(true);
    try {
      await apiClient(`/orders/${request.id}/cancel`, { method: 'PATCH' });
      await cancelRequest(request.id);
      await refreshHorses();
      await mutate();
      if (mutateChecklist) await mutateChecklist();

      toast.success(
        t('requestDetail.cancelSuccess', `Đơn vận chuyển ${request.requestCode || `#${request.id}`} đã được hủy thành công!`, {
          code: request.requestCode || `#${request.id}`,
        }),
        {
          duration: 5000,
          icon: '✅',
          style: {
            borderRadius: '10px',
            background: '#181A17',
            color: '#fff',
            fontWeight: 600,
            fontSize: '14px',
          },
        }
      );
      setIsCancelModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message || t('requestDetail.cancelError', 'Không thể hủy đơn vận chuyển lúc này. Vui lòng thử lại!'), {
        duration: 5000,
        style: {
          borderRadius: '10px',
          background: '#991b1b',
          color: '#fff',
          fontWeight: 600,
          fontSize: '14px',
        },
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleOpenResubmit = () => {
    setIsResubmitOpen(true);
  };

  // Export quotation HTML / PDF directly from Detail Page
  const exportQuotation = () => {
    const bookingLabel =
      request.bookingType === 'dedicated_charter'
        ? language === 'en' ? 'Dedicated Charter' : 'Bao nguyên xe / chuyến riêng'
        : language === 'en' ? 'Shared Stall' : 'Ghép ô chuồng';
    const horsesRows =
      request.horses
        ?.map(
          (h: any) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #EAE5DA;">${escapeQuotationText(h.horse?.name || h.name)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #EAE5DA;">${escapeQuotationText(translateBreed(h.horse?.breed || h.breed) || '—')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #EAE5DA;">${escapeQuotationText(h.horse?.age ?? h.age ?? '—')} ${language === 'en' ? 'yrs' : 'tuổi'}</td>
      </tr>`
        )
        .join('') ||
      `<tr><td colspan="3" style="padding:12px;color:#787770;text-align:center;">${language === 'en' ? 'No horse information available' : 'Không có thông tin ngựa'}</td></tr>`;

    const orderCodeSafe = escapeQuotationText(request.requestCode || request.id);
    const totalNum = Number(request.totalCost) || 0;
    const freightNum = request.transportCost != null ? Number(request.transportCost) : null;
    const insuranceNum = Number(request.insuranceFee ?? 0);

    const html = `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <title>${language === 'en' ? 'Transport Quotation' : 'Báo Giá Vận Chuyển'} - ${orderCodeSafe}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#181A17;background:#FAF8F4}
    .page{max-width:800px;margin:0 auto;padding:40px;background:#fff}
    .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:24px;border-bottom:3px solid #181A17;margin-bottom:28px}
    .brand-name{font-size:22px;font-weight:800;color:#181A17;letter-spacing:0.04em}
    .brand-sub{font-size:12px;color:#787770;margin-top:3px}
    .doc-title{font-size:24px;font-weight:800;color:#B49A68;text-align:right}
    .doc-id{font-size:13px;color:#57564E;text-align:right;margin-top:4px}
    .section{margin-bottom:24px}
    .section-title{font-size:13px;font-weight:700;text-transform:uppercase;color:#57564E;margin-bottom:10px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{background:#FAF8F4;padding:9px 12px;text-align:left;font-weight:700;color:#57564E;border-bottom:2px solid #EAE5DA}
    .cost-section{background:#FAF8F4;border:2px solid #C4B38E;border-radius:10px;padding:20px;text-align:center;margin:28px 0}
    .cost-value{font-size:28px;font-weight:800;color:#2D5A3F;margin:6px 0}
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="brand-name">EQUITRANSIT LOGISTICS</div>
      <div class="brand-sub">${language === 'en' ? 'Cross-Border Racehorse Transportation System' : 'Hệ thống Vận Chuyển Ngựa Đua Xuyên Quốc Gia'}</div>
    </div>
    <div>
      <div class="doc-title">${language === 'en' ? 'OFFICIAL QUOTATION' : 'BÁO GIÁ VẬN CHUYỂN'}</div>
      <div class="doc-id">${language === 'en' ? 'Order Code:' : 'Mã đơn:'} #${orderCodeSafe}</div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">${language === 'en' ? 'Journey Information' : 'Thông tin hành trình'}</div>
    <p><strong>${language === 'en' ? 'Pickup:' : 'Điểm đón:'}</strong> ${escapeQuotationText(request.origin)} | <strong>${language === 'en' ? 'Destination:' : 'Điểm đến:'}</strong> ${escapeQuotationText(request.destination)}</p>
    <p><strong>${language === 'en' ? 'Departure Date:' : 'Ngày xuất phát:'}</strong> ${escapeQuotationText(request.departureDate)} | <strong>${language === 'en' ? 'Distance:' : 'Quãng đường:'}</strong> ${escapeQuotationText(request.estimatedDistance || '—')}</p>
  </div>
  <div class="section">
    <div class="section-title">${language === 'en' ? `Horse List (${request.horses?.length || 1} horses)` : `Danh sách ngựa (${request.horses?.length || 1} con)`}</div>
    <table>
      <thead><tr><th>${language === 'en' ? 'Horse Name' : 'Tên ngựa'}</th><th>${language === 'en' ? 'Breed' : 'Giống'}</th><th>${language === 'en' ? 'Age' : 'Tuổi'}</th></tr></thead>
      <tbody>${horsesRows}</tbody>
    </table>
  </div>
  <div class="cost-section">
    <p style="font-size:12px;color:#57564E;margin-bottom:4px;">${language === 'en' ? 'Booking Mode:' : 'Hình thức:'} <strong>${escapeQuotationText(bookingLabel)}</strong></p>
    ${request.stallUnitPrice != null ? `<p style="font-size:12px;color:#57564E;">${Number(request.stallUnitPrice).toLocaleString('vi-VN')} VNĐ / ô × ${Number(request.requestedHorseCount ?? request.horses?.length ?? 1)} ${language === 'en' ? 'horses' : 'ngựa'}</p>` : ''}
    <div style="margin-top:6px;">${language === 'en' ? 'Official Transport Quotation' : 'Tổng cước vận chuyển và bảo hiểm'}</div>
    <p style="font-size:12px;color:#57564E;margin-top:4px;">${language === 'en' ? 'Base Freight:' : 'Cước cơ bản:'} ${freightNum == null ? (language === 'en' ? 'Pending quote' : 'Chờ báo giá') : freightNum.toLocaleString('vi-VN') + ' VNĐ'} · ${language === 'en' ? 'Insurance:' : 'Phí bảo hiểm:'} ${insuranceNum.toLocaleString('vi-VN')} VNĐ</p>
    <div class="cost-value">${totalNum > 0 ? totalNum.toLocaleString('vi-VN') + ' VNĐ' : (language === 'en' ? 'Calculating' : 'Đang tính toán')}</div>
    <div style="font-size:12px;color:#57564E;">${language === 'en' ? 'Includes specialized transport vehicle, quarantine isolation stall, and customs clearance.' : 'Bao gồm xe chuyên dụng, chuồng kiểm dịch và thủ tục pháp lý.'}</div>
  </div>
</div>
<script>window.onload=function(){window.print()}</script>
</body>
</html>`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error(language === 'en' ? 'Pop-up blocked by browser. Downloading quotation file...' : 'Trình duyệt đã chặn pop-up. Hệ thống đang tự động tải tệp Báo giá về máy...');
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `BaoGia_${request.requestCode || request.id}.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="flex flex-col gap-5 pb-10">
      {/* TIER 1: COMPACT HEADER (no double breadcrumb) */}
      <header className="border-b border-[#E5DDD0] pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/customer/requests"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5F6977] hover:text-[#181A17] mb-1.5 no-underline transition-colors"
          >
            <ArrowLeft size={13} aria-hidden="true" />
            <span>{isEn ? 'Back to Orders' : 'Quay lại danh sách đơn'}</span>
          </Link>

          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#181A17] tracking-tight m-0">
              {isEn ? `Order ${request.requestCode}` : `Đơn vận chuyển ${request.requestCode}`}
            </h1>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
              style={{
                backgroundColor: isCancelledOrRejected
                  ? '#F8EAEA'
                  : statusLower === 'ready_to_depart' || statusLower === 'ready' || statusLower === 'completed'
                    ? '#E8F2EB'
                    : statusLower === 'in_transit' || statusLower === 'return_pending'
                      ? '#FAF8F4'
                      : isApproved
                        ? '#F3EFE4'
                        : '#FFF7E6',
                color: isCancelledOrRejected
                  ? '#B33E3E'
                  : statusLower === 'ready_to_depart' || statusLower === 'ready' || statusLower === 'completed'
                    ? '#1E563B'
                    : '#8C6621',
                border: isCancelledOrRejected
                  ? '1px solid #E5B8B8'
                  : statusLower === 'ready_to_depart' || statusLower === 'ready' || statusLower === 'completed'
                    ? '1px solid #B7DBC4'
                    : '1px solid #DFCA9A',
              }}
            >
              <Clock size={12} aria-hidden="true" />
              {translateStatus(request.statusLabel || request.status)}
            </span>
            {isAwaitingPayment && !isAlreadyPaid && (
              <PaymentCountdownBadge paymentDueAt={request.paymentDueAt} createdAt={request.createdAt} />
            )}
          </div>
        </div>

        {/* Contextual Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {canTrackGps && (
            <Link
              href={`/customer/tracking?shipmentId=${request.id || requestId}`}
              className="px-3.5 py-2 rounded-xl bg-[#181A17] hover:bg-[#2C2F2A] text-xs font-bold text-[#FAF8F4] inline-flex items-center gap-1.5 transition-colors no-underline"
            >
              <Navigation size={14} className="text-[#D4C5A3]" aria-hidden="true" />
              <span>{isEn ? 'Live GPS Tracking' : 'Theo dõi GPS'}</span>
            </Link>
          )}
          {(isAlreadyPaid || isAwaitingPayment || statusLower === 'refund_requested' || statusLower === 'refunded') && (
            <Link
              href={`/customer/requests/${request.id || requestId}/invoice`}
              className="px-3.5 py-2 rounded-xl border border-[#D8CEBE] bg-white hover:border-[#B49A68] text-xs font-bold text-[#181A17] inline-flex items-center gap-1.5 transition-colors no-underline"
            >
              <FileText size={14} className="text-[#A67C2E]" aria-hidden="true" />
              <span>{isEn ? 'E-Invoice' : 'Hóa đơn điện tử'}</span>
            </Link>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={handleOpenCancelModal}
              className="px-3.5 py-2 rounded-xl border border-[#E5B8B8] bg-[#F8EAEA] hover:bg-[#F3DCDC] text-xs font-bold text-[#B33E3E] cursor-pointer transition-colors"
            >
              {isEn ? 'Cancel Order' : 'Hủy đơn'}
            </button>
          )}
          <button
            type="button"
            onClick={exportQuotation}
            title={isEn ? 'Download PDF Quotation' : 'Tải báo giá PDF'}
            className="px-3.5 py-2 rounded-xl border border-[#D8CEBE] bg-white hover:border-[#B49A68] text-xs font-bold text-[#181A17] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Download size={14} className="text-[#5F6977]" aria-hidden="true" />
            <span>{isEn ? 'PDF Quote' : 'Báo giá PDF'}</span>
          </button>
        </div>
      </header>

      {/* TIER 2: SINGLE CONTEXTUAL STATUS BANNER */}
      {isAwaitingPayment && !isAlreadyPaid && activeTab !== 'payment' ? (
        <div className="rounded-2xl border border-[#DFCA9A] bg-[#FFF9EB] px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#F5E6C4] text-[#8C6621] flex items-center justify-center shrink-0">
              <CreditCard size={16} aria-hidden="true" />
            </div>
            <p className="text-xs sm:text-sm font-bold text-[#181A17] m-0">
              {isEn
                ? 'Order reserved — Complete VietQR payment within 12 hours'
                : 'Đơn đã giữ chỗ — Vui lòng thanh toán VietQR trong 12 giờ'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('payment')}
            className="px-4 py-2 rounded-xl bg-[#181A17] hover:bg-[#2C2F2A] text-[#FAF8F4] text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm"
          >
            <CreditCard size={14} className="text-[#D4C5A3]" aria-hidden="true" />
            <span>{isEn ? 'Pay via VietQR' : 'Thanh toán VietQR'}</span>
          </button>
        </div>
      ) : statusLower === 'change_requested' ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-rose-900 m-0">
                {isEn ? 'Action Required: Logistics Manager Requested Changes' : 'Yêu cầu chỉnh sửa từ Quản lý vận hành'}
              </h2>
              <p className="text-xs text-rose-800 mt-1 mb-0 leading-relaxed">
                <strong>{isEn ? 'Notes:' : 'Ghi chú:'}</strong>{' '}
                {request.changeRequestNotes || (isEn ? 'Please update your request details and resubmit.' : 'Vui lòng cập nhật thông tin yêu cầu và gửi lại.')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleOpenResubmit}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shrink-0 cursor-pointer"
          >
            {isEn ? 'Edit & Resubmit' : 'Chỉnh sửa & Gửi lại'}
          </button>
        </div>
      ) : statusLower === 'refund_requested' ? (
        <div className="bg-[#F8EAEA] border border-[#E5B8B8] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#F0D5D5] text-[#B33E3E] flex items-center justify-center shrink-0 mt-0.5">
              <RotateCcw size={18} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-[#8C2E2E] m-0">
                {isEn ? 'Shipment Cannot Be Fulfilled — 100% Refund Guaranteed' : 'Chuyến đi không thể đáp ứng — Cam kết hoàn tiền 100%'}
              </h2>
              <p className="text-xs text-[#963232] mt-1 mb-0 leading-relaxed">
                {isEn
                  ? 'Please submit your beneficiary bank account to receive your 100% refund within 3–5 business days.'
                  : 'Vui lòng cung cấp số tài khoản ngân hàng thụ hưởng để nhận hoàn trả 100% chi phí trong vòng 3–5 ngày làm việc.'}
              </p>
            </div>
          </div>
          <Link
            href={`/customer/requests/${request.id || requestId}/refund`}
            className="no-underline px-4 py-2.5 rounded-xl bg-[#B33E3E] hover:bg-[#963232] text-white text-xs font-bold shrink-0 transition-colors shadow-sm inline-flex items-center gap-1.5"
          >
            <CreditCard size={14} aria-hidden="true" />
            <span>{isEn ? 'Submit Refund Form' : 'Điền STK hoàn tiền 100%'}</span>
          </Link>
        </div>
      ) : isPaidPendingReview ? (
        <div className="bg-[#E8F2EB] border border-[#B7DBC4] rounded-2xl p-4 flex items-center gap-3 shadow-xs">
          <div className="w-8 h-8 rounded-lg bg-[#D3E8D9] text-[#287653] flex items-center justify-center shrink-0">
            <CheckCircle2 size={18} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xs font-extrabold text-[#1E563B] m-0">
              {isEn ? 'Payment Confirmed — Logistics Feasibility Review' : 'Đã thanh toán thành công — Quản lý vận hành đang thẩm định khả thi'}
            </h2>
            <p className="text-xs text-[#2D5A3F] mt-0.5 mb-0">
              {isEn
                ? 'Your VietQR payment has been verified. Logistics Manager is finalizing vehicle dispatch and quarantine corridors.'
                : 'Thanh toán SePay VietQR đã được xác nhận. Quản lý vận hành đang thẩm định năng lực xe chuyên dụng và lộ trình kiểm dịch.'}
            </p>
          </div>
        </div>
      ) : statusLower === 'refunded' ? (
        <div className="bg-[#FAF8F4] border border-[#D4C5A3] rounded-2xl p-4 flex items-center gap-3 shadow-xs">
          <div className="w-8 h-8 rounded-lg bg-[#EFE9DC] text-[#7A591C] flex items-center justify-center shrink-0">
            <CheckCircle2 size={18} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-xs font-extrabold text-[#7A591C] m-0">
              {isEn ? '100% Refund Completed' : 'Đã hoàn tất hoàn tiền 100%'}
            </h2>
            <p className="text-xs text-[#5C6658] mt-0.5 mb-0">
              {isEn
                ? 'The refund has been transferred to your designated bank account.'
                : 'Tiền cước và bảo hiểm đã được chuyển khoản hoàn trả 100% về tài khoản ngân hàng của quý khách.'}
            </p>
          </div>
        </div>
      ) : isCancelledOrRejected ? (
        <div className="bg-[#F8EAEA] border border-[#E5B8B8] rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-[#B33E3E] shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-xs text-[#8C2E2E]">
            <strong className="block mb-0.5">
              {statusLower === 'rejected'
                ? isEn ? 'Order Rejected' : 'Đơn hàng bị từ chối'
                : isEn ? 'Order Cancelled' : 'Đơn hàng đã hủy'}
            </strong>
            <span>
              {request.rejectionReason ||
                request.cancellationReason ||
                (isEn
                  ? 'Horses and reserved vehicles have been released.'
                  : 'Ngựa và xe giữ chỗ đã được giải phóng về trạng thái sẵn sàng.')}
            </span>
          </div>
        </div>
      ) : null}

      {/* TIER 2.5: SURFACE REFUND BANK-INFO CTA DIRECTLY ON OVERVIEW FOR CANCELLED / RETURN-CANCELLED ORDERS */}
      {activeTab !== 'payment' &&
        (['cancelled_operational', 'refund_requested', 'refunded'].includes(statusLower) ||
          request.returnStatus === 'cancelled') &&
        Number.isInteger(Number(request.id)) &&
        Number(request.id) > 0 && (
          <CustomerRefundSummaryCard shipmentId={Number(request.id)} />
        )}

      {/* TIER 3: COMPACT SUMMARY STRIP */}
      <div className="bg-white rounded-2xl border border-[#E5DDD0] px-4 py-3.5 shadow-xs grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="min-w-0">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#747D88] block">
            {isEn ? 'Route' : 'Lộ trình'}
          </span>
          <span className="font-bold text-[#181A17] truncate block mt-0.5" title={`${request.origin} → ${request.destination}`}>
            {(request.origin || '').split(',')[0]} → {(request.destination || '').split(',')[0]}
          </span>
        </div>
        <div>
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#747D88] block">
            {isEn ? 'Departure' : 'Khởi hành'}
          </span>
          <span className="font-bold text-[#181A17] block mt-0.5">
            {request.departureDate} · {request.requestedHorseCount || request.horses?.length || 1} {isEn ? 'horse(s)' : 'ngựa'}
          </span>
        </div>
        <div>
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#747D88] block">
            {isEn ? 'Quarantine Docs' : 'Hồ sơ kiểm dịch'}
          </span>
          <span className={`font-bold block mt-0.5 ${checklist?.isFullyCompliant ? 'text-[#287653]' : totalMissingCount > 0 ? 'text-[#B33E3E]' : 'text-[#5F6977]'}`}>
            {checklist?.isFullyCompliant
              ? isEn ? '100% Compliant' : 'Đạt chuẩn 100%'
              : totalMissingCount > 0
                ? isEn ? `${totalMissingCount} missing` : `Còn thiếu ${totalMissingCount}`
                : isApproved
                  ? isEn ? 'In review' : 'Đang rà soát'
                  : isEn ? 'Pending order approval' : 'Chờ duyệt đơn'}
          </span>
        </div>
        <div>
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#747D88] block">
            {isEn ? 'Total & Payment' : 'Tổng tiền & Thanh toán'}
          </span>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <strong className="font-mono text-[#181A17] whitespace-nowrap">
              {Number(request.totalCost) > 0
                ? `${Number(request.totalCost).toLocaleString('vi-VN')}\u00A0đ`
                : isEn ? 'Pending' : 'Chờ báo giá'}
            </strong>
            {isAlreadyPaid && (
              <span className="px-1.5 py-0.5 rounded bg-[#E8F2EB] text-[#1E563B] text-[10px] font-extrabold">
                {isEn ? 'PAID' : 'ĐÃ TT'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ─── 4 CLEAR LIFECYCLE TABS ─────────────────────────── */}
      <div className="flex items-center gap-5 border-b border-[#E5DDD0] overflow-x-auto w-full">
        {[
          {
            id: 'overview',
            label: isEn ? 'Overview' : 'Tổng quan',
            icon: Route,
            count: null,
          },
          {
            id: 'horses',
            label: isEn ? 'Horses & Insurance' : 'Ngựa & Bảo hiểm',
            icon: ShieldCheck,
            count: request.horses?.length || request.requestedHorseCount || 1,
          },
          {
            id: 'documents',
            label: isEn ? 'Documents' : 'Hồ sơ',
            icon: FileText,
            count: totalMissingCount > 0 ? (isEn ? `${totalMissingCount} missing` : `${totalMissingCount} thiếu`) : null,
            alert: totalMissingCount > 0 || totalRejectedCount > 0,
          },
          {
            id: 'payment',
            label: isEn ? 'Payment' : 'Thanh toán',
            icon: CreditCard,
            count: isAlreadyPaid
              ? isEn ? 'Paid' : 'Đã TT'
              : needsPaymentNow
                ? isEn ? 'Pay' : 'Cần TT'
                : null,
            highlight: isAlreadyPaid,
            alert: needsPaymentNow,
          },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          const IconComp = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-3 pt-1 text-xs sm:text-sm whitespace-nowrap transition-colors inline-flex items-center gap-2 cursor-pointer border-b-2 -mb-[1px] bg-transparent ${
                isActive
                  ? 'border-[#181A17] text-[#181A17] font-bold'
                  : 'border-transparent text-[#5F6977] hover:text-[#181A17] font-semibold'
              }`}
            >
              <IconComp size={15} className={isActive ? 'text-[#A67C2E]' : ''} aria-hidden="true" />
              <span>{tab.label}</span>
              {tab.count !== null && tab.count !== undefined && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                    tab.alert
                      ? 'bg-[#F8EAEA] text-[#B33E3E]'
                      : tab.highlight
                        ? 'bg-[#E8F2EB] text-[#1E563B]'
                        : isActive
                          ? 'bg-[#181A17] text-white'
                          : 'bg-[#F0EEE8] text-[#5F6977]'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── TAB 1: TỔNG QUAN ────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 flex flex-col gap-5">
            {/* Compact Details Card (non-duplicated fields only) */}
            <div className="bg-white rounded-2xl border border-[#E5DDD0] p-5 shadow-sm grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-[#747D88] block">{t('customer.table.createdDate', 'Ngày tạo')}</span>
                <strong className="text-[#181A17] mt-0.5 block">{request.createdDate || '—'}</strong>
              </div>
              <div>
                <span className="text-[#747D88] block">{t('customer.table.transportType', 'Phạm vi')}</span>
                <strong className="text-[#181A17] mt-0.5 block">{translateTransportType(request.transportationType)}</strong>
              </div>
              <div>
                <span className="text-[#747D88] block">{t('customer.table.estimatedArrival', 'Dự kiến đến')}</span>
                <strong className="text-[#181A17] mt-0.5 block">{request.estimatedArrivalDate || '—'}</strong>
              </div>
              <div>
                <span className="text-[#747D88] block">{isEn ? 'Distance' : 'Quãng đường'}</span>
                <strong className="text-[#181A17] mt-0.5 block">{request.estimatedDistance || '—'}</strong>
              </div>
              <div className="col-span-2 sm:col-span-4 pt-3 border-t border-[#EFEAE0] text-xs text-[#181A17] font-semibold flex items-center gap-2 flex-wrap">
                <span>{request.origin}</span>
                <ArrowRight size={13} className="text-[#A67C2E] shrink-0" aria-hidden="true" />
                <span>{request.destination}</span>
              </div>
            </div>

            {/* Step 11 Vertical Journey Timeline */}
            <div className="bg-white rounded-2xl border border-[#E5DDD0] p-5 sm:p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-[#E5DDD0]">
                <h4 className="text-sm font-bold text-[#181A17] m-0 flex items-center gap-2">
                  <FileCheck2 size={16} className="text-[#A67C2E]" aria-hidden="true" />
                  {isEn ? 'Journey Timeline' : 'Tiến trình vận chuyển'}
                </h4>
                {canTrackGps && (
                  <Link
                    href={`/customer/tracking?shipmentId=${request.id || requestId}`}
                    className="px-3 py-1.5 rounded-lg bg-[#FAF8F4] text-[#A67C2E] text-xs font-semibold border border-[#D4C5A3] hover:bg-[#F5EFE2] transition-colors no-underline"
                  >
                    {isEn ? 'Live GPS Map →' : 'Bản đồ GPS →'}
                  </Link>
                )}
              </div>
              <VerticalTimeline
                items={activeTimelineItems}
                viewer="customer"
                compact={!isTransitOrBeyond}
              />
            </div>

            {/* Step 5 Round-Trip Management */}
            <RoundTripPanel
              order={request}
              userRole="customer"
              onRefresh={() => mutate()}
            />

            {/* Special Requirements (only render when customer actually provided notes) */}
            {request.specialRequirements && String(request.specialRequirements).trim().length > 0 && (
              <div className="bg-white rounded-2xl border border-[#E5DDD0] p-5 shadow-sm">
                <span className="text-xs font-bold uppercase tracking-wider text-[#747D88] block mb-2">
                  {t('requestDetail.specialRequirementsTitle', 'Yêu cầu đặc biệt')}
                </span>
                <p className="text-xs text-[#181A17] m-0 leading-relaxed">{request.specialRequirements}</p>
              </div>
            )}
          </div>

          {/* Right column: Activity / Audit History */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            <div className="bg-white rounded-2xl border border-[#E5DDD0] p-6 shadow-sm">
              <h4 className="text-sm font-bold text-[#181A17] m-0 mb-5">
                {t('requestDetail.auditHistoryTitle', 'Lịch sử hoạt động')}
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', paddingLeft: '22px' }}>
                <div style={{ position: 'absolute', top: '8px', bottom: '8px', left: '7px', width: '2px', backgroundColor: '#D8CEBE' }} />

                {request.activities && request.activities.length > 0 ? (
                  request.activities.map((act: any, index: number) => (
                    <div key={act.id || index} style={{ position: 'relative' }}>
                      <div
                        style={{
                          position: 'absolute',
                          left: '-19px',
                          top: '4px',
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: index === 0 ? 'var(--primary)' : '#D8CEBE',
                          boxShadow: '0 0 0 3px #ffffff',
                        }}
                      />
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>{act.timestamp}</span>
                      <div style={{ fontSize: '13.5px', color: 'var(--text-heading)', fontWeight: 500, marginTop: '2px' }}>
                        {act.description}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{act.actor}</div>
                    </div>
                  ))
                ) : (
                  <div>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>
                      {t('requestDetail.createdAuditMsg', `Đơn hàng đã được khởi tạo thành công lúc {date}.`, {
                        date: request.createdDate,
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: ĐÀN CHIẾN MÃ ───────────────────────────────────── */}
      {activeTab === 'horses' && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-5">
            <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-sm">
              <div className="px-6 py-4 bg-white border-b border-[#EFEAE0] flex justify-between items-center">
                <h4 className="text-sm font-bold text-[#181A17] m-0">
                  {language === 'en'
                    ? `Transport Equine Roster (${request.horses?.length || request.requestedHorseCount || 1} horses)`
                    : `Danh sách ngựa vận chuyển (${request.horses?.length || request.requestedHorseCount || 1} con)`}
                </h4>
              </div>

              <div className="overflow-x-auto w-full">
                <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('customer.table.horse', 'Chiến mã')}</th>
                      <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('customer.table.breed', 'Giống')}</th>
                      <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('customer.table.age', 'Tuổi')}</th>
                      <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('customer.table.medicalStatus', 'Sức khỏe')}</th>
                      <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('customer.table.profile', 'Hồ sơ')}</th>
                      <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'right' }}>{language === 'en' ? 'Actions' : 'Thao tác'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {request.horses?.map((item: any, idx: number) => {
                      const horse = item.horse || item;
                      return (
                        <tr
                          key={horse.id || horse.horseId || idx}
                          style={{
                            borderBottom: '1px solid var(--border-light)',
                            backgroundColor: !item.isComplete ? '#fff5f5' : 'transparent',
                          }}
                        >
                          <td style={{ padding: '16px 20px' }}>
                            <Link
                              href={`/customer/horses/${horse.id || horse.horseId || ''}`}
                              style={{ fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}
                              title={language === 'en' ? 'View horse profile' : 'Xem hồ sơ ngựa'}
                            >
                              {horse.name}
                            </Link>
                          </td>
                          <td style={{ padding: '16px 20px', color: 'var(--text-body)' }}>{translateBreed(horse.breed)}</td>
                          <td style={{ padding: '16px 20px', color: 'var(--text-body)' }}>
                            {horse.age} {t('common.yearsOld', 'tuổi')}
                          </td>
                          <td style={{ padding: '16px 20px' }}>
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                backgroundColor: item.medicalStatus === 'Healthy' ? '#dcfce7' : '#fef3c7',
                                color: item.medicalStatus === 'Healthy' ? '#15803d' : '#b45309',
                              }}
                            >
                              {item.medicalStatus === 'Healthy' || !item.medicalStatus
                                ? isEn ? 'Healthy' : 'Khỏe mạnh'
                                : item.medicalStatus}
                            </span>
                          </td>
                          <td style={{ padding: '16px 20px' }}>
                            {(() => {
                              const horseChecklist = checklist?.horses?.find(
                                (h) => String(h.horseId) === String(horse.id || horse.horseId)
                              );
                              if (isPendingReview) {
                                return (
                                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Clock size={14} /> {language === 'en' ? 'Awaiting approval' : 'Chờ duyệt yêu cầu'}
                                  </span>
                                );
                              }
                              if (!checklist || !requirementsSent) {
                                return (
                                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#A67C2E', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Clock size={14} /> {language === 'en' ? 'Awaiting regulation issuance' : 'Chờ ban hành hồ sơ'}
                                  </span>
                                );
                              }
                              const approvedDocs = horseChecklist?.documents?.filter((d: any) => d.status === 'approved')?.length || 0;
                              const totalDocs = (horseChecklist?.missingRegulations?.length || 0) + (horseChecklist?.documents?.length || 0);
                              return (
                                <span style={{ fontSize: '12px', fontWeight: 600, color: horseChecklist?.isCompliant ? '#15803d' : '#d97706', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  {horseChecklist?.isCompliant ? <Check size={14} /> : <Clock size={14} />} {approvedDocs}/{totalDocs} {language === 'en' ? 'Approved' : 'Đã duyệt'}
                                </span>
                              );
                            })()}
                          </td>
                          <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                            <Link
                              href={`/customer/horses/${horse.id || horse.horseId || ''}`}
                              style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '13px' }}
                            >
                              {language === 'en' ? 'View Profile' : 'Xem hồ sơ'}
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Booking & Insurance Policies Summary */}
            <BookingSummary
              bookingType={request.bookingType}
              horseCount={Number(request.requestedHorseCount ?? request.horses?.length ?? 1)}
              stallUnitPrice={request.stallUnitPrice}
              status={request.status}
              departureDate={request.departureDate}
            />
            <InsuranceSummary
              horses={request.insuranceHorses ?? []}
              transportCost={request.transportCost ?? null}
              insuranceFee={Number(request.insuranceFee ?? 0)}
              totalCost={Number(request.totalCost ?? 0)}
              showCostSummary={false}
            />

            {/* Flow 6 Per-Horse Delivery Handover & Acceptance (only when in_transit / return_pending / completed) */}
            {canShowHandoverAndClaims && Number(request.id || request.shipmentId || requestId) > 0 && (
              <DeliveryHandoverPanel
                role="customer"
                shipmentId={Number(request.id || request.shipmentId || requestId)}
                shipmentStatus={statusLower}
              />
            )}

            {/* Step 6 Insurance Claims Management (only when in_transit / return_pending / completed) */}
            {canShowHandoverAndClaims && (
              <CustomerClaimsList
                shipmentId={Number(request.id || request.shipmentId || requestId)}
                shipmentStatus={statusLower}
                deliveredAt={request.actualArrivalDate || request.updatedAt}
                horses={request.insuranceHorses || []}
              />
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 3: HỒ SƠ KIỂM DỊCH & GIẤY TỜ ──────────────────────── */}
      {activeTab === 'documents' && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-6">
            <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-sm">
              <div className="px-6 py-4 bg-white border-b border-[#EFEAE0] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={17} className="text-[#A67C2E]" aria-hidden="true" />
                  <h4 className="text-sm font-bold text-[#181A17] m-0">
                    {t('requestDetail.complianceTitle', 'Hồ sơ kiểm dịch & Giấy tờ')}
                  </h4>
                </div>
                {checklist && isApproved && requirementsSent && (
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: 700,
                      backgroundColor: checklist.isFullyCompliant ? '#dcfce7' : '#fef3c7',
                      color: checklist.isFullyCompliant ? '#15803d' : '#b45309',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {checklist.isFullyCompliant ? (
                      <>
                        <CheckCircle2 size={13} /> {language === 'en' ? '100% Compliant' : 'Đạt chuẩn 100%'}
                      </>
                    ) : (
                      <>
                        <Clock size={13} /> {checklist.approvedDocumentsCount}/{checklist.totalRequiredDocuments} {language === 'en' ? 'Approved' : 'Đã duyệt'}
                      </>
                    )}
                  </span>
                )}
              </div>

              {/* CASE 1: Runtime In-Transit Compliance Alert */}
              {checklist && checklist.inTransitComplianceAlert && (
                <div style={{ padding: '12px 20px', borderBottom: '1px solid #EAE5DA', backgroundColor: '#FAF8F4', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div
                    role="alert"
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      color: '#991b1b',
                      fontSize: '12.5px',
                      fontWeight: 600,
                    }}
                  >
                    {language === 'en'
                      ? 'Alert: A required compliance document expired during transport. Please upload an updated certificate immediately so border/quarantine clearance can proceed.'
                      : 'Cảnh báo: Hồ sơ kiểm dịch đã hết hạn trong quá trình vận chuyển. Vui lòng nộp bản gia hạn ngay để không bị chặn thông quan cửa khẩu.'}
                  </div>
                </div>
              )}

              {isAwaitingPayment && !isAlreadyPaid ? (
                <div className="p-7 text-center bg-[#FFFDF8]">
                  <div className="w-12 h-12 rounded-xl bg-[#FFF3D6] text-[#8C6621] flex items-center justify-center mx-auto mb-3">
                    <CreditCard size={22} aria-hidden="true" />
                  </div>
                  <h5 className="text-sm font-extrabold text-[#181A17] m-0 mb-1.5">
                    {isEn
                      ? 'Complete Payment to Activate Quarantine Checklist'
                      : 'Hoàn tất thanh toán để khởi tạo danh mục kiểm dịch'}
                  </h5>
                  <p className="text-xs text-[#5F6977] max-w-md mx-auto leading-relaxed mb-4">
                    {isEn
                      ? 'Your order is currently awaiting payment (12-hour hold). Once payment is confirmed, Logistics Manager will review feasibility and issue the official quarantine checklist.'
                      : 'Đơn hàng đang chờ thanh toán (giữ chỗ 12 giờ). Ngay khi thanh toán được xác nhận, Quản lý vận hành sẽ thẩm định khả thi và ban hành danh mục hồ sơ kiểm dịch.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('payment')}
                    className="px-4 py-2 rounded-xl bg-[#181A17] hover:bg-[#2C2F2A] text-[#FAF8F4] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <CreditCard size={14} className="text-[#D4C5A3]" aria-hidden="true" />
                    <span>{isEn ? 'Go to Payment Tab' : 'Mở tab Thanh toán'}</span>
                  </button>
                </div>
              ) : isCancelledOrRejected ? (
                <div className="p-7 text-center bg-[#FAF8F4]">
                  <div className="w-12 h-12 rounded-xl bg-[#F8EAEA] text-[#B33E3E] flex items-center justify-center mx-auto mb-3">
                    <AlertTriangle size={22} aria-hidden="true" />
                  </div>
                  <h5 className="text-sm font-extrabold text-[#181A17] m-0 mb-1.5">
                    {isEn ? 'Quarantine Checklist Inactive' : 'Hồ sơ kiểm dịch không còn hiệu lực'}
                  </h5>
                  <p className="text-xs text-[#5F6977] max-w-md mx-auto leading-relaxed m-0">
                    {isEn
                      ? 'This order has been cancelled, rejected, or moved to refund processing.'
                      : 'Đơn hàng đã hủy, bị từ chối hoặc đang xử lý hoàn tiền nên không yêu cầu nộp hồ sơ kiểm dịch.'}
                  </p>
                </div>
              ) : isPendingReview || !isApproved ? (
                <div className="p-7 text-center bg-[#fcfcfc]">
                  <div className="w-12 h-12 rounded-xl bg-[#fef3c7] text-[#d97706] flex items-center justify-center mx-auto mb-3">
                    <Clock size={22} aria-hidden="true" />
                  </div>
                  <h5 className="text-sm font-extrabold text-[#181A17] m-0 mb-1.5">
                    {isPaidPendingReview
                      ? isEn
                        ? 'Payment Received — Logistics Manager Reviewing Feasibility'
                        : 'Đã thanh toán — Quản lý vận hành đang thẩm định khả thi'
                      : isEn
                        ? 'Awaiting Logistics Manager Approval'
                        : 'Đang chờ Quản lý vận hành phê duyệt yêu cầu'}
                  </h5>
                  <p className="text-xs text-[#5F6977] max-w-md mx-auto leading-relaxed m-0">
                    {isEn
                      ? 'Your shipment request is under operational review. Once approved, Logistics Manager will issue the required quarantine document checklist.'
                      : 'Đơn vận chuyển đang được rà soát. Ngay sau khi được phê duyệt, Quản lý vận hành sẽ ban hành danh mục hồ sơ kiểm dịch cần nộp.'}
                  </p>
                </div>
              ) : !requirementsSent ? (
                /* CASE 2: Approved, waiting for checklist establishment */
                <div className="p-7 text-center bg-[#F0EEE8]">
                  <div className="w-12 h-12 rounded-xl bg-[#F5EFE2] text-[#8C6621] flex items-center justify-center mx-auto mb-3">
                    <Sparkles size={22} aria-hidden="true" />
                  </div>
                  <h5 className="text-sm font-extrabold text-[#181A17] m-0 mb-1.5">
                    {isEn
                      ? 'Order Approved — Logistics Manager is configuring document checklist'
                      : 'Đơn đã duyệt — Quản lý vận hành đang thiết lập danh mục hồ sơ'}
                  </h5>
                  <p className="text-xs text-[#5F6977] max-w-lg mx-auto leading-relaxed m-0">
                    {isEn
                      ? `Logistics Manager is reviewing quarantine rules for ${translateCountry(checklist?.destinationCountry) || request.destination}. You will be notified once the checklist is issued.`
                      : `Quản lý vận hành đang rà soát quy chuẩn kiểm dịch tại ${translateCountry(checklist?.destinationCountry) || request.destination}. Bạn sẽ nhận được thông báo ngay khi danh mục được ban hành.`}
                  </p>
                </div>
              ) : (
                /* CASE 3: Active checklist */
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div
                    style={{
                      padding: '14px 20px',
                      backgroundColor: '#f0fdf4',
                      borderBottom: '1px solid #bbf7d0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <CheckCircle2 size={18} color="#16a34a" style={{ flexShrink: 0 }} />
                      <p style={{ fontSize: '13px', color: '#166534', margin: 0, lineHeight: 1.4 }}>
                        {language === 'en' ? (
                          <>
                            <strong>Official document checklist issued by Logistics Manager</strong> for transit to{' '}
                            <strong>{translateCountry(checklist?.destinationCountry) || request.destination}</strong>.
                          </>
                        ) : (
                          <>
                            <strong>Danh mục hồ sơ chính thức do Quản lý vận hành yêu cầu</strong> cho hành trình đến{' '}
                            <strong>{translateCountry(checklist?.destinationCountry) || request.destination}</strong>.
                          </>
                        )}
                      </p>
                    </div>

                    {totalMissingCount > 0 && (
                      <button
                        type="button"
                        onClick={() => handleOpenBatchUpload()}
                        style={{
                          padding: '7px 14px',
                          borderRadius: '8px',
                          backgroundColor: '#287653',
                          color: '#ffffff',
                          fontSize: '12px',
                          fontWeight: 700,
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 6px rgba(40, 118, 83, 0.25)',
                        }}
                      >
                        <Upload size={13} aria-hidden="true" /> {t('documents.batchUploadAll', 'Nộp trọn bộ hồ sơ')}
                      </button>
                    )}
                  </div>

                  {checklist?.horses && checklist.horses.length > 0 ? (
                    checklist.horses.map((horseItem, hIdx) => {
                      return (
                        <div
                          key={horseItem.horseId}
                          style={{
                            borderBottom: hIdx < (checklist?.horses?.length || 0) - 1 ? '1px solid var(--border-light)' : 'none',
                          }}
                        >
                          <div
                            style={{
                              padding: '12px 24px',
                              backgroundColor: '#fafafa',
                              borderBottom: '1px solid #F0EEE8',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: '10px',
                            }}
                          >
                            <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-heading)' }}>
                              {language === 'en' ? 'Horse' : 'Ngựa'}: {horseItem.horseName}
                            </span>
                            {!horseItem.isCompliant && horseItem.missingRegulations.length > 0 && (
                              <button
                                type="button"
                                onClick={() => handleOpenBatchUpload(horseItem)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  backgroundColor: '#A67C2E',
                                  color: '#ffffff',
                                  fontSize: '11.5px',
                                  fontWeight: 600,
                                  border: 'none',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <Upload size={12} aria-hidden="true" /> {language === 'en' ? `Upload All (${horseItem.missingRegulations.length} items)` : `Nộp tất cả (${horseItem.missingRegulations.length} mục)`}
                              </button>
                            )}
                          </div>

                          {/* Missing regulations */}
                          {horseItem.missingRegulations.map((reg) => {
                            const deferredMatch = Array.isArray(request.deferredDocuments)
                              ? request.deferredDocuments.find(
                                  (d: any) =>
                                    Number(d.horseId) === Number(horseItem.horseId) &&
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
                            const isDeferredOverdue = Boolean(
                              deferredMatch?.submitDeadline &&
                                String(deferredMatch.submitDeadline).slice(0, 10) < todayIct,
                            );
                            return (
                            <div
                              key={`missing-${reg.id}`}
                              className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-[#F0EEE8] bg-[#fff5f5]"
                            >
                              <div className="flex items-center gap-3.5 flex-1 min-w-[200px]">
                                <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <AlertTriangle size={18} aria-hidden="true" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h5 style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>
                                      {translateDocType(reg.documentType, reg.description) || reg.description || reg.documentType}
                                    </h5>
                                    {deferredMatch && (
                                      <span
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold border ${
                                          isDeferredOverdue
                                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                                            : 'bg-amber-50 text-amber-800 border-amber-200'
                                        }`}
                                      >
                                        <Clock size={10} />
                                        {isEn ? 'Submit later' : 'Nộp sau'}
                                        {deferredMatch.submitDeadline
                                          ? ` · ${isEn ? 'Due' : 'Hạn'} ${deferredMatch.submitDeadline}`
                                          : ''}
                                      </span>
                                    )}
                                  </div>
                                  <p style={{ fontSize: '11.5px', color: '#dc2626', margin: '2px 0 0 0' }}>
                                    {language === 'en'
                                      ? `Mandatory per regulations of ${translateCountry(reg.country)}`
                                      : `Bắt buộc theo quy định ${translateCountry(reg.country)}`}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleOpenUpload(horseItem.horseId, reg.id)}
                                style={{
                                  padding: '6px 14px',
                                  borderRadius: '6px',
                                  backgroundColor: '#dc2626',
                                  color: '#ffffff',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  border: 'none',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <Upload size={13} aria-hidden="true" /> {language === 'en' ? 'Upload Now' : 'Tải lên ngay'}
                              </button>
                            </div>
                            );
                          })}

                          {/* Uploaded items */}
                          {horseItem.documents.map((doc, docIdx) => {
                            const isDocApproved = doc.status === 'approved';
                            const isDocSubmitted = doc.status === 'submitted';
                            const isDocRejected = doc.status === 'rejected';

                            return (
                              <div
                                key={`doc-${doc.id}-${doc.regulationId ?? 'none'}-${docIdx}`}
                                className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-[#F0EEE8]"
                              >
                                <div className="flex items-center gap-3.5 flex-1 min-w-[200px]">
                                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: isDocApproved ? '#dcfce7' : isDocRejected ? '#fee2e2' : '#F0EEE8', color: isDocApproved ? '#15803d' : isDocRejected ? '#dc2626' : '#5F6977', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <FileText size={18} aria-hidden="true" />
                                  </div>
                                  <div className="min-w-0">
                                    <h5 style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>
                                      {translateDocType(doc.regulationTitle || doc.docType)}
                                    </h5>
                                    <p style={{ fontSize: '11.5px', color: '#5F6977', margin: '2px 0 0 0' }}>
                                      {doc.docNumber ? `${t('documents.number', 'Số')}: ${doc.docNumber} • ` : ''}{t('documents.uploadedAt', 'Tải lên')}: {new Date(doc.createdAt).toLocaleDateString(language === 'en' ? 'en-US' : 'vi-VN')}
                                      {doc.reviewerNotes && (
                                        <span style={{ color: isDocRejected ? '#dc2626' : '#A67C2E', marginLeft: '6px' }}>
                                          ({t('documents.reviewerNote', 'Ghi chú')}: {translateRejectionReason(doc.reviewerNotes) || doc.reviewerNotes})
                                        </span>
                                      )}
                                    </p>
                                    {(doc.isExpiredForTrip || doc.isExpiringSoonForTrip) && doc.expiryNotice && (
                                      <p className={`text-[11.5px] mt-1 mb-0 font-semibold ${doc.isExpiredForTrip ? 'text-[#B33E3E]' : 'text-[#966516]'}`}>
                                        {doc.expiryNotice}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  {doc.fileUrl && (
                                    <button
                                      type="button"
                                      onClick={() => openAuthenticatedDocument(doc.id, doc.fileUrl)}
                                      style={{
                                        padding: '5px 10px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-light)',
                                        color: 'var(--primary)',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        cursor: 'pointer',
                                        backgroundColor: '#ffffff',
                                      }}
                                    >
                                      <Eye size={13} aria-hidden="true" /> {t('documents.viewFile', 'Xem tệp')}
                                    </button>
                                  )}

                                  {(isDocRejected || isDocSubmitted) && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenReupload(doc, horseItem.horseId)}
                                      style={{
                                        padding: '5px 10px',
                                        borderRadius: '6px',
                                        backgroundColor: isDocRejected ? '#dc2626' : '#FAF8F4',
                                        color: isDocRejected ? '#ffffff' : '#A67C2E',
                                        border: isDocRejected ? 'none' : '1px solid #D4C5A3',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                      }}
                                    >
                                      <RefreshCw size={12} aria-hidden="true" /> {isDocRejected ? t('documents.resubmit', 'Nộp lại') : t('documents.update', 'Cập nhật')}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                      {t('documents.noRegulations', 'Chưa có danh mục hồ sơ được khởi tạo.')}
                    </div>
                  )}
                </div>
              )}
              {/* Early Supplement Panel: allow uploading deferred / vault documents immediately even while awaiting payment or manager review */}
              {!isCancelledOrRejected && (isAwaitingPayment || isPendingReview || !isApproved || !requirementsSent) && (
                <div className="border-t border-[#EFEAE0] bg-[#FAF8F4] px-6 py-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h5 className="text-xs font-extrabold uppercase tracking-wider text-[#181A17] m-0 flex items-center gap-1.5">
                        <Upload size={14} className="text-[#A67C2E]" aria-hidden="true" />
                        <span>
                          {isEn
                            ? 'Upload Deferred & Horse Documents Early'
                            : 'Nộp bổ sung hồ sơ sớm (giấy tờ chọn Nộp sau)'}
                        </span>
                      </h5>
                      <p className="text-xs text-[#5F6977] mt-1 mb-0">
                        {isEn
                          ? 'Documents uploaded to your horse vault are automatically attached to this order once reviewed — no need to wait.'
                          : 'Giấy tờ tải lên kho hồ sơ ngựa sẽ tự động khớp vào đơn hàng ngay khi được thẩm định — bạn không cần chờ đến bước sau.'}
                      </p>
                    </div>
                  </div>

                  {Array.isArray(request.deferredDocuments) && request.deferredDocuments.length > 0 ? (
                    <div className="rounded-xl border border-[#DFCA9A] bg-white divide-y divide-[#EFEBE4] overflow-hidden">
                      {request.deferredDocuments.map((def: any, idx: number) => {
                        const matchedHorse = request.horses?.find(
                          (item: any) => Number(item.horse?.id || item.horseId) === Number(def.horseId),
                        );
                        const horseName = matchedHorse?.horse?.name || `#${def.horseId}`;
                        const horseChecklist = checklist?.horses?.find(
                          (h) => Number(h.horseId) === Number(def.horseId),
                        );
                        const uploadedDoc = horseChecklist?.documents?.find(
                          (d: any) =>
                            String(d.documentTypeCode || d.regulationDocType || d.docType || '').toLowerCase() ===
                              String(def.documentTypeCode || '').toLowerCase() &&
                            (d.status === 'approved' || d.status === 'submitted') &&
                            !d.isExpiredForTrip,
                        );
                        const todayIct = new Intl.DateTimeFormat('en-CA', {
                          timeZone: 'Asia/Ho_Chi_Minh',
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        }).format(new Date());
                        const isOverdue = Boolean(
                          !uploadedDoc &&
                            def.submitDeadline &&
                            String(def.submitDeadline).slice(0, 10) < todayIct,
                        );

                        return (
                          <div
                            key={`${def.horseId}_${def.documentTypeCode}_${idx}`}
                            className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold text-[#181A17]">
                                  {def.documentTypeName || translateDocType(def.documentTypeCode) || def.documentTypeCode}
                                </span>
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#FAF8F4] border border-[#E5DDD0] text-[#5F6977]">
                                  {horseName}
                                </span>
                                {uploadedDoc ? (
                                  <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                    <CheckCircle2 size={11} />
                                    {uploadedDoc.status === 'approved'
                                      ? isEn ? 'Approved' : 'Đã duyệt'
                                      : isEn ? 'Uploaded · Pending review' : 'Đã nộp · Chờ duyệt'}
                                  </span>
                                ) : (
                                  <span
                                    className={`inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full border ${
                                      isOverdue
                                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                                        : 'bg-amber-50 text-amber-800 border-amber-200'
                                    }`}
                                  >
                                    <Clock size={10} />
                                    {def.submitDeadline
                                      ? `${isEn ? 'Due' : 'Hạn nộp'}: ${def.submitDeadline}`
                                      : isEn ? 'Submit later' : 'Nộp bổ sung sau'}
                                  </span>
                                )}
                              </div>
                            </div>

                            {!uploadedDoc && (
                              <button
                                type="button"
                                onClick={() =>
                                  setEarlyUploadModal({
                                    isOpen: true,
                                    horseId: Number(def.horseId),
                                    documentTypeCode: def.documentTypeCode,
                                  })
                                }
                                className="px-3 py-1.5 rounded-lg bg-[#181A17] hover:bg-[#2C2F2A] text-[#FAF8F4] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                              >
                                <Upload size={12} className="text-[#D4C5A3]" aria-hidden="true" />
                                <span>{isEn ? 'Upload Now' : 'Tải lên ngay'}</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(request.horses || []).map((item: any, idx: number) => {
                        const h = item.horse || item;
                        const hId = Number(h.id || h.horseId || 0);
                        if (!hId) return null;
                        return (
                          <button
                            key={hId || idx}
                            type="button"
                            onClick={() => setEarlyUploadModal({ isOpen: true, horseId: hId })}
                            className="px-3.5 py-2 rounded-xl border border-[#D8CEBE] bg-white hover:border-[#A67C2E] text-xs font-bold text-[#181A17] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <Upload size={13} className="text-[#A67C2E]" aria-hidden="true" />
                            <span>
                              {isEn ? `Upload docs for ${h.name}` : `Nộp sớm hồ sơ cho ${h.name}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 4: THANH TOÁN, HÓA ĐƠN & HOÀN TIỀN ──────────────────────────── */}
      {activeTab === 'payment' && (
        <div className="flex flex-col gap-5">
          {/* Inline SePay VietQR Checkout ONLY when awaiting payment / unpaid & payable */}
          {isAlreadyPaid ? (
            <div className="rounded-2xl border border-[#B7DBC4] bg-[#E8F2EB] p-5 flex items-center gap-3 shadow-xs">
              <CheckCircle2 size={20} className="text-[#287653] shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-extrabold text-[#1E563B] m-0">
                  {isEn ? 'Payment Confirmed via SePay VietQR' : 'Đã thanh toán thành công qua SePay VietQR'}
                </h4>
                <p className="text-xs text-[#2D5A3F] mt-0.5 mb-0">
                  {isEn
                    ? `${Number(request.totalCost || 0).toLocaleString('vi-VN')} VND${request.paidAt ? ` · ${new Date(request.paidAt).toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' })}` : ''}`
                    : `${Number(request.totalCost || 0).toLocaleString('vi-VN')} VND${request.paidAt ? ` · Lúc ${new Date(request.paidAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` : ''}`}
                </p>
              </div>
            </div>
          ) : needsPaymentNow ? (
            <SepayPayment
              shipmentId={Number(request.id || request.shipmentId || requestId)}
              requestCode={request.requestCode}
              amount={Number(request.totalCost)}
              checkout
              autoGenerateQr={isAwaitingPayment}
              eligible
              onPaid={() => {
                void mutate();
                window.dispatchEvent(new CustomEvent('customer-orders-updated'));
              }}
            />
          ) : (
            <div className="rounded-2xl border border-[#E5DDD0] bg-[#FAF8F4] p-4 text-xs text-[#5F6977]">
              {isCancelledOrRejected
                ? isEn
                  ? 'Payment closed (order cancelled, rejected, or in refund).'
                  : 'Cổng thanh toán đã đóng (đơn đã hủy, từ chối hoặc đang hoàn tiền).'
                : isEn
                  ? 'Payment unlocks automatically once eligible.'
                  : 'Cổng thanh toán sẽ tự động mở khi đủ điều kiện.'}
            </div>
          )}

          {/* Refund / 30-Day Credit Summary (if any record exists) */}
          {Number(request.id || request.shipmentId || requestId) > 0 && (
            <CustomerRefundSummaryCard shipmentId={Number(request.id || request.shipmentId || requestId)} />
          )}

          {/* Compact Cost Breakdown */}
          <div className="bg-white rounded-2xl border border-[#E5DDD0] p-5 shadow-sm flex justify-between items-center flex-wrap gap-4">
            <div>
              <span className="text-xs text-[#5F6977] block">
                {isEn ? 'Total Order Cost' : 'Tổng chi phí đơn hàng'}
              </span>
              <div className="text-xl font-extrabold text-[#1E563B] mt-0.5 font-mono whitespace-nowrap">
                {Number(request.totalCost) > 0
                  ? `${Number(request.totalCost).toLocaleString('vi-VN')}\u00A0VNĐ`
                  : isEn ? 'Awaiting quote' : 'Chờ báo giá'}
              </div>
            </div>
            <div className="text-xs text-[#5F6977] flex flex-wrap gap-5">
              <div>
                <span className="block">{isEn ? 'Base Freight' : 'Cước vận chuyển'}</span>
                <strong className="text-[#181A17] font-mono text-sm">
                  {request.transportCost != null ? `${Number(request.transportCost).toLocaleString('vi-VN')}\u00A0đ` : '—'}
                </strong>
              </div>
              <div>
                <span className="block">{isEn ? 'Insurance' : 'Phí bảo hiểm'}</span>
                <strong className="text-[#181A17] font-mono text-sm">
                  {Number(request.insuranceFee || 0).toLocaleString('vi-VN')}{'\u00A0'}đ
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Early Horse Vault Upload Modal (for Submit Later documents before official checklist is active) */}
      <HorseDocumentUploadModal
        isOpen={earlyUploadModal.isOpen}
        horseId={earlyUploadModal.horseId}
        defaultTypeCode={earlyUploadModal.documentTypeCode}
        onClose={() => setEarlyUploadModal((prev) => ({ ...prev, isOpen: false }))}
        onUploaded={() => {
          setEarlyUploadModal((prev) => ({ ...prev, isOpen: false }));
          toast.success(
            isEn ? 'Document uploaded to horse vault!' : 'Đã tải giấy tờ bổ sung lên kho hồ sơ ngựa!',
          );
          void mutateChecklist();
          void mutate();
        }}
      />

      {/* Upload Modal */}
      <DocumentUploadModal
        isOpen={isUploadOpen}
        onClose={() => {
          setIsUploadOpen(false);
          setUploadTarget(null);
          setReuploadTarget(null);
        }}
        onSuccess={handleUploadSuccess}
        defaultOrderId={request.id}
        defaultHorseId={uploadTarget?.horseId}
        defaultRegulationId={uploadTarget?.regulationId}
        defaultDocType={reuploadTarget?.docType}
        reuploadDocId={reuploadTarget?.docId}
        reuploadTitle={reuploadTarget?.title}
        onSwitchToBatch={() => handleOpenBatchUpload()}
      />

      {/* Batch Document Upload Modal */}
      {batchTarget && (
        <BatchDocumentUploadModal
          isOpen={isBatchUploadOpen}
          onClose={() => {
            setIsBatchUploadOpen(false);
            setBatchTarget(null);
          }}
          onSuccess={() => {
            mutateChecklist();
            mutate();
          }}
          orderId={request.id}
          horseId={batchTarget.horseId}
          horseName={batchTarget.horseName}
          destinationCountry={checklist?.destinationCountry || request.destination}
          missingRegulations={batchTarget.missingRegulations}
        />
      )}

      {/* Resubmit Modal */}
      <Modal
        isOpen={isResubmitOpen}
        onClose={() => setIsResubmitOpen(false)}
        title={t('requestDetail.resubmitTitle', 'Cập nhật & Gửi lại yêu cầu vận chuyển')}
        subtitle={`${t('customer.requestCodeLabel', 'Mã đơn')}: ${request.requestCode}`}
        maxWidth="max-w-2xl"
      >
        <InsuranceAmendmentForm
          key={`${request.id}-${request.updatedAt}`}
          orderId={Number(request.id)}
          horses={request.insuranceHorses ?? []}
          specialRequirements={request.specialRequirements}
          bookingType={request.bookingType}
          onCancel={() => setIsResubmitOpen(false)}
          onSaved={() => {
            setIsResubmitOpen(false);
            void mutate();
            toast.success(t('requestDetail.resubmitSuccess', 'Đã gửi lại yêu cầu để Logistics Manager xét duyệt.'));
          }}
        />
      </Modal>

      {/* Price Negotiation Modal */}
      <Modal
        isOpen={isNegotiateModalOpen}
        onClose={() => {
          if (isSubmittingNegotiation) return;
          setNegotiateNotes('');
          setIsNegotiateModalOpen(false);
        }}
        closeDisabled={isSubmittingNegotiation}
        title={t('requestDetail.negotiateTitle', 'Yêu cầu thương thảo giá vận chuyển')}
        subtitle={`${t('customer.requestCodeLabel', 'Mã đơn')}: ${request.requestCode}`}
        maxWidth="500px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontSize: '13px', color: '#475569', margin: 0, lineHeight: 1.5 }}>
            {t('requestDetail.negotiateDesc', 'Quý khách có thể gửi mức ngân sách dự kiến hoặc đề xuất phương án điều chỉnh để Logistics Manager xem xét lại phương án báo giá.')}
          </p>
          <div>
            <label htmlFor="negotiation-notes" style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
              {t('requestDetail.proposalBudget', 'Nội dung đề xuất / Ngân sách mong muốn:')}
            </label>
            <textarea
              id="negotiation-notes"
              rows={4}
              value={negotiateNotes}
              disabled={isSubmittingNegotiation}
              onChange={(e) => setNegotiateNotes(e.target.value)}
              placeholder={language === 'en' ? 'e.g. We would like to optimize transport costs or suggest combined flight dispatch...' : 'Ví dụ: Chúng tôi mong muốn tối ưu chi phí vận chuyển hoặc đề xuất bay ghép chuyến cùng đoàn...'}
              className="w-full px-3 py-2.5 rounded-lg border border-[#D8CEBE] text-sm text-[#181A17] focus:outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20"
            />
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={isSubmittingNegotiation}
              onClick={() => {
                setNegotiateNotes('');
                setIsNegotiateModalOpen(false);
              }}
              style={{
                padding: '9px 16px',
                borderRadius: '8px',
                border: '1px solid #D8CEBE',
                backgroundColor: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                color: '#475569',
                cursor: isSubmittingNegotiation ? 'not-allowed' : 'pointer',
              }}
            >
              {t('common.close', 'Đóng')}
            </button>
            <button
              type="button"
              disabled={isSubmittingNegotiation || !negotiateNotes.trim()}
              onClick={async () => {
                setIsSubmittingNegotiation(true);
                try {
                  await apiClient(`/orders/${request.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                      specialRequirements: `[${language === 'en' ? 'Price Negotiation Request' : 'Yêu cầu thương thảo giá'}: ${negotiateNotes.trim()}] | ${request.specialRequirements || ''}`,
                    }),
                  });
                  await mutate();
                  setIsNegotiateModalOpen(false);
                  setNegotiateNotes('');
                  toast.success(t('requestDetail.negotiateSuccess', 'Yêu cầu thương thảo giá đã được gửi đến Logistics Manager thành công!'));
                } catch (err: any) {
                  toast.error(err?.message || (language === 'en' ? 'Unable to submit negotiation request at this time.' : 'Không thể gửi yêu cầu thương thảo lúc này.'));
                } finally {
                  setIsSubmittingNegotiation(false);
                }
              }}
              style={{
                padding: '9px 20px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#A67C2E',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: isSubmittingNegotiation || !negotiateNotes.trim() ? 'not-allowed' : 'pointer',
                opacity: isSubmittingNegotiation || !negotiateNotes.trim() ? 0.6 : 1,
              }}
            >
              {isSubmittingNegotiation ? t('requestDetail.submitting', 'Đang gửi...') : t('requestDetail.sendNegotiationBtn', 'Gửi yêu cầu')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Cancel Order Modal: NO double-padding */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => !isCancelling && setIsCancelModalOpen(false)}
        closeDisabled={isCancelling}
        title={t('requestDetail.cancelModalTitle', 'Xác nhận hủy đơn vận chuyển')}
        subtitle={`${t('customer.requestCodeLabel', 'Mã đơn')}: ${request?.requestCode || `#${request?.id}`}`}
        maxWidth="480px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '14px',
              padding: '16px',
              borderRadius: '12px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fee2e2',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={22} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#991b1b', marginBottom: '4px' }}>
                {t('requestDetail.cannotUndo', 'Hành động này không thể hoàn tác')}
              </div>
              <div style={{ fontSize: '13px', color: '#7f1d1d', lineHeight: '1.5' }}>
                {t('requestDetail.confirmCancelPrompt', 'Bạn có chắc chắn muốn hủy đơn vận chuyển {code}? Sau khi hủy, hành trình vận chuyển sẽ bị dừng lại và các chú ngựa liên quan sẽ được mở khóa trạng thái.', { code: request?.requestCode || `#${request?.id}` })}
                {String(request?.status || '').toLowerCase() === 'awaiting_payment' && (
                  <div style={{ marginTop: '6px', fontWeight: 600 }}>
                    {language === 'en'
                      ? 'The invoice and payment QR code will be voided. Do not transfer money to the old QR code after cancelling.'
                      : 'Hóa đơn và mã QR thanh toán sẽ bị vô hiệu. Vui lòng không chuyển khoản vào mã QR cũ sau khi hủy.'}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              backgroundColor: '#F0EEE8',
              border: '1px solid #D8CEBE',
              fontSize: '13px',
              color: '#475569',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>{t('customer.table.route', 'Tuyến đường')}:</span>
              <span style={{ fontWeight: 600, color: '#1e293b' }}>
                {request?.origin} ➔ {request?.destination}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>{t('customer.table.horseCount', 'Số lượng ngựa')}:</span>
              <span style={{ fontWeight: 600, color: '#1e293b' }}>{request?.horses?.length || 1} {t('common.horsesUnit', 'con')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>{t('customer.table.status', 'Trạng thái hiện tại')}:</span>
              <span style={{ fontWeight: 600, color: '#d97706' }}>{translateStatus(request?.statusLabel || request?.status)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => setIsCancelModalOpen(false)}
              disabled={isCancelling}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                border: '1px solid #D8CEBE',
                backgroundColor: '#ffffff',
                color: '#475569',
                fontWeight: 600,
                fontSize: '13.5px',
                cursor: isCancelling ? 'not-allowed' : 'pointer',
              }}
            >
              {t('requestDetail.keepRequestBtn', 'Giữ lại đơn')}
            </button>
            <button
              type="button"
              onClick={handleConfirmCancel}
              disabled={isCancelling}
              style={{
                padding: '10px 22px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '13.5px',
                cursor: isCancelling ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 4px rgba(220, 38, 38, 0.2)',
                opacity: isCancelling ? 0.8 : 1,
              }}
            >
              {isCancelling ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t('requestDetail.cancelling', 'Đang xử lý hủy...')}
                </>
              ) : (
                t('requestDetail.confirmCancelBtn', 'Xác nhận hủy đơn')
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
