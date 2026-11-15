'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Plane,
  FileText,
  Upload,
  ChevronRight,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  MapPin,
  Shield,
  ArrowUpRight,
  MoreHorizontal,
  FileCheck2,
  RefreshCw,
} from 'lucide-react';
import { DocumentUploadModal } from '@/features/documents/components/DocumentUploadModal';
import { TripTrackingModal } from '@/features/tracking/components/TripTrackingModal';
import { useCustomerStore } from '@/lib/customer-store';
import { TransportRequest, UserProfile } from '@/lib/types';
import { getCurrentUser } from '@/lib/auth';
import { mockCurrentUser } from '@/lib/mock-data';
import { apiClient } from '@/lib/api-client';
import { documentsApi } from '@/features/documents/api/documents.api';

const getStatusBadge = (status: string) => {
  const s = (status || '').toLowerCase();
  if (s === 'requested' || s === 'under_review') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, backgroundColor: '#fffbeb', color: '#d97706' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#d97706' }} />
        Pending Review
      </span>
    );
  }
  if (s === 'approved') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, backgroundColor: '#ecfdf5', color: '#16a34a' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#16a34a' }} />
        Approved
      </span>
    );
  }
  if (s === 'planning') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, backgroundColor: '#eff6ff', color: '#2563eb' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#2563eb' }} />
        In Planning
      </span>
    );
  }
  if (s === 'in_transit') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, backgroundColor: '#eff6ff', color: '#1d4ed8' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#3b82f6' }} />
        In Transit
      </span>
    );
  }
  if (s === 'completed') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, backgroundColor: '#f0fdf4', color: '#15803d' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#16a34a' }} />
        Completed
      </span>
    );
  }
  if (s === 'change_requested') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, backgroundColor: '#fff7ed', color: '#c2410c' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ea580c' }} />
        Change Requested
      </span>
    );
  }
  if (s === 'rejected') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, backgroundColor: '#fef2f2', color: '#dc2626' }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#dc2626' }} />
        Rejected
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, backgroundColor: '#f1f5f9', color: '#475569' }}>
      {status}
    </span>
  );
};

