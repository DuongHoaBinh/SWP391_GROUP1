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
} from 'lucide-react';
import { useCustomerStore } from '@/lib/customer-store';
import { DocumentUploadModal } from '@/features/documents/components/DocumentUploadModal';
import { TripTrackingModal } from '@/features/tracking/components/TripTrackingModal';
import { apiClient } from '@/lib/api-client';
import { Modal } from '@/components/ui/Modal';
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
    IN_REVIEW: 2,
    approved: 4,
    change_requested: 2,
    rejected: 2,
    in_transit: 6,
    completed: 7,
    cancelled: 1,
  };
  const activeStepIndex = statusStepMap[data.status] || 2;

  const timeline = [
    { stage: 1, name: 'Request Created', status: 'completed' },
    { stage: 2, name: 'Docs Submitted', status: activeStepIndex >= 2 ? 'completed' : 'pending' },
    { stage: 3, name: 'Document Review', status: activeStepIndex === 2 ? 'active' : activeStepIndex > 2 ? 'completed' : 'pending' },
    { stage: 4, name: 'Request Approved', status: activeStepIndex === 4 ? 'active' : activeStepIndex > 4 ? 'completed' : 'pending' },
    { stage: 5, name: 'Trip Planned', status: activeStepIndex >= 5 ? 'completed' : 'pending' },
    { stage: 6, name: 'In Transit', status: activeStepIndex === 6 ? 'active' : activeStepIndex > 6 ? 'completed' : 'pending' },
    { stage: 7, name: 'Handover Completed', status: activeStepIndex === 7 ? 'completed' : 'pending' },
  ];

  const statusLabels: Record<string, string> = {
    requested: 'Pending Approval',
    under_review: 'Under Review',
    IN_REVIEW: 'Under Review',
    approved: 'Approved',
    change_requested: 'Change Requested',
    rejected: 'Rejected',
    in_transit: 'In Transit',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };

  return {
    ...data,
    requestCode: data.requestCode || `REQ-${String(data.id).padStart(3, '0')}`,
    horse: normalizedHorses[0]?.horse || { name: 'Racehorse' },
    horses: normalizedHorses,
    documents,
    timeline,
    activeStepIndex,
    statusLabel: statusLabels[data.status] || data.status || 'Under Review',
    origin: data.originLocation,
    originCode: 'SGN, VN',
    destination: data.destinationLocation,
    destinationCode: 'DEST',
    estimatedDistance: '1,100 km',
    estimatedDuration: '12 hours',
    createdDate: data.createdAt ? new Date(data.createdAt).toLocaleDateString('en-GB') : '23 Sep 2026',
    departureDate: data.requestedDate ? new Date(data.requestedDate).toLocaleDateString('en-GB') : 'TBD',
    estimatedArrivalDate: data.expectedArrivalDate ? new Date(data.expectedArrivalDate).toLocaleDateString('en-GB') : 'TBD',
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

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  
  // Resubmit Modal States
  const [isResubmitOpen, setIsResubmitOpen] = useState(false);
  const [resubmitNotes, setResubmitNotes] = useState('');
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [resubmitError, setResubmitError] = useState('');

  if (loading) {
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

  if (error || !request) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px',
          padding: '48px 24px',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e5e7eb',
          textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: '#fef2f2',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
          }}
        >
          <AlertTriangle size={32} />
        </div>
        <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>
          Không tìm thấy đơn vận chuyển
        </h3>
        <p style={{ fontSize: '14px', color: '#6b7280', maxWidth: '440px', margin: '0 0 24px 0', lineHeight: 1.5 }}>
          Yêu cầu vận chuyển với mã ID &ldquo;{requestId}&rdquo; không tồn tại hoặc đã bị xóa khỏi hệ thống.
        </p>
        <Link
          href="/customer/requests"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            textDecoration: 'none',
            boxShadow: '0 1px 2px rgba(37, 99, 235, 0.2)',
          }}
        >
          ← Quay lại danh sách đơn
        </Link>
      </div>
    );
  }

  const hasMissingDocs = request.documents?.some((d: any) => d.status === 'Missing');

  const handleUploadSuccess = (uploadedDoc: any) => {
    uploadDocumentForRequest(request.requestCode, uploadedDoc.title);
    setIsUploadOpen(false);
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
                backgroundColor: request.status === 'CANCELLED' ? '#fee2e2' : '#fef3c7',
                color: request.status === 'CANCELLED' ? '#dc2626' : '#b45309',
                border: request.status === 'CANCELLED' ? '1px solid #fecaca' : '1px solid #fde68a',
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
            aria-label="More options"
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
                  width: `${(request.activeStepIndex / 6) * 88}%`,
                  height: '4px',
                  backgroundColor: '#16a34a',
                  zIndex: 0,
                  borderRadius: '999px',
                  transition: 'width 0.3s ease',
                }}
              />

              {/* 7 Stages */}
              <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
                {request.timeline?.map((stage: any) => {
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
                            {stage.stage === 4 && <ThumbsUp size={14} />}
                            {stage.stage === 5 && <CalendarCheck size={14} />}
                            {stage.stage === 6 && <Plane size={14} />}
                            {stage.stage === 7 && <Flag size={14} />}
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
                  {request.transportationType || 'International'}
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
                  {request.origin}, VN <ArrowRight size={14} color="#94a3b8" /> {request.destination}, SG
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
                Horses ({request.horses?.length || 2})
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
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: item.isComplete ? '#15803d' : '#dc2626',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          {item.isComplete ? <Check size={14} /> : <AlertTriangle size={14} />}
                          {item.docsSummary || '4/4 Complete'}
                        </span>
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

          {/* 5. TRANSPORT DOCUMENTS */}
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
                Transport Documents
              </h4>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {request.documents?.map((doc: any) => {
                const isApproved = doc.status === 'Approved';
                const isReview = doc.status === 'Under Review';
                const isMissing = doc.status === 'Missing';

                return (
                  <div
                    key={doc.id}
                    style={{
                      padding: '16px 24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid var(--border-light)',
                      backgroundColor: isMissing ? '#fff5f5' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '8px',
                          backgroundColor: isMissing ? '#fee2e2' : '#f1f5f9',
                          color: isMissing ? '#dc2626' : '#64748b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <FileText size={20} />
                      </div>
                      <div>
                        <h5 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>
                          {doc.title}
                        </h5>
                        <p
                          style={{
                            fontSize: '12px',
                            color: isMissing ? '#dc2626' : '#64748b',
                            margin: '2px 0 0 0',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {isMissing && <AlertTriangle size={12} />}
                          {doc.uploadedDate ? `Uploaded on ${doc.uploadedDate}` : doc.warning || 'Additional document required.'}
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          backgroundColor: isApproved ? '#dcfce7' : isReview ? '#fef3c7' : '#fee2e2',
                          color: isApproved ? '#15803d' : isReview ? '#b45309' : '#b91c1c',
                        }}
                      >
                        {doc.status}
                      </span>
                      {isMissing ? (
                        <button
                          onClick={() => setIsUploadOpen(true)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            backgroundColor: '#dc2626',
                            color: '#ffffff',
                            fontSize: '12px',
                            fontWeight: 600,
                            border: 'none',
                          }}
                        >
                          Upload Missing Document
                        </button>
                      ) : (
                        <button aria-label="View document details" style={{ color: '#94a3b8', border: 'none', background: 'none' }}>
                          <Eye size={18} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
                    {request.transportationType || 'International'}
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
          {hasMissingDocs && (
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
                    Action Required
                  </h4>
                  <p style={{ fontSize: '12.5px', color: '#475569', margin: '6px 0 16px 0', lineHeight: 1.4 }}>
                    Please upload the missing documents to continue the approval process for this transport request.
                  </p>
                  <button
                    onClick={() => setIsUploadOpen(true)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      border: 'none',
                      boxShadow: '0 2px 8px rgba(220, 38, 38, 0.25)',
                    }}
                  >
                    <Upload size={14} /> Upload Missing Documents
                  </button>
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
        onClose={() => setIsUploadOpen(false)}
        onSuccess={handleUploadSuccess}
      />

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
