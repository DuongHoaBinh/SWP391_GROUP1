'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronRight,
  Clock,
  Check,
  Search,
  ThumbsUp,
  CalendarCheck,
  Plane,
  Flag,
  MoreVertical,
  ArrowRight,
  AlertTriangle,
  Upload,
  Eye,
  FileText,
  Building,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  CheckCircle,
  XCircle,
  Info,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { useCustomerStore } from '@/lib/customer-store';
import { DocumentUploadModal } from '@/features/documents/components/DocumentUploadModal';
import { BatchDocumentUploadModal } from '@/features/documents/components/BatchDocumentUploadModal';
import { TripTrackingModal } from '@/features/tracking/components/TripTrackingModal';
import { apiClient } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';
import { OrderComplianceChecklist } from '@/features/documents/api/documents.api';
import { buildEquineRoute } from '@/lib/geo-corridors';
import useSWR from 'swr';
import toast from 'react-hot-toast';

const fetcher = async (url: string) => {
  const data = await apiClient<any>(url);

  // Normalize horses array to support both backend schema and frontend template schema
  const rawHorses = Array.isArray(data.horses) && data.horses.length > 0
    ? data.horses
    : data.horse
      ? [data.horse]
      : [];

  const normalizedHorses = rawHorses.map((item: any, idx: number) => {
    if (item.horse) {
      return item;
    }
    const horseObj = {
      id: String(item.horseId || item.id || `hrs-${idx + 1}`),
      name: item.name || 'Racehorse',
      breed: item.breed || 'Thoroughbred',
      age: item.age || 5,
      gender: item.gender
        ? (String(item.gender).toLowerCase().includes('female') || String(item.gender).toLowerCase().includes('mare')
            ? 'Mare (Female)'
            : String(item.gender).toLowerCase().includes('male') || String(item.gender).toLowerCase().includes('stallion')
              ? 'Stallion (Male)'
              : 'Gelding')
        : 'Mare (Female)',
    };
    return {
      horse: horseObj,
      isComplete: true,
      medicalStatus: 'Healthy',
      docsSummary: '4/4 Complete',
    };
  });

  const defaultDocs = [
    {
      id: 'doc-01',
      title: 'Horse FEI Passport',
      uploadedDate: data.createdAt ? new Date(data.createdAt).toLocaleDateString('en-GB') : 'Ready',
      status: 'Approved',
    },
    {
      id: 'doc-02',
      title: 'Equine Influenza Vaccination Record',
      uploadedDate: data.createdAt ? new Date(data.createdAt).toLocaleDateString('en-GB') : 'Ready',
      status: 'Approved',
    },
    {
      id: 'doc-03',
      title: 'Veterinary Export Health Certificate',
      uploadedDate: data.createdAt ? new Date(data.createdAt).toLocaleDateString('en-GB') : 'Pending',
      status: 'Approved',
    },
    {
      id: 'doc-04',
      title: 'Import / CITES Clearance Permit',
      uploadedDate: data.createdAt ? new Date(data.createdAt).toLocaleDateString('en-GB') : 'Pending',
      status: 'Approved',
    },
  ];

  const documents = Array.isArray(data.documents) && data.documents.length > 0
    ? data.documents
    : defaultDocs;

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
  };

  const originStr = String(data.originLocation || '');
  const destStr = String(data.destinationLocation || '');
  const originLower = originStr.toLowerCase();
  const destLower = destStr.toLowerCase();

  const vnKeywords = ['vietnam', 'việt nam', 'hcm', 'hồ chí minh', 'sài gòn', 'hà nội', 'cần thơ', 'bạc liêu', 'đà nẵng', 'bình dương', 'long an', 'đồng nai', 'củ chi', 'vũng tàu', 'hải phòng', 'huế', 'nha trang', 'quy nhơn', 'buôn ma thuột'];
  const isOriginVN = vnKeywords.some((k) => originLower.includes(k)) || originLower.includes('vn') || !originLower.includes(',');

  const intlKeywords = ['singapore', 'australia', 'japan', 'hong kong', 'malaysia', 'thailand', 'france', 'usa', 'ireland', 'uk', 'germany', 'dubai', 'uae', 'qatar', 'new zealand', 'china', 'korea', 'india', 'belgium'];
  const isDestIntl = intlKeywords.some((k) => destLower.includes(k));
  const isDestVN = !isDestIntl && (vnKeywords.some((k) => destLower.includes(k)) || destLower.includes('vn') || !destLower.includes(','));

  let isDomestic = isOriginVN && isDestVN;
  if (data.transportationType) {
    isDomestic = String(data.transportationType).toLowerCase() === 'domestic';
  } else if (data.transportType) {
    isDomestic = String(data.transportType).toLowerCase() === 'domestic';
  } else if (String(data.specialRequirements || '').toLowerCase().includes('nội địa') || String(data.specialRequirements || '').toLowerCase().includes('domestic')) {
    isDomestic = true;
  }

  const transportationType = isDomestic ? 'Domestic' : 'International';
  const originCountryCode = isOriginVN ? 'VN' : 'INTL';
  const destinationCountryCode = isDomestic
    ? 'VN'
    : destLower.includes('singapore')
    ? 'SG'
    : destLower.includes('australia')
    ? 'AU'
    : destLower.includes('japan')
    ? 'JP'
    : destLower.includes('hong kong')
    ? 'HK'
    : destLower.includes('malaysia')
    ? 'MY'
    : destLower.includes('thailand')
    ? 'TH'
    : destLower.includes('india')
    ? 'IN'
    : destLower.includes('belgium')
    ? 'BE'
    : 'INTL';
  const destinationCountry = isDomestic
    ? 'Vietnam'
    : destLower.includes('singapore')
    ? 'Singapore'
    : destLower.includes('australia')
    ? 'Australia'
    : destLower.includes('japan')
    ? 'Japan'
    : destLower.includes('hong kong')
    ? 'Hong Kong'
    : destLower.includes('india')
    ? 'Ấn Độ'
    : destLower.includes('belgium')
    ? 'Bỉ'
    : 'International';
  const routeCalc = buildEquineRoute(
    originStr,
    destStr,
    isDomestic ? 'road' : 'air',
    transportationType as any
  );

  const estimatedDistance = data.estimatedDistance || `${routeCalc.distanceKm.toLocaleString()} km`;
  const estimatedDuration = data.estimatedDuration || (isDomestic ? `~${routeCalc.durationHours} hours` : `~${routeCalc.durationHours} hours (${routeCalc.mode === 'air' ? 'Air Flight' : 'Road Transit'})`);
  const transitName = isDomestic
    ? (routeCalc.waypoints.find((w) => w.type === 'checkpoint' || w.type === 'rest')?.name || 'Trạm kiểm dịch nội địa')
    : (routeCalc.waypoints.find((w) => w.type === 'checkpoint' || w.type === 'airport')?.name || 'Border / Transit Checkpoint');

  return {
    ...data,
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

export default function RequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params?.id as string;

  const { getRequestById, uploadDocumentForRequest, cancelRequest } = useCustomerStore();
  const { data: request, error, isLoading: loading, mutate } = useSWR(`/orders/${requestId}`, fetcher, {
    revalidateOnFocus: true,
  });

  const { data: checklist, mutate: mutateChecklist } = useSWR<OrderComplianceChecklist>(
    request?.id ? `/documents/order/${request.id}/checklist` : null,
    (url: string) => apiClient<OrderComplianceChecklist>(url),
    { revalidateOnFocus: true }
  );

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
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
    horseId?: number | string;
    regulationId?: number | string;
  } | null>(null);
  
  // Resubmit Modal States
  const [isResubmitOpen, setIsResubmitOpen] = useState(false);
  const [resubmitNotes, setResubmitNotes] = useState('');
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [resubmitError, setResubmitError] = useState('');

  if (loading || !request) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ height: '40px', width: '30%', backgroundColor: '#e5e7eb', borderRadius: '8px', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
        <div style={{ height: '200px', width: '100%', backgroundColor: '#e5e7eb', borderRadius: '16px', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: .5; }
          }
        `}</style>
      </div>
    );
  }

  const statusLower = String(request?.status || '').toLowerCase();
  const isPendingReview = statusLower === 'requested' || statusLower === 'under_review';
  const isRejected = statusLower === 'rejected' || statusLower === 'cancelled';
  const isApproved = ['approved', 'planning', 'confirmed', 'ready_to_depart', 'ready', 'in_transit', 'completed'].includes(statusLower);
  const requirementsSent = Boolean(checklist?.requirementsSent);
  const totalMissingCount = checklist?.horses?.reduce(
    (acc, h) => acc + (h.missingRegulations?.length || 0),
    0
  ) ?? 0;
  const totalRejectedCount = checklist?.horses?.reduce(
    (acc, h) => acc + (h.documents?.filter((d: any) => d.status === 'rejected')?.length || 0),
    0
  ) ?? 0;
  const hasMissingDocs = isApproved && requirementsSent && totalMissingCount > 0;
  const hasRejectedDocs = isApproved && requirementsSent && totalRejectedCount > 0;

  // Compute dynamic timeline stepper that reflects both order status and quarantine compliance
  let computedStep = 2;
  if (['requested', 'under_review', 'change_requested', 'rejected', 'cancelled'].includes(statusLower)) {
    computedStep = 2;
  } else if (statusLower === 'approved') {
    computedStep = 3;
  } else if (statusLower === 'planning') {
    computedStep = checklist?.isFullyCompliant ? 4 : 3;
  } else if (statusLower === 'confirmed') {
    computedStep = 4;
  } else if (statusLower === 'ready_to_depart' || statusLower === 'ready') {
    computedStep = 5;
  } else if (statusLower === 'in_transit') {
    computedStep = 5;
  } else if (statusLower === 'completed') {
    computedStep = 6;
  }

  const effectiveStep = Math.max(computedStep, request.activeStepIndex || 2);

  const displayTimeline = [
    { stage: 1, name: 'Request Created', status: 'completed' },
    {
      stage: 2,
      name: 'Manager Approval',
      status: effectiveStep === 2 ? 'active' : effectiveStep > 2 ? 'completed' : 'pending',
    },
    {
      stage: 3,
      name: 'Quarantine & Docs',
      status:
        checklist?.isFullyCompliant || effectiveStep > 3
          ? 'completed'
          : effectiveStep === 3
          ? 'active'
          : 'pending',
    },
    {
      stage: 4,
      name: 'Trip Planned',
      status:
        statusLower === 'ready_to_depart' || statusLower === 'ready' || statusLower === 'in_transit' || statusLower === 'completed' || effectiveStep > 4
          ? 'completed'
          : effectiveStep === 4
          ? 'active'
          : 'pending',
    },
    {
      stage: 5,
      name: 'In Transit',
      status:
        statusLower === 'completed'
          ? 'completed'
          : effectiveStep === 5
          ? 'active'
          : 'pending',
    },
    {
      stage: 6,
      name: 'Handover Completed',
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
    setReuploadTarget({
      docId: doc.id,
      title: doc.regulationTitle || doc.docType || 'Hồ sơ',
      horseId,
      regulationId: doc.regulationId,
    });
    setUploadTarget({
      horseId,
      regulationId: doc.regulationId,
    });
    setIsUploadOpen(true);
  };

  const handleUploadSuccess = (uploadedDoc: any) => {
    uploadDocumentForRequest(request.requestCode, uploadedDoc.title);
    mutateChecklist();
    mutate();
    setIsUploadOpen(false);
    toast.success('Hồ sơ đã được tải lên thành công!');
  };

  const handleCancel = () => {
    if (confirm(`Are you sure you want to cancel transport request ${request.requestCode}?`)) {
      cancelRequest(request.id);
    }
  };

  const submitResubmit = async () => {
    if (!resubmitNotes.trim()) {
      setResubmitError('Please describe the changes you made.');
      return;
    }
    setIsResubmitting(true);
    setResubmitError('');
    try {
      await apiClient(`/orders/${request.id}`, {
        method: 'PUT',
        body: JSON.stringify({ specialRequirements: `[Updated] ${resubmitNotes}` }) // For now, updating specialReqs as a placeholder edit
      });
      await mutate();
      setIsResubmitOpen(false);
      toast.success('Request resubmitted successfully!');
    } catch (err) {
      setResubmitError('Failed to resubmit request. Please try again.');
    } finally {
      setIsResubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header & Breadcrumbs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          {/* Breadcrumb */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--text-muted)',
              marginBottom: '4px',
            }}
          >
            <Link href="/customer" style={{ color: 'var(--text-muted)' }}>
              Dashboard
            </Link>
            <ChevronRight size={12} />
            <Link href="/customer/requests" style={{ color: 'var(--text-muted)' }}>
              Transport Requests
            </Link>
            <ChevronRight size={12} />
            <span style={{ color: 'var(--text-heading)', fontWeight: 600 }}>{request.requestCode}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
              Transport Request {request.requestCode}
            </h2>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                backgroundColor:
                  request.status === 'CANCELLED' || request.status === 'rejected'
                    ? '#fee2e2'
                    : request.status === 'ready_to_depart' || request.status === 'ready'
                    ? '#dcfce7'
                    : request.status === 'in_transit'
                    ? '#e0f2fe'
                    : request.status === 'approved' || request.status === 'planning' || request.status === 'confirmed'
                    ? '#dbeafe'
                    : '#fef3c7',
                color:
                  request.status === 'CANCELLED' || request.status === 'rejected'
                    ? '#dc2626'
                    : request.status === 'ready_to_depart' || request.status === 'ready'
                    ? '#15803d'
                    : request.status === 'in_transit'
                    ? '#0369a1'
                    : request.status === 'approved' || request.status === 'planning' || request.status === 'confirmed'
                    ? '#1d4ed8'
                    : '#b45309',
                border:
                  request.status === 'CANCELLED' || request.status === 'rejected'
                    ? '1px solid #fecaca'
                    : request.status === 'ready_to_depart' || request.status === 'ready'
                    ? '1px solid #86efac'
                    : request.status === 'in_transit'
                    ? '1px solid #bae6fd'
                    : request.status === 'approved' || request.status === 'planning' || request.status === 'confirmed'
                    ? '1px solid #bfdbfe'
                    : '1px solid #fde68a',
              }}
            >
              <Clock size={13} />
              {request.statusLabel}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => router.push('/customer/tracking')}
            style={{
              padding: '9px 16px',
              borderRadius: '8px',
              border: '1px solid var(--primary)',
              backgroundColor: '#eff6ff',
              fontSize: '13.5px',
              fontWeight: 600,
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Plane size={14} /> Live Tracking
          </button>
          {request.status !== 'CANCELLED' && (
            <button
              onClick={handleCancel}
              style={{
                padding: '9px 16px',
                borderRadius: '8px',
                border: '1px solid #fecaca',
                backgroundColor: '#fef2f2',
                fontSize: '13.5px',
                fontWeight: 600,
                color: '#dc2626',
              }}
            >
              Cancel Request
            </button>
          )}
          <button
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b',
            }}
          >
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      {/* Change Requested Alert Banner */}
      {request.status === 'change_requested' && (
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '16px',
          }}
        >
          <div style={{ padding: '4px', backgroundColor: '#fee2e2', borderRadius: '50%', color: '#ef4444' }}>
            <AlertTriangle size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 700, color: '#991b1b' }}>
              Action Required: Manager Requested Changes
            </h4>
            <p style={{ margin: 0, fontSize: '13px', color: '#b91c1c', lineHeight: 1.5 }}>
              <strong>Manager Notes:</strong> {request.changeRequestNotes || 'Please update your request details and resubmit.'}
            </p>
          </div>
          <button
            onClick={() => { setResubmitNotes(''); setResubmitError(''); setIsResubmitOpen(true); }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#ef4444',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Edit & Resubmit
          </button>
        </div>
      )}

      {/* Main 3-Column Layout (Left 2, Right 1) */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', alignItems: 'start' }}>
        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* 1. STATUS TIMELINE STEPPER (7 Stages according to Flow 1-4) */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              border: '1px solid var(--border-card)',
              padding: '24px 20px',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ position: 'relative', maxWidth: '800px', margin: '0 auto' }}>
              {/* Background connector bar */}
              <div
                style={{
                  position: 'absolute',
                  top: '18px',
                  left: '30px',
                  right: '30px',
                  height: '4px',
                  backgroundColor: '#f1f5f9',
                  zIndex: 0,
                  borderRadius: '999px',
                }}
              />
              {/* Completed bar */}
              <div
                style={{
                  position: 'absolute',
                  top: '18px',
                  left: '30px',
                  width: `${((Math.max(1, effectiveStep) - 1) / 5) * 88}%`,
                  height: '4px',
                  backgroundColor: '#16a34a',
                  zIndex: 0,
                  borderRadius: '999px',
                  transition: 'width 0.3s ease',
                }}
              />

              {/* 6 Stages */}
              <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
                {displayTimeline.map((stage: any) => {
                  const isCompleted = stage.status === 'completed';
                  const isActive = stage.status === 'active';

                  return (
                    <div
                      key={stage.stage}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px',
                        width: '74px',
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          backgroundColor: isCompleted ? '#16a34a' : isActive ? 'var(--primary)' : '#ffffff',
                          color: isCompleted || isActive ? '#ffffff' : '#94a3b8',
                          border: isCompleted
                            ? '2px solid #ffffff'
                            : isActive
                            ? '2px solid #ffffff'
                            : '2px solid #e2e8f0',
                          boxShadow: isCompleted
                            ? '0 0 0 2px #16a34a'
                            : isActive
                            ? '0 0 0 2px var(--primary)'
                            : 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          position: 'relative',
                        }}
                      >
                        {isCompleted && <Check size={14} strokeWidth={3} />}
                        {isActive && <Search size={14} />}
                        {!isCompleted && !isActive && (
                          <>
                            {stage.stage === 2 && <ThumbsUp size={14} />}
                            {stage.stage === 3 && <FileText size={14} />}
                            {stage.stage === 4 && <CalendarCheck size={14} />}
                            {stage.stage === 5 && <Plane size={14} />}
                            {stage.stage === 6 && <Flag size={14} />}
                          </>
                        )}
                      </div>

                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: isActive ? 700 : 600,
                          color: isActive ? 'var(--primary)' : isCompleted ? 'var(--text-heading)' : '#94a3b8',
                          lineHeight: 1.2,
                        }}
                      >
                        {stage.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 2. REQUEST SUMMARY */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              border: '1px solid var(--border-card)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-light)', backgroundColor: '#f8fafc' }}>
              <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                Request Summary
              </h4>
            </div>
            <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Request ID</span>
                <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-heading)', margin: '2px 0 0 0' }}>
                  {request.requestCode}
                </p>
              </div>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Created</span>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '2px 0 0 0' }}>
                  {request.createdDate || '23 Sep 2026, 09:42'}
                </p>
              </div>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Transportation Type</span>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '2px 0 0 0' }}>
                  {request.transportationType}
                </p>
              </div>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Current Status</span>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#d97706', margin: '2px 0 0 0' }}>
                  {request.statusLabel}
                </p>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Route</span>
                <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-heading)', margin: '2px 0 0 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {request.origin}, {request.originCountryCode || 'VN'} <ArrowRight size={14} color="#94a3b8" /> {request.destination}, {request.destinationCountryCode || 'VN'}
                </p>
              </div>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Departure</span>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '2px 0 0 0' }}>
                  {request.departureDate}
                </p>
              </div>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Expected Arrival</span>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '2px 0 0 0' }}>
                  {request.estimatedArrivalDate}
                </p>
              </div>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Number of Horses</span>
                <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)', margin: '2px 0 0 0' }}>
                  {request.requestedHorseCount || request.horses?.length || 1} horses
                </p>
              </div>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Chi phí vận chuyển (Total Cost)</span>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#16a34a', margin: '2px 0 0 0' }}>
                  {Number(request.totalCost) > 0
                    ? Number(request.totalCost) < 100000
                      ? `$${Number(request.totalCost).toLocaleString('en-US')} USD (~${Math.round(request.totalCost * 25400).toLocaleString('vi-VN')} VND)`
                      : `${Number(request.totalCost).toLocaleString('vi-VN')} VND (~$${Math.round(request.totalCost / 25400).toLocaleString('en-US')} USD)`
                    : 'Đang chờ báo giá'}
                </p>
              </div>
            </div>
          </div>

          {/* 3. TRANSPORT ROUTE */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              border: '1px solid var(--border-card)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-light)', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                Transport Route
              </h4>
              <button
                onClick={() => setIsTrackingOpen(true)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  backgroundColor: '#eff6ff',
                  color: 'var(--primary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                }}
              >
                View Trip Tracking
              </button>
            </div>
            <div style={{ padding: '28px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '600px', margin: '0 auto', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '24px', left: '40px', right: '40px', height: '3px', backgroundColor: '#e2e8f0', zIndex: 0 }} />

                {/* Origin */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>Origin</span>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#0f172a', border: '3px solid #ffffff', boxShadow: '0 0 0 1px #cbd5e1' }} />
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-heading)', marginTop: '8px' }}>{request.origin}</span>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>Vietnam</span>
                </div>

                {/* Transit Checkpoint */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>Transit</span>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#ffffff', border: '2px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', marginTop: '-6px' }}>
                    <Building size={14} />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569', marginTop: '8px' }}>{request.transitName || 'Border / Transit Checkpoint'}</span>
                </div>

                {/* Destination */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>Destination</span>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#94a3b8', border: '3px solid #ffffff', boxShadow: '0 0 0 1px #cbd5e1' }} />
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-heading)', marginTop: '8px' }}>{request.destination}</span>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>{request.destinationCountry || 'Vietnam'}</span>
                </div>
              </div>

              <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                Estimated Distance: <strong style={{ color: 'var(--text-heading)' }}>{request.estimatedDistance || '1,100 km'}</strong> &nbsp;|&nbsp; Estimated Time: <strong style={{ color: 'var(--text-heading)' }}>{request.estimatedDuration || '12 hours'}</strong>
              </div>
            </div>
          </div>

          {/* 4. HORSES IN THIS TRANSPORT (Linked to Horse Profiles) */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              border: '1px solid var(--border-card)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-light)', backgroundColor: '#f8fafc' }}>
              <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                Horses ({request.horses?.length || request.requestedHorseCount || 1})
              </h4>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Horse</th>
                  <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Breed</th>
                  <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Age / Gender</th>
                  <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Medical Status</th>
                  <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Documents</th>
                  <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'right' }}>Action</th>
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
                          title="View Horse Profile"
                        >
                          {horse.name}
                        </Link>
                      </td>
                      <td style={{ padding: '16px 20px', color: 'var(--text-body)' }}>{horse.breed}</td>
                      <td style={{ padding: '16px 20px', color: 'var(--text-body)' }}>
                        {horse.age} yrs • {String(horse.gender || '').toLowerCase().includes('male') ? 'Male' : 'Female'}
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            backgroundColor: item.medicalStatus === 'Healthy' ? '#dcfce7' : '#fef3c7',
                            color: item.medicalStatus === 'Healthy' ? '#15803d' : '#b45309',
                          }}
                        >
                          {item.medicalStatus || 'Healthy'}
                        </span>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        {(() => {
                          const horseChecklist = checklist?.horses?.find(
                            (h) => String(h.horseId) === String(horse.id || horse.horseId)
                          );
                          if (isPendingReview) {
                            return (
                              <span
                                style={{
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  color: '#64748b',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                              >
                                <Clock size={14} /> Chờ duyệt yêu cầu
                              </span>
                            );
                          }
                          if (!checklist || !requirementsSent) {
                            return (
                              <span
                                style={{
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  color: '#2563eb',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                              >
                                <Clock size={14} /> Chờ ban hành danh mục hồ sơ
                              </span>
                            );
                          }
                          const approvedDocs =
                            horseChecklist?.documents?.filter((d: any) => d.status === 'approved')?.length || 0;
                          const totalDocs =
                            (horseChecklist?.missingRegulations?.length || 0) +
                            (horseChecklist?.documents?.length || 0);
                          const isCompliant = Boolean(horseChecklist?.isCompliant);
                          const hasRejected = Boolean(
                            horseChecklist?.documents?.some((d: any) => d.status === 'rejected')
                          );
                          const hasMissing = (horseChecklist?.missingRegulations?.length || 0) > 0;

                          if (isCompliant) {
                            return (
                              <span
                                style={{
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  color: '#15803d',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                              >
                                <Check size={14} /> {approvedDocs}/{totalDocs} Đã duyệt
                              </span>
                            );
                          }

                          if (hasRejected) {
                            return (
                              <span
                                style={{
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  color: '#dc2626',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                              >
                                <AlertTriangle size={14} /> {approvedDocs}/{totalDocs} Đã duyệt (Cần nộp lại)
                              </span>
                            );
                          }

                          if (hasMissing) {
                            return (
                              <span
                                style={{
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  color: '#dc2626',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                }}
                              >
                                <AlertTriangle size={14} /> {approvedDocs}/{totalDocs} Đã duyệt (Thiếu {horseChecklist?.missingRegulations?.length})
                              </span>
                            );
                          }

                          return (
                            <span
                              style={{
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#d97706',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                              }}
                            >
                              <Clock size={14} /> {approvedDocs}/{totalDocs} Đã duyệt (Chờ duyệt)
                            </span>
                          );
                        })()}
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <Link
                          href={`/customer/horses/${horse.id || horse.horseId || ''}`}
                          style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '13px' }}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 5. TRANSPORT COMPLIANCE DOCUMENTS */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              border: '1px solid var(--border-card)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div
              style={{
                padding: '16px 24px',
                borderBottom: '1px solid var(--border-light)',
                backgroundColor: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={18} color="var(--primary)" />
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                  Hồ sơ Kiểm dịch & Vận chuyển (Compliance Documents)
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
                      <CheckCircle2 size={13} /> Đạt chuẩn 100%
                    </>
                  ) : (
                    <>
                      <Clock size={13} /> {checklist.approvedDocumentsCount}/{checklist.totalRequiredDocuments} Đã duyệt
                    </>
                  )}
                </span>
              )}
            </div>

            {/* CASE 1: Request not yet approved by Manager */}
            {isPendingReview ? (
              <div style={{ padding: '28px 24px', textAlign: 'center', backgroundColor: '#fcfcfc' }}>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    backgroundColor: '#fef3c7',
                    color: '#d97706',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px auto',
                  }}
                >
                  <Clock size={24} />
                </div>
                <h5 style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 6px 0' }}>
                  Đang chờ Logistics Manager phê duyệt yêu cầu
                </h5>
                <p style={{ fontSize: '13px', color: '#64748b', maxWidth: '480px', margin: '0 auto', lineHeight: 1.5 }}>
                  Yêu cầu vận chuyển đang được quản lý rà soát. Ngay sau khi đơn được duyệt, Chuyên viên kiểm dịch (Specialist) sẽ tiếp nhận để kiểm tra quy chuẩn điểm đến ({request.destination}) và ban hành danh mục hồ sơ cần nộp.
                </p>
              </div>
            ) : !requirementsSent ? (
              /* CASE 2: Approved, waiting for Specialist to review destination & send requirements */
              <div style={{ padding: '28px 24px', textAlign: 'center', backgroundColor: '#f8fafc' }}>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    backgroundColor: '#e0f2fe',
                    color: '#0284c7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px auto',
                  }}
                >
                  <Sparkles size={24} />
                </div>
                <h5 style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 6px 0' }}>
                  Đơn đã duyệt — Chuyên viên kiểm dịch đang thiết lập danh mục hồ sơ
                </h5>
                <p style={{ fontSize: '13px', color: '#64748b', maxWidth: '520px', margin: '0 auto', lineHeight: 1.5 }}>
                  Chuyên viên vận tải & kiểm dịch (Specialist) đang rà soát các quy chuẩn y tế, kiểm dịch và hải quan cho điểm đến <strong>{checklist?.destinationCountry || request.destination}</strong>. Quý khách sẽ nhận được thông báo ngay khi danh mục hồ sơ được thiết lập để tiến hành nộp.
                </p>
              </div>
            ) : (
              /* CASE 3: Specialist has reviewed & sent official requirements checklist */
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {/* Official Notification Header */}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '280px' }}>
                    <CheckCircle2 size={18} color="#16a34a" style={{ flexShrink: 0 }} />
                    <p style={{ fontSize: '13px', color: '#166534', margin: 0, lineHeight: 1.4 }}>
                      <strong>Danh mục hồ sơ chính thức do Chuyên viên yêu cầu</strong> cho hành trình đến{' '}
                      <strong>{checklist?.destinationCountry || request.destination}</strong>
                      {checklist?.isUsingGlobalBaseline ? ' (Áp dụng Tiêu chuẩn Quốc tế Cơ bản WOAH/FEI)' : ''}.
                    </p>
                  </div>

                  {totalMissingCount > 0 && (
                    <button
                      onClick={() => handleOpenBatchUpload()}
                      style={{
                        padding: '7px 14px',
                        borderRadius: '8px',
                        backgroundColor: '#16a34a',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
                      }}
                    >
                      <Upload size={13} /> ⚡ Nộp trọn bộ hồ sơ (Nộp tất cả)
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
                        {/* Horse subheader */}
                        <div
                          style={{
                            padding: '12px 24px',
                            backgroundColor: '#fafafa',
                            borderBottom: '1px solid #f1f5f9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-heading)' }}>
                              Ngựa: {horseItem.horseName}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {(() => {
                              const hasRejected = horseItem.documents?.some((d: any) => d.status === 'rejected');
                              const hasMissing = horseItem.missingRegulations.length > 0;

                              let badgeBg = '#dcfce7';
                              let badgeColor = '#15803d';
                              let badgeText = 'Đủ hồ sơ hợp lệ (Đã duyệt)';

                              if (horseItem.isCompliant) {
                                badgeBg = '#dcfce7';
                                badgeColor = '#15803d';
                                badgeText = 'Đủ hồ sơ hợp lệ (Đã duyệt)';
                              } else if (hasRejected) {
                                badgeBg = '#fee2e2';
                                badgeColor = '#b91c1c';
                                badgeText = 'Có hồ sơ bị từ chối (Cần nộp lại)';
                              } else if (hasMissing) {
                                badgeBg = '#fee2e2';
                                badgeColor = '#b91c1c';
                                badgeText = `Còn thiếu ${horseItem.missingRegulations.length} giấy tờ`;
                              } else {
                                badgeBg = '#fef3c7';
                                badgeColor = '#b45309';
                                badgeText = 'Đã nộp đủ hồ sơ (Chờ duyệt)';
                              }

                              return (
                                <span
                                  style={{
                                    fontSize: '11.5px',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    backgroundColor: badgeBg,
                                    color: badgeColor,
                                  }}
                                >
                                  {badgeText}
                                </span>
                              );
                            })()}

                            {!horseItem.isCompliant && horseItem.missingRegulations.length > 0 && (
                              <button
                                onClick={() => handleOpenBatchUpload(horseItem)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  backgroundColor: '#2563eb',
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
                                <Upload size={12} /> Nộp tất cả ({horseItem.missingRegulations.length} mục)
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Missing items for this horse */}
                        {horseItem.missingRegulations.map((reg) => (
                          <div
                            key={`missing-${reg.id}`}
                            style={{
                              padding: '14px 24px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              borderBottom: '1px solid #f8fafc',
                              backgroundColor: '#fff5f5',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0, paddingRight: '16px' }}>
                              <div
                                style={{
                                  width: '36px',
                                  height: '36px',
                                  borderRadius: '8px',
                                  backgroundColor: '#fee2e2',
                                  color: '#dc2626',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                }}
                              >
                                <AlertTriangle size={18} />
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <h5 style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>
                                  {reg.description || reg.documentType}
                                </h5>
                                <p style={{ fontSize: '11.5px', color: '#dc2626', margin: '2px 0 0 0', fontWeight: 500 }}>
                                  Bắt buộc nộp theo quy định {reg.country}
                                </p>
                              </div>
                            </div>

                            {/* Status Column (Aligned) */}
                            <div style={{ width: '140px', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                              <span
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  fontSize: '11.5px',
                                  fontWeight: 700,
                                  backgroundColor: '#fee2e2',
                                  color: '#b91c1c',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  minWidth: '96px',
                                  justifyContent: 'center',
                                }}
                              >
                                <AlertTriangle size={12} /> Chưa nộp
                              </span>
                            </div>

                            {/* Actions Column (Aligned) */}
                            <div style={{ width: '200px', flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                              <button
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
                                }}
                              >
                                <Upload size={13} /> Tải lên ngay
                              </button>
                            </div>
                          </div>
                        ))}

                        {/* Uploaded items for this horse */}
                        {horseItem.documents.map((doc) => {
                          const isDocApproved = doc.status === 'approved';
                          const isDocSubmitted = doc.status === 'submitted';
                          const isDocRejected = doc.status === 'rejected';

                          return (
                            <div
                              key={`doc-${doc.id}`}
                              style={{
                                padding: '14px 24px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                borderBottom: '1px solid #f8fafc',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0, paddingRight: '16px' }}>
                                <div
                                  style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '8px',
                                    backgroundColor: isDocApproved ? '#dcfce7' : isDocRejected ? '#fee2e2' : '#f1f5f9',
                                    color: isDocApproved ? '#15803d' : isDocRejected ? '#dc2626' : '#64748b',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                  }}
                                >
                                  <FileText size={18} />
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <h5 style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>
                                    {doc.regulationTitle || doc.docType}
                                  </h5>
                                  <p style={{ fontSize: '11.5px', color: '#64748b', margin: '2px 0 0 0' }}>
                                    {doc.docNumber ? `Số: ${doc.docNumber} • ` : ''}Tải lên:{' '}
                                    {new Date(doc.createdAt).toLocaleDateString('vi-VN')}
                                    {doc.reviewerNotes && (
                                      <span style={{ color: isDocRejected ? '#dc2626' : '#2563eb', marginLeft: '6px' }}>
                                        (Ghi chú: {doc.reviewerNotes})
                                      </span>
                                    )}
                                  </p>
                                </div>
                              </div>

                              {/* Status Column (Aligned) */}
                              <div style={{ width: '140px', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                                <span
                                  style={{
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    fontSize: '11.5px',
                                    fontWeight: 700,
                                    backgroundColor: isDocApproved
                                      ? '#dcfce7'
                                      : isDocSubmitted
                                      ? '#fef3c7'
                                      : isDocRejected
                                      ? '#fee2e2'
                                      : '#f1f5f9',
                                    color: isDocApproved
                                      ? '#15803d'
                                      : isDocSubmitted
                                      ? '#b45309'
                                      : isDocRejected
                                      ? '#b91c1c'
                                      : '#64748b',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    minWidth: '96px',
                                    justifyContent: 'center',
                                  }}
                                >
                                  {isDocApproved && <CheckCircle size={12} />}
                                  {isDocSubmitted && <Clock size={12} />}
                                  {isDocRejected && <XCircle size={12} />}
                                  {isDocApproved
                                    ? 'Đã duyệt'
                                    : isDocSubmitted
                                    ? 'Chờ duyệt'
                                    : isDocRejected
                                    ? 'Từ chối'
                                    : doc.status}
                                </span>
                              </div>

                              {/* Actions Column (Aligned) */}
                              <div style={{ width: '200px', flexShrink: 0, display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                {doc.fileUrl && (
                                  <a
                                    href={doc.fileUrl.startsWith('http') ? doc.fileUrl : `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000'}${doc.fileUrl}`}
                                    target="_blank"
                                    rel="noreferrer"
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
                                      textDecoration: 'none',
                                      backgroundColor: '#ffffff',
                                    }}
                                  >
                                    <Eye size={13} /> Xem tệp
                                  </a>
                                )}

                                {(isDocRejected || isDocSubmitted) && (
                                  <button
                                    onClick={() => handleOpenReupload(doc, horseItem.horseId)}
                                    style={{
                                      padding: '5px 10px',
                                      borderRadius: '6px',
                                      backgroundColor: isDocRejected ? '#dc2626' : '#eff6ff',
                                      color: isDocRejected ? '#ffffff' : '#2563eb',
                                      border: isDocRejected ? 'none' : '1px solid #bfdbfe',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                    title="Chọn tệp mới để cập nhật cho hồ sơ này"
                                  >
                                    <RefreshCw size={12} />
                                    {isDocRejected ? 'Nộp lại' : 'Cập nhật'}
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
                    Chưa có danh mục hồ sơ được khởi tạo.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 6. REQUEST INFORMATION */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              border: '1px solid var(--border-card)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-light)', backgroundColor: '#f8fafc' }}>
              <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                Request Information
              </h4>
            </div>
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Transportation Type</span>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginTop: '2px' }}>
                    {request.transportationType}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Departure Date</span>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginTop: '2px' }}>
                    {request.departureDate}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Expected Arrival</span>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginTop: '2px' }}>
                    {request.estimatedArrivalDate}
                  </div>
                </div>
              </div>

              <div style={{ paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
                  Special Requirements & Notes
                </span>
                <div style={{ backgroundColor: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-card)' }}>
                  <p style={{ fontSize: '13.5px', color: 'var(--text-body)', margin: 0, fontStyle: 'italic' }}>
                    "{request.notes || 'Temperature-controlled transportation required. Silver Star requires timothy hay during the flight due to sensitive digestion.'}"
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'sticky', top: '108px' }}>
          {/* ACTION PANEL (Sticky Missing Documents Warning) */}
          {hasMissingDocs ? (
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '2px solid #dc2626',
                borderRadius: '16px',
                padding: '20px',
                boxShadow: 'var(--shadow-md)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '6px', backgroundColor: '#dc2626' }} />

              <div style={{ display: 'flex', gap: '12px' }}>
                <AlertTriangle size={20} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                    Hồ sơ cần nộp ({totalMissingCount} mục)
                  </h4>
                  <p style={{ fontSize: '12.5px', color: '#475569', margin: '6px 0 16px 0', lineHeight: 1.4 }}>
                    Chuyên viên kiểm dịch đã phát hành yêu cầu nộp hồ sơ. Còn <strong>{totalMissingCount}</strong> mục tài liệu cần hoàn tất để đảm bảo điều kiện xuất nhập cảnh.
                  </p>
                  <button
                    onClick={() => {
                      if (totalMissingCount > 1) {
                        handleOpenBatchUpload();
                      } else {
                        handleOpenUpload();
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(220, 38, 38, 0.25)',
                    }}
                  >
                    <Upload size={14} /> ⚡ Nộp trọn bộ {totalMissingCount} hồ sơ (Nộp tất cả)
                  </button>
                </div>
              </div>
            </div>
          ) : hasRejectedDocs ? (
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #fecaca',
                padding: '20px',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: '6px',
                  backgroundColor: '#dc2626',
                }}
              />
              <div style={{ display: 'flex', gap: '12px' }}>
                <AlertTriangle size={20} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                    Hồ sơ cần nộp lại ({totalRejectedCount} mục bị từ chối)
                  </h4>
                  <p style={{ fontSize: '12.5px', color: '#475569', margin: '6px 0 0 0', lineHeight: 1.4 }}>
                    Chuyên viên kiểm dịch yêu cầu nộp lại {totalRejectedCount} tài liệu chưa đạt chuẩn. Vui lòng bấm <strong>"Nộp lại"</strong> tại dòng tài liệu bị từ chối bên dưới để tải lên tệp mới.
                  </p>
                </div>
              </div>
            </div>
          ) : isApproved && requirementsSent && (
            <div
              style={{
                backgroundColor: checklist?.isFullyCompliant ? '#f0fdf4' : '#eff6ff',
                borderRadius: '16px',
                border: checklist?.isFullyCompliant ? '1px solid #bbf7d0' : '1px solid #bfdbfe',
                padding: '20px',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: '6px',
                  backgroundColor: checklist?.isFullyCompliant ? '#16a34a' : '#2563eb',
                }}
              />
              <div style={{ display: 'flex', gap: '12px' }}>
                {checklist?.isFullyCompliant ? (
                  <CheckCircle2 size={20} color="#16a34a" style={{ flexShrink: 0, marginTop: '2px' }} />
                ) : (
                  <Clock size={20} color="#2563eb" style={{ flexShrink: 0, marginTop: '2px' }} />
                )}
                <div>
                  <h4 style={{ fontSize: '15px', fontWeight: 700, color: checklist?.isFullyCompliant ? '#166534' : '#1e40af', margin: 0 }}>
                    {checklist?.isFullyCompliant ? 'Hồ sơ đã được phê duyệt 100%' : 'Đã nộp đủ hồ sơ (Chờ duyệt)'}
                  </h4>
                  <p style={{ fontSize: '12.5px', color: checklist?.isFullyCompliant ? '#15803d' : '#1e3a8a', margin: '6px 0 0 0', lineHeight: 1.4 }}>
                    {checklist?.isFullyCompliant
                      ? 'Tất cả các tài liệu kiểm dịch và pháp lý đã được duyệt hợp lệ. Chuyến đi đã đủ điều kiện xuất phát.'
                      : `Quý khách đã nộp đầy đủ các chứng từ theo yêu cầu (${checklist?.approvedDocumentsCount || 0}/${checklist?.totalRequiredDocuments || 0} đã duyệt). Chuyên viên kiểm dịch đang trong quá trình thẩm định hồ sơ.`}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* REQUEST ACTIVITY / AUDIT HISTORY */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              border: '1px solid var(--border-card)',
              padding: '24px',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)', margin: '0 0 20px 0' }}>
              Request Activity
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', paddingLeft: '22px' }}>
              {/* Vertical line */}
              <div style={{ position: 'absolute', top: '8px', bottom: '8px', left: '7px', width: '2px', backgroundColor: '#e2e8f0' }} />

              {request.activities?.map((act: any, index: number) => (
                <div key={act.id} style={{ position: 'relative' }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: '-19px',
                      top: '4px',
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: index === 0 ? 'var(--primary)' : '#cbd5e1',
                      boxShadow: '0 0 0 3px #ffffff',
                    }}
                  />
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>{act.timestamp}</span>
                  <div style={{ fontSize: '13.5px', color: 'var(--text-heading)', fontWeight: 500, marginTop: '2px' }}>
                    {act.description}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{act.actor}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

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

      {/* Live Tracking Modal */}
      <TripTrackingModal
        isOpen={isTrackingOpen}
        onClose={() => setIsTrackingOpen(false)}
        request={request}
      />

      {/* Resubmit Modal */}
      <Modal
        isOpen={isResubmitOpen}
        onClose={() => setIsResubmitOpen(false)}
        title="Edit & Resubmit Request"
        subtitle={`Request ID: ${request.requestCode}`}
        maxWidth="500px"
      >
        <div style={{ padding: '24px' }}>
          {resubmitError && (
            <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', backgroundColor: '#fef2f2', color: '#b91c1c', fontSize: '13px', border: '1px solid #fecaca' }}>
              <AlertTriangle size={14} style={{ display: 'inline', marginRight: '6px' }} />
              {resubmitError}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>What changes have you made?</label>
            <textarea
              value={resubmitNotes}
              onChange={(e) => setResubmitNotes(e.target.value)}
              placeholder="e.g. I have updated the pickup date and attached new health certificates..."
              style={{
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                fontSize: '14px',
                minHeight: '100px',
                resize: 'vertical',
                outline: 'none',
                boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.05)',
                width: '100%',
                boxSizing: 'border-box'
              }}
              autoFocus
            />
            <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
              The manager will review these notes along with your updated request.
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setIsResubmitOpen(false)}
              disabled={isResubmitting}
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                backgroundColor: '#ffffff',
                color: '#374151',
                fontWeight: 600,
                fontSize: '13px',
                cursor: isResubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={submitResubmit}
              disabled={isResubmitting}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '13px',
                cursor: isResubmitting ? 'not-allowed' : 'pointer',
                opacity: isResubmitting ? 0.7 : 1,
              }}
            >
              {isResubmitting ? 'Resubmitting...' : 'Submit Now'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
