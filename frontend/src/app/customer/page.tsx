'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { DocumentUploadModal } from '@/features/documents/components/DocumentUploadModal';
import { TripTrackingModal } from '@/features/tracking/components/TripTrackingModal';
import { useCustomerStore } from '@/lib/customer-store';
import { TransportRequest, UserProfile } from '@/lib/types';
import { getCurrentUser } from '@/lib/auth';
import { mockCurrentUser } from '@/lib/mock-data';

export default function CustomerDashboardPage() {
  const router = useRouter();

  const {
    requests,
    metrics,
    notifications,
    uploadDocumentForRequest,
    markAllNotificationsRead,
  } = useCustomerStore();

  const [currentUser, setCurrentUser] = useState<UserProfile>(mockCurrentUser);

  React.useEffect(() => {
    setCurrentUser(getCurrentUser());
    const handleUserUpdate = () => {
      setCurrentUser(getCurrentUser());
    };
    window.addEventListener('auth-user-updated', handleUserUpdate);
    return () => {
      window.removeEventListener('auth-user-updated', handleUserUpdate);
    };
  }, []);

  // Modals state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [activeRequestForUpload, setActiveRequestForUpload] = useState<string>('TR-2026-002');
  const [trackingRequest, setTrackingRequest] = useState<TransportRequest | null>(null);

  const handleDocumentUploadSuccess = (uploadedDoc: any) => {
    uploadDocumentForRequest(activeRequestForUpload, uploadedDoc.title);
    setIsUploadModalOpen(false);
  };

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
            Saturday, September 26
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
            Good morning, {currentUser.fullName || currentUser.name || 'Customer'}
          </h2>
          <p
            style={{
              fontSize: '14px',
              color: '#cbd5e1',
              margin: 0,
            }}
          >
            Here is an overview of your transportation activities.
          </p>

          {/* Badges in Hero */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
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
              <span>Thunder is in transit - DXB · SGN</span>
            </div>

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
              <FileText size={13} color="#fbbf24" />
              <span>2 documents due this week</span>
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
              <span>↗</span> +1 this week
            </div>
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>03</div>
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
          <div style={{ fontSize: '30px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>01</div>
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
            <div style={{ fontSize: '11.5px', fontWeight: 600, color: '#ea580c' }}>
              Due in 3 days
            </div>
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>02</div>
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
              <span>↗</span> +18% vs last year
            </div>
          </div>
          <div style={{ fontSize: '30px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>12</div>
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
              4 shipments currently being managed
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
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
              <Filter size={14} />
              Filter
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
              {/* Row 1: TR-2026-001 */}
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '16px 24px', fontWeight: 700, color: '#0f172a' }}>TR-2026-001</td>
                <td style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>DXB</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Dubai</div>
                    </div>
                    <span style={{ color: '#94a3b8' }}>→</span>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>SGN</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Ho Chi Minh City</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '11px', color: '#475569' }}>
                      T
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>Thunder</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Thoroughbred · 4y</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '16px 20px', color: '#334155', fontWeight: 500 }}>Sep 28, 2026</td>
                <td style={{ padding: '16px 20px', color: '#334155', fontWeight: 500 }}>Oct 02, 2026</td>
                <td style={{ padding: '16px 20px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, backgroundColor: '#eff6ff', color: '#2563eb' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#2563eb' }} />
                    In Transit
                  </span>
                </td>
                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      onClick={() => router.push('/customer/requests/tr-2026-001')}
                      style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: '12px', fontWeight: 600, color: '#334155', cursor: 'pointer' }}
                    >
                      View
                    </button>
                    <button style={{ color: '#94a3b8', border: 'none', background: 'none', cursor: 'pointer' }}>
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                </td>
              </tr>

              {/* Row 2: TR-2026-002 */}
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '16px 24px', fontWeight: 700, color: '#0f172a' }}>TR-2026-002</td>
                <td style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>SIN</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Singapore</div>
                    </div>
                    <span style={{ color: '#94a3b8' }}>→</span>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>SGN</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Ho Chi Minh City</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '11px', color: '#475569' }}>
                      RS
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>Royal Star</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Arabian · 5y</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '16px 20px', color: '#334155', fontWeight: 500 }}>Oct 05, 2026</td>
                <td style={{ padding: '16px 20px', color: '#334155', fontWeight: 500 }}>Oct 07, 2026</td>
                <td style={{ padding: '16px 20px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, backgroundColor: '#fffbeb', color: '#d97706' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#d97706' }} />
                    Pending Documents
                  </span>
                </td>
                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      onClick={() => router.push('/customer/requests/tr-2026-002')}
                      style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: '12px', fontWeight: 600, color: '#334155', cursor: 'pointer' }}
                    >
                      View
                    </button>
                    <button style={{ color: '#94a3b8', border: 'none', background: 'none', cursor: 'pointer' }}>
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                </td>
              </tr>

              {/* Row 3: TR-2026-003 */}
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '16px 24px', fontWeight: 700, color: '#0f172a' }}>TR-2026-003</td>
                <td style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>HKG</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Hong Kong</div>
                    </div>
                    <span style={{ color: '#94a3b8' }}>→</span>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>SGN</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Ho Chi Minh City</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '11px', color: '#475569' }}>
                      GM
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>Golden Mile</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Thoroughbred · 3y</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '16px 20px', color: '#334155', fontWeight: 500 }}>Oct 12, 2026</td>
                <td style={{ padding: '16px 20px', color: '#334155', fontWeight: 500 }}>Oct 13, 2026</td>
                <td style={{ padding: '16px 20px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, backgroundColor: '#ecfdf5', color: '#16a34a' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#16a34a' }} />
                    Approved
                  </span>
                </td>
                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      onClick={() => router.push('/customer/requests/tr-2026-003')}
                      style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: '12px', fontWeight: 600, color: '#334155', cursor: 'pointer' }}
                    >
                      View
                    </button>
                    <button style={{ color: '#94a3b8', border: 'none', background: 'none', cursor: 'pointer' }}>
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                </td>
              </tr>

              {/* Row 4: TR-2026-004 */}
              <tr>
                <td style={{ padding: '16px 24px', fontWeight: 700, color: '#0f172a' }}>TR-2026-004</td>
                <td style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>SYD</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Sydney</div>
                    </div>
                    <span style={{ color: '#94a3b8' }}>→</span>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>SIN</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Singapore</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '11px', color: '#475569' }}>
                      SA
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>Silver Arrow</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Standardbred · 6y</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '16px 20px', color: '#334155', fontWeight: 500 }}>Oct 18, 2026</td>
                <td style={{ padding: '16px 20px', color: '#334155', fontWeight: 500 }}>Oct 20, 2026</td>
                <td style={{ padding: '16px 20px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, backgroundColor: '#fef2f2', color: '#dc2626' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#dc2626' }} />
                    Action Required
                  </span>
                </td>
                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      onClick={() => router.push('/customer/requests/tr-2026-004')}
                      style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: '12px', fontWeight: 600, color: '#334155', cursor: 'pointer' }}
                    >
                      View
                    </button>
                    <button style={{ color: '#94a3b8', border: 'none', background: 'none', cursor: 'pointer' }}>
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                </td>
              </tr>
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
          <div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Upcoming Trip</h4>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>TR-2026-001</div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', fontSize: '11.5px', fontWeight: 600, backgroundColor: '#eff6ff', color: '#2563eb' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#2563eb' }} />
                In Transit
              </span>
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
                TH
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Thunder</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Thoroughbred · 4y · Bay</div>
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
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>Sep 28, 2026</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Est. arrival</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>Oct 02, 2026</div>
              </div>
            </div>

            {/* Vertical Route Milestones */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', position: 'relative' }}>
              {/* Milestone 1: Dubai */}
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
                    marginTop: '2px',
                  }}
                >
                  ✓
                </div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>Dubai</div>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>Departed · Sep 28, 08:40</div>
                  </div>
                  <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>DXB</span>
                </div>
              </div>

              {/* Milestone 2: Singapore (Active) */}
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
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  <Shield size={12} />
                </div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>Singapore</div>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>Quarantine checkpoint · 48h</div>
                  </div>
                  <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#2563eb', backgroundColor: '#eff6ff', padding: '2px 6px', borderRadius: '4px' }}>SIN</span>
                </div>
              </div>

              {/* Milestone 3: Ho Chi Minh City */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    border: '1.5px solid #cbd5e1',
                    color: '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  <Plane size={12} />
                </div>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>Ho Chi Minh City</div>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>ETA - Oct 02, 14:15</div>
                  </div>
                  <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', backgroundColor: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>SGN</span>
                </div>
              </div>
            </div>
          </div>

          {/* Journey Progress */}
          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              <span style={{ color: '#0f172a' }}>Journey progress</span>
              <span style={{ color: '#2563eb' }}>62%</span>
            </div>
            <div style={{ width: '100%', height: '6px', borderRadius: '999px', backgroundColor: '#e2e8f0', overflow: 'hidden' }}>
              <div style={{ width: '62%', height: '100%', backgroundColor: '#2563eb', borderRadius: '999px' }} />
            </div>
            <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '6px' }}>
              Currently: <strong style={{ color: '#334155' }}>Clearing quarantine in Singapore</strong>
            </div>
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
              {/* Item 1 */}
              <div
                onClick={() => router.push('/customer/requests/tr-2026-004')}
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
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>TR-2026-004</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>SYD → SIN · Sep 24, 2026</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, backgroundColor: '#fef2f2', color: '#dc2626' }}>
                    ● Action Required
                  </span>
                  <ChevronRight size={14} color="#94a3b8" />
                </div>
              </div>

              {/* Item 2 */}
              <div
                onClick={() => router.push('/customer/requests/tr-2026-003')}
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
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>TR-2026-003</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>HKG → SGN · Sep 21, 2026</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, backgroundColor: '#ecfdf5', color: '#16a34a' }}>
                    ● Approved
                  </span>
                  <ChevronRight size={14} color="#94a3b8" />
                </div>
              </div>

              {/* Item 3 */}
              <div
                onClick={() => router.push('/customer/requests/tr-2026-002')}
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
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>TR-2026-002</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>SIN → SGN · Sep 18, 2026</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, backgroundColor: '#fffbeb', color: '#d97706' }}>
                    ● Pending
                  </span>
                  <ChevronRight size={14} color="#94a3b8" />
                </div>
              </div>

              {/* Item 4 */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #f1f5f9',
                  backgroundColor: '#ffffff',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                    <FileText size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>TR-2025-118</div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>DXB → SIN · Aug 30, 2026</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, backgroundColor: '#f1f5f9', color: '#64748b' }}>
                    ● Completed
                  </span>
                  <ChevronRight size={14} color="#94a3b8" />
                </div>
              </div>
            </div>
          </div>

          {/* Footer View Details button */}
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
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>2 unread</div>
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
              {/* Notif 1 */}
              <div
                onClick={() => {
                  setActiveRequestForUpload('TR-2026-002');
                  setIsUploadModalOpen(true);
                }}
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
                    backgroundColor: '#fffbeb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#d97706',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  <AlertTriangle size={16} />
                </div>
                <div style={{ flex: 1, paddingRight: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', lineHeight: 1.35 }}>
                    Medical certificate requires additional information.
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px' }}>
                    Royal Star · TR-2026-002 · 12 min ago
                  </div>
                </div>
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
              </div>

              {/* Notif 2 */}
              <div
                onClick={() => router.push('/customer/requests/tr-2026-001')}
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
                    backgroundColor: '#ecfdf5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#16a34a',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  <CheckCircle2 size={16} />
                </div>
                <div style={{ flex: 1, paddingRight: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', lineHeight: 1.35 }}>
                    Transport request TR-2026-001 has been approved.
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px' }}>
                    Thunder · DXB → SGN · 2 hours ago
                  </div>
                </div>
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
              </div>

              {/* Notif 3 */}
              <div
                onClick={() => router.push('/customer/tracking')}
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
                    backgroundColor: '#eff6ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2563eb',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  <MapPin size={16} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', lineHeight: 1.35 }}>
                    Your horse has arrived at the quarantine checkpoint.
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '3px' }}>
                    Thunder · Singapore Changi · Yesterday
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer View All Notifications link */}
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
          {/* Card 1: Create Transport Request (Solid Blue Highlight) */}
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
              setActiveRequestForUpload('TR-2026-002');
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
                8 horses registered
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
                Live status of TR-2026-001
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