export default function CustomerDashboardPage() {
  const router = useRouter();

  const {
    horses,
    notifications,
    uploadDocumentForRequest,
    markAllNotificationsRead,
    refreshHorses,
  } = useCustomerStore();

  const [currentUser, setCurrentUser] = useState<UserProfile>(mockCurrentUser);
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [docCount, setDocCount] = useState({ pending: 0, missing: 0 });

  const loadData = async () => {
    try {
      setIsLoadingOrders(true);
      const [ordersRes, docsRes] = await Promise.all([
        apiClient<any[]>('/orders/my-orders').catch(() => []),
        documentsApi.getDocuments().catch(() => []),
      ]);
      if (Array.isArray(ordersRes)) {
        setMyOrders(ordersRes);
      }
      if (Array.isArray(docsRes)) {
        const pending = docsRes.filter(
          (d: any) =>
            (d.status || '').toUpperCase() === 'PENDING' ||
            (d.status || '').toUpperCase() === 'UNDER_REVIEW'
        ).length;
        const missing = docsRes.filter(
          (d: any) => (d.status || '').toUpperCase() === 'MISSING'
        ).length;
        setDocCount({ pending, missing });
      }
    } catch (err) {
      console.warn('Customer dashboard load error:', err);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  useEffect(() => {
    setCurrentUser(getCurrentUser());
    const handleUserUpdate = () => {
      setCurrentUser(getCurrentUser());
    };
    window.addEventListener('auth-user-updated', handleUserUpdate);
    loadData();
    refreshHorses();
    return () => {
      window.removeEventListener('auth-user-updated', handleUserUpdate);
    };
  }, []);

  // Modals state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [activeRequestForUpload, setActiveRequestForUpload] = useState<string>('');
  const [trackingRequest, setTrackingRequest] = useState<TransportRequest | null>(null);

  const handleDocumentUploadSuccess = (uploadedDoc: any) => {
    if (activeRequestForUpload) {
      uploadDocumentForRequest(activeRequestForUpload, uploadedDoc.title);
    }
    setIsUploadModalOpen(false);
    loadData();
  };

  // Metrics
  const activeShipments = myOrders.filter(
    (o) => o.status !== 'completed' && o.status !== 'cancelled' && o.status !== 'rejected'
  );
  const inTransitCount = myOrders.filter(
    (o) => o.status === 'in_transit' || o.status === 'planning' || o.status === 'IN_TRANSIT'
  ).length;
  const completedCount = myOrders.filter(
    (o) => o.status === 'completed' || o.status === 'COMPLETED'
  ).length;
  const pendingDocsCount = docCount.pending + docCount.missing;

  // Featured shipment for banner and upcoming trip card
  const upcomingTrip =
    myOrders.find((o) => o.status === 'in_transit') ||
    myOrders.find((o) => o.status === 'planning') ||
    myOrders.find((o) => o.status === 'approved') ||
    myOrders[0];

  const upcomingHorseName = upcomingTrip?.horses?.[0]?.name || 'Chiến mã';
  const upcomingOrigin = upcomingTrip?.originLocation?.split(',')?.[0]?.trim() || 'Điểm xuất phát';
  const upcomingDest = upcomingTrip?.destinationLocation?.split(',')?.[0]?.trim() || 'Điểm đến';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        padding: 0,
        minHeight: '100%',
        fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
      }}
    >
      {/* 1. HERO WELCOME BANNER */}
      <div
        style={{
          backgroundColor: '#0c1527',
          backgroundImage:
            'linear-gradient(rgba(37, 99, 235, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(37, 99, 235, 0.08) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          borderRadius: '18px',
          padding: '28px 34px',
          border: '1px solid rgba(37, 99, 235, 0.18)',
          boxShadow: '0 10px 30px rgba(12, 21, 39, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: '#94a3b8',
              textTransform: 'uppercase',
            }}
          >
            {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <h2
            suppressHydrationWarning
            style={{
              fontSize: '28px',
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            Xin chào, {currentUser.fullName || currentUser.name || 'Quý khách'}
          </h2>
          <p
            style={{
              fontSize: '14px',
              color: '#cbd5e1',
              margin: 0,
            }}
          >
            Tổng quan các chuyến vận chuyển ngựa đua và hồ sơ pháp lý của bạn.
          </p>

          {/* Badges in Hero */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
            {upcomingTrip ? (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  borderRadius: '999px',
                  padding: '5px 12px',
                  fontSize: '12px',
                  color: '#f1f5f9',
                  fontWeight: 500,
                }}
              >
                <Plane size={13} color="#60a5fa" />
                <span>
                  {upcomingHorseName} · {upcomingOrigin} → {upcomingDest}
                </span>
              </div>
            ) : null}

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                borderRadius: '999px',
                padding: '5px 12px',
                fontSize: '12px',
                color: '#f1f5f9',
                fontWeight: 500,
              }}
            >
              <FileText size={13} color={pendingDocsCount > 0 ? '#fbbf24' : '#34d399'} />
              <span>
                {pendingDocsCount > 0
                  ? `${pendingDocsCount} hồ sơ cần bổ sung / kiểm tra`
                  : 'Hồ sơ pháp lý hợp lệ'}
              </span>
            </div>
          </div>
        </div>

        {/* Primary CTA in Banner */}
        <button
          onClick={() => router.push('/customer/requests/new')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.45)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#1d4ed8')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#2563eb')}
        >
          <Plus size={18} strokeWidth={2.5} />
          Create Transport Request
        </button>
      </div>

      {/* 2. STAT SUMMARY METRIC CARDS (4 Cards) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '18px',
        }}
      >
        {/* Metric 1: Active Requests */}
        <div
          onClick={() => router.push('/customer/requests')}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            padding: '20px 22px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            cursor: 'pointer',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.06)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.03)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: '#eff6ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563eb',
              }}
            >
              <FileCheck2 size={20} />
            </div>
            <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#16a34a', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <span>●</span> Active
            </div>
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
            {activeShipments.length.toString().padStart(2, '0')}
          </div>
          <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', fontWeight: 500 }}>Active Requests</div>
        </div>

        {/* Metric 2: In Transit */}
        <div
          onClick={() => router.push('/customer/tracking')}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            padding: '20px 22px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            cursor: 'pointer',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.06)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.03)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: '#ecfeff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0891b2',
              }}
            >
              <Plane size={20} />
            </div>
            <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#2563eb', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#2563eb' }} />
              On schedule
            </div>
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
            {inTransitCount.toString().padStart(2, '0')}
          </div>
          <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', fontWeight: 500 }}>In Transit</div>
        </div>

        {/* Metric 3: Pending Documents */}
        <div
          onClick={() => router.push('/customer/documents')}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            padding: '20px 22px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            cursor: 'pointer',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.06)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.03)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: '#fffbeb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#d97706',
              }}
            >
              <FileText size={20} />
            </div>
            <div style={{ fontSize: '11.5px', fontWeight: 600, color: pendingDocsCount > 0 ? '#ea580c' : '#16a34a' }}>
              {pendingDocsCount > 0 ? 'Needs attention' : 'All clear'}
            </div>
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
            {pendingDocsCount.toString().padStart(2, '0')}
          </div>
          <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', fontWeight: 500 }}>Pending Documents</div>
        </div>

        {/* Metric 4: Completed Trips */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            padding: '20px 22px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: '#ecfdf5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#16a34a',
              }}
            >
              <CheckCircle2 size={20} />
            </div>
            <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#16a34a', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <span>✓</span> Delivered
            </div>
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
            {completedCount.toString().padStart(2, '0')}
          </div>
          <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', fontWeight: 500 }}>Completed Trips</div>
        </div>
      </div>

      {/* 3. ACTIVE TRANSPORT TABLE */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
          overflow: 'hidden',
        }}
      >
        {/* Table Section Header */}
        <div
          style={{
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f1f5f9',
          }}
        >
          <div>
            <h3 style={{ fontSize: '16.5px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Active Transport
            </h3>
            <p style={{ fontSize: '12.5px', color: '#64748b', margin: '2px 0 0 0' }}>
              {activeShipments.length} shipment(s) currently being managed
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={loadData}
              title="Làm mới danh sách"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '12.5px',
                fontWeight: 600,
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={14} className={isLoadingOrders ? 'animate-spin' : ''} />
              Refresh
            </button>
            <Link
              href="/customer/requests"
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#2563eb',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
              }}
            >
              View all &gt;
            </Link>
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px 24px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', color: '#64748b' }}>REQUEST ID</th>
                <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', color: '#64748b' }}>ROUTE</th>
                <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', color: '#64748b' }}>HORSE</th>
                <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', color: '#64748b' }}>DEPARTURE</th>
                <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', color: '#64748b' }}>ARRIVAL</th>
                <th style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', color: '#64748b' }}>STATUS</th>
                <th style={{ padding: '12px 24px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', color: '#64748b', textAlign: 'right' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {myOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                    {isLoadingOrders ? (
                      'Đang tải danh sách yêu cầu vận chuyển...'
                    ) : (
                      <div>
                        <p style={{ margin: '0 0 12px 0', fontSize: '14px' }}>
                          Bạn chưa có yêu cầu vận chuyển nào.
                        </p>
                        <button
                          onClick={() => router.push('/customer/requests/new')}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#2563eb',
                            color: '#ffffff',
                            borderRadius: '8px',
                            border: 'none',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Tạo đơn vận chuyển mới
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                myOrders.slice(0, 6).map((order) => {
                  const reqCode = order.requestCode || `REQ-${String(order.id).padStart(3, '0')}`;
                  const horseNames =
                    order.horses && order.horses.length > 0
                      ? order.horses.map((h: any) => h.name).join(', ')
                      : `${order.requestedHorseCount || 1} chiến mã`;
                  const depDate = order.requestedDate
                    ? new Date(order.requestedDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '—';
                  const arrDate = order.arrivalDate
                    ? new Date(order.arrivalDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : 'TBD';

                  return (
                    <tr key={order.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '16px 24px', fontWeight: 700, color: '#0f172a' }}>
                        {reqCode}
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{order.originLocation}</div>
                          </div>
                          <span style={{ color: '#94a3b8' }}>→</span>
                          <div>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{order.destinationLocation}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              backgroundColor: '#eff6ff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '11px',
                              color: '#2563eb',
                            }}
                          >
                            {horseNames[0] || 'H'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{horseNames}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                              {order.horses?.length || order.requestedHorseCount || 1} con ngựa
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px', color: '#334155', fontWeight: 500 }}>{depDate}</td>
                      <td style={{ padding: '16px 20px', color: '#334155', fontWeight: 500 }}>{arrDate}</td>
                      <td style={{ padding: '16px 20px' }}>{getStatusBadge(order.status)}</td>
                      <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                        <button
                          onClick={() => router.push(`/customer/requests/${order.id}`)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#fff',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#2563eb',
                            cursor: 'pointer',
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. THREE-COLUMN SECTION: Upcoming Trip | Recent Requests | Notifications */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
          gap: '20px',
          alignItems: 'stretch',
        }}
      >
        {/* Column 1: Upcoming Trip */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          {upcomingTrip ? (
            <div>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div>
                  <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Upcoming Trip</h4>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    {upcomingTrip.requestCode || `REQ-${String(upcomingTrip.id).padStart(3, '0')}`}
                  </div>
                </div>
                {getStatusBadge(upcomingTrip.status)}
              </div>

              {/* Horse Profile Card */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    backgroundColor: '#0f172a',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '13px',
                  }}
                >
                  {upcomingHorseName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{upcomingHorseName}</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    {upcomingTrip.horses?.length || upcomingTrip.requestedHorseCount || 1} con ngựa đăng ký
                  </div>
                </div>
              </div>

              {/* Dates Bar */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  marginBottom: '20px',
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Departure</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                    {upcomingTrip.requestedDate
                      ? new Date(upcomingTrip.requestedDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Est. arrival</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                    {upcomingTrip.arrivalDate
                      ? new Date(upcomingTrip.arrivalDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'TBD'}
                  </div>
                </div>
              </div>

              {/* Milestones / Route */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    1
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Điểm đón ngựa</div>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>{upcomingTrip.originLocation}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: '#eff6ff',
                      border: '2px solid #2563eb',
                      color: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    2
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Điểm bàn giao cuối</div>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>{upcomingTrip.destinationLocation}</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 10px', color: '#64748b' }}>
              <Plane size={36} color="#94a3b8" style={{ margin: '0 auto 12px auto' }} />
              <h5 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>Chưa có chuyến đi</h5>
              <p style={{ fontSize: '12.5px', margin: 0 }}>Tạo yêu cầu vận chuyển để xem hành trình tại đây.</p>
            </div>
          )}

          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
            <button
              onClick={() => {
                if (upcomingTrip) {
                  router.push(`/customer/requests/${upcomingTrip.id}`);
                } else {
                  router.push('/customer/requests/new');
                }
              }}
              style={{
                width: '100%',
                padding: '9px',
                borderRadius: '8px',
                backgroundColor: '#eff6ff',
                color: '#2563eb',
                border: '1px solid #bfdbfe',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {upcomingTrip ? 'Xem chi tiết chuyến đi' : 'Tạo đơn mới ngay'}
            </button>
          </div>
        </div>

        {/* Column 2: Recent Requests */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '24px 24px 0 24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Recent Requests</h4>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Latest submissions</div>
              </div>
              <Link href="/customer/requests" style={{ fontSize: '12.5px', fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}>
                See all
              </Link>
            </div>

            {/* List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {myOrders.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                  Chưa có đơn nào gần đây
                </div>
              ) : (
                myOrders.slice(0, 4).map((req) => {
                  const code = req.requestCode || `REQ-${String(req.id).padStart(3, '0')}`;
                  const orig = req.originLocation?.split(',')?.[0]?.trim() || 'Origin';
                  const dest = req.destinationLocation?.split(',')?.[0]?.trim() || 'Destination';
                  const dateStr = req.requestedDate
                    ? new Date(req.requestedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : 'Recent';

                  return (
                    <div
                      key={req.id}
                      onClick={() => router.push(`/customer/requests/${req.id}`)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: '1px solid #f1f5f9',
                        backgroundColor: '#ffffff',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc')}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#ffffff')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                          <FileText size={16} />
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{code}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            {orig} → {dest} · {dateStr}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {getStatusBadge(req.status)}
                        <ChevronRight size={14} color="#94a3b8" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <button
            onClick={() => router.push('/customer/requests')}
            style={{
              width: '100%',
              padding: '14px',
              border: 'none',
              borderTop: '1px solid #f1f5f9',
              backgroundColor: '#fafbfc',
              fontSize: '13px',
              fontWeight: 700,
              color: '#0f172a',
              cursor: 'pointer',
              marginTop: '16px',
              textAlign: 'center',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#f1f5f9')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#fafbfc')}
          >
            View Details
          </button>
        </div>

        {/* Column 3: Notifications */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '24px 24px 0 24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Notifications</h4>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  {notifications.filter((n) => !n.isRead).length} unread
                </div>
              </div>
              <button
                onClick={markAllNotificationsRead}
                style={{
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: '#64748b',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#2563eb')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#64748b')}
              >
                Mark all read
              </button>
            </div>

            {/* Notifications List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {notifications.slice(0, 3).map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => router.push('/customer/notifications')}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    backgroundColor: '#fafbfc',
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      backgroundColor: notif.type === 'CRITICAL' ? '#fef2f2' : '#eff6ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: notif.type === 'CRITICAL' ? '#dc2626' : '#2563eb',
                      flexShrink: 0,
                      marginTop: '2px',
                    }}
                  >
                    {notif.type === 'CRITICAL' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                  </div>
                  <div style={{ flex: 1, paddingRight: '12px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', lineHeight: 1.35 }}>
                      {notif.title}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px' }}>
                      {notif.message || notif.timeAgo}
                    </div>
                  </div>
                  {!notif.isRead && (
                    <span
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        backgroundColor: '#2563eb',
                        position: 'absolute',
                        top: '14px',
                        right: '12px',
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <Link
            href="/customer/notifications"
            style={{
              display: 'block',
              textAlign: 'center',
              padding: '14px',
              borderTop: '1px solid #f1f5f9',
              backgroundColor: '#fafbfc',
              fontSize: '13px',
              fontWeight: 700,
              color: '#2563eb',
              textDecoration: 'none',
              marginTop: '16px',
            }}
          >
            View all notifications
          </Link>
        </div>
      </div>

      {/* 5. QUICK ACTIONS SECTION (4 Cards Grid) */}
      <div>
        <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '14px' }}>
          Quick Actions
        </h4>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
          }}
        >
          {/* Card 1: Create Transport Request */}
          <div
            onClick={() => router.push('/customer/requests/new')}
            style={{
              backgroundColor: '#2563eb',
              borderRadius: '14px',
              padding: '20px',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '110px',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 20px rgba(37, 99, 235, 0.45)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 14px rgba(37, 99, 235, 0.35)';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Plus size={16} strokeWidth={2.5} />
              </div>
              <ArrowUpRight size={18} color="rgba(255, 255, 255, 0.7)" />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>Create Transport Request</div>
              <div style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.8)', marginTop: '2px' }}>
                Book a new cross-border shipment
              </div>
            </div>
          </div>

          {/* Card 2: Upload Documents */}
          <div
            onClick={() => {
              if (upcomingTrip) {
                setActiveRequestForUpload(upcomingTrip.requestCode || `REQ-${upcomingTrip.id}`);
              }
              setIsUploadModalOpen(true);
            }}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              padding: '20px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '110px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.06)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.03)';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: '#fff7ed',
                  border: '1px solid #fed7aa',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ea580c',
                }}
              >
                <Upload size={16} />
              </div>
              <ArrowUpRight size={18} color="#94a3b8" />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Upload Documents</div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                Health, passport & export permits
              </div>
            </div>
          </div>

          {/* Card 3: View My Horses */}
          <div
            onClick={() => router.push('/customer/horses')}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              padding: '20px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '110px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.06)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.03)';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: '#ecfdf5',
                  border: '1px solid #bbf7d0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#16a34a',
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 17v-1c0-4-3-7-7-7H9l-2-3H3l1 5-2 3v3h10" />
                  <path d="M12 12v5" />
                  <path d="M17 12v5" />
                  <circle cx="8" cy="7" r="1" />
                </svg>
              </div>
              <ArrowUpRight size={18} color="#94a3b8" />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>View My Horses</div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                {horses.length} horses registered
              </div>
            </div>
          </div>

          {/* Card 4: Track Trip */}
          <div
            onClick={() => router.push('/customer/tracking')}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              padding: '20px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              minHeight: '110px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.06)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.03)';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#2563eb',
                }}
              >
                <MapPin size={16} />
              </div>
              <ArrowUpRight size={18} color="#94a3b8" />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Track Trip</div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                Live status of {upcomingTrip?.requestCode || 'current shipments'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <DocumentUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={handleDocumentUploadSuccess}
      />

      <TripTrackingModal
        isOpen={Boolean(trackingRequest)}
        onClose={() => setTrackingRequest(null)}
        request={trackingRequest}
      />
    </div>
  );
}
