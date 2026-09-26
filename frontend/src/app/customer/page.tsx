'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Truck,
  FileText,
  Navigation,
  CheckCircle2,
  FileEdit,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { UpcomingTripCard } from '@/features/tracking/components/UpcomingTripCard';
import { TripTrackingModal } from '@/features/tracking/components/TripTrackingModal';
import { ActiveTransportTable } from '@/features/orders/components/ActiveTransportTable';
import { DocumentUploadModal } from '@/features/documents/components/DocumentUploadModal';
import { NotificationPanel } from '@/features/notifications/components/NotificationPanel';
import { useCustomerStore } from '@/lib/customer-store';
import { NotificationItem, TransportRequest } from '@/lib/types';

export default function CustomerDashboardPage() {
  const router = useRouter();

  // Central synchronized store
  const {
    requests,
    metrics,
    notifications,
    uploadDocumentForRequest,
    markAllNotificationsRead,
  } = useCustomerStore();

  // Modals state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [activeRequestForUpload, setActiveRequestForUpload] = useState<string>('TR-2026-002');
  const [trackingRequest, setTrackingRequest] = useState<TransportRequest | null>(null);

  // Active upcoming trip is the first in-transit or upcoming order
  const upcomingTrip = requests.find((r) => r.status === 'IN_TRANSIT') || requests[0];

  const handleNotificationAction = (notif: NotificationItem) => {
    if (notif.actionText?.includes('Export Permit') || notif.actionText?.includes('Document')) {
      setActiveRequestForUpload(notif.relatedRequestCode || 'TR-2026-002');
      setIsUploadModalOpen(true);
    } else if (notif.relatedRequestCode) {
      router.push(`/customer/requests/${notif.relatedRequestCode.toLowerCase()}`);
    }
  };

  const handleDocumentUploadSuccess = (uploadedDoc: any) => {
    uploadDocumentForRequest(activeRequestForUpload, uploadedDoc.title);
    setIsUploadModalOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Action Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        {/* Primary Action Button - Linked to New Request Wizard */}
        <div>
          <Button
            variant="primary"
            size="lg"
            icon={<Plus size={18} strokeWidth={2.5} />}
            onClick={() => router.push('/customer/requests/new')}
          >
            Create Transport Request
          </Button>
        </div>

        {/* Secondary Quick Action Buttons - Interconnected with other routes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button
            variant="secondary"
            size="md"
            icon={
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
            }
            onClick={() => router.push('/customer/horses')}
          >
            My Horses
          </Button>

          <Button
            variant="secondary"
            size="md"
            icon={<FileText size={16} />}
            badge={metrics.pendingDocuments > 0 ? metrics.pendingDocuments : undefined}
            onClick={() => {
              setActiveRequestForUpload('TR-2026-002');
              setIsUploadModalOpen(true);
            }}
          >
            Upload Documents
          </Button>

          <Button
            variant="secondary"
            size="md"
            icon={<Navigation size={16} />}
            onClick={() => router.push('/customer/tracking')}
          >
            Track Trip
          </Button>
        </div>
      </div>

      {/* Metrics Row (4 Cards) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '20px',
        }}
      >
        {/* Card 1: Active Requests */}
        <StatCard
          title="ACTIVE REQUESTS"
          value={String(metrics.activeRequests).padStart(2, '0')}
          subtext={`→ ${metrics.pendingApproval} pending approval`}
          subtextColor="#2563eb"
          icon={<FileEdit size={20} color="#0284c7" />}
          iconBg="#e0f2fe"
          subtextAction={() => router.push('/customer/requests')}
        />

        {/* Card 2: In Transit */}
        <StatCard
          title="IN TRANSIT"
          value={String(metrics.inTransit).padStart(2, '0')}
          subtext="Currently moving"
          icon={<Truck size={20} color="#d97706" />}
          iconBg="#fef3c7"
          subtextAction={() => router.push('/customer/tracking')}
        />

        {/* Card 3: Pending Documents */}
        <StatCard
          title="PENDING DOCUMENTS"
          titleColor="#dc2626"
          value={String(metrics.pendingDocuments).padStart(2, '0')}
          valueColor="#dc2626"
          subtext="Action required"
          subtextColor="#dc2626"
          borderColor="#fee2e2"
          icon={
            <div
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '4px',
                backgroundColor: '#fecaca',
              }}
            />
          }
          iconBg="#fee2e2"
          subtextAction={() => router.push('/customer/documents')}
        />

        {/* Card 4: Completed Trips */}
        <StatCard
          title="COMPLETED TRIPS"
          value={String(metrics.completedTrips)}
          subtext="All time"
          icon={<CheckCircle2 size={20} color="#16a34a" />}
          iconBg="#dcfce7"
        />
      </div>

      {/* Main 2-Column Content Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.9fr 1.1fr',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        {/* Left Column: Upcoming Trip + Active Transport */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Upcoming Trip Card */}
          {upcomingTrip && (
            <UpcomingTripCard
              request={upcomingTrip}
              onViewDetails={(req) => router.push(`/customer/requests/${req.id || 'tr-001'}`)}
            />
          )}

          {/* Active Transport Table */}
          <ActiveTransportTable
            requests={requests}
            onViewTrip={(req) => router.push(`/customer/requests/${req.id || 'tr-001'}`)}
          />
        </div>

        {/* Right Column: Notifications Panel */}
        <div style={{ position: 'sticky', top: '108px' }}>
          <NotificationPanel
            notifications={notifications}
            onMarkAllAsRead={markAllNotificationsRead}
            onActionClick={handleNotificationAction}
          />
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
