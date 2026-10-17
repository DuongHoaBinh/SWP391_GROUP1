'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useCustomerStore } from '@/lib/customer-store';
import { apiClient } from '@/lib/api-client';

export default function RequestsPage() {
  const router = useRouter();
  const { requests: mockRequests } = useCustomerStore();
  const [requests, setRequests] = useState<any[]>([]);

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const data = await apiClient<any[]>('/orders/my-orders');
        const statusMap: Record<string, { label: string; variant: 'pending' | 'success' | 'danger' | 'transit' | 'neutral' }> = {
          requested: { label: 'Pending Approval', variant: 'pending' },
          under_review: { label: 'Under Review', variant: 'pending' },
          IN_REVIEW: { label: 'Under Review', variant: 'pending' },
          approved: { label: 'Approved', variant: 'success' },
          APPROVED: { label: 'Approved', variant: 'success' },
          change_requested: { label: 'Change Requested', variant: 'pending' },
          rejected: { label: 'Rejected', variant: 'danger' },
          REJECTED: { label: 'Rejected', variant: 'danger' },
          planning: { label: 'Planning', variant: 'neutral' },
          confirmed: { label: 'Confirmed Plan', variant: 'neutral' },
          ready_to_depart: { label: 'Ready to Depart', variant: 'success' },
          ready: { label: 'Ready to Depart', variant: 'success' },
          in_transit: { label: 'In Transit', variant: 'transit' },
          IN_TRANSIT: { label: 'In Transit', variant: 'transit' },
          completed: { label: 'Completed', variant: 'success' },
          COMPLETED: { label: 'Completed', variant: 'success' },
          cancelled: { label: 'Cancelled', variant: 'danger' },
          CANCELLED: { label: 'Cancelled', variant: 'danger' },
        };

        const mappedData = data.map((item) => {
          const statusKey = String(item.status || '').toLowerCase();
          const statusInfo = statusMap[statusKey] || statusMap[item.status] || { label: item.status || 'Pending', variant: 'pending' as const };
          return {
            ...item,
            requestCode: item.requestCode || `REQ-${String(item.id).padStart(3, '0')}`,
            horse: item.horses?.[0] || { name: 'Multiple Horses' },
            origin: item.originLocation,
            destination: item.destinationLocation,
            departureDate: item.requestedDate ? new Date(item.requestedDate).toLocaleDateString('en-GB') : '',
            statusLabel: item.statusLabel || statusInfo.label,
            statusVariant: statusInfo.variant,
            requestedHorseCount: item.requestedHorseCount || item.requested_horse_count || (item.horses?.length || 1),
          };
        });
        setRequests(mappedData);
      } catch (err) {
        console.error('Failed to fetch requests, falling back to mock:', err);
        setRequests(mockRequests);
      }
    };
    fetchRequests();
  }, [mockRequests]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const filtered = requests.filter((r) => {
    const matchesSearch =
      r.requestCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.horse?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.origin?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.destination?.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (filterStatus === 'ALL') return true;

    const s = String(r.status || '').toLowerCase();
    if (filterStatus === 'SUBMITTED') return s === 'requested' || s === 'submitted';
    if (filterStatus === 'IN_REVIEW') return s === 'under_review' || s === 'change_requested';
    if (filterStatus === 'READY_TO_DEPART') return s === 'ready_to_depart' || s === 'ready';
    if (filterStatus === 'IN_TRANSIT') return s === 'in_transit';
    if (filterStatus === 'CANCELLED') return s === 'cancelled' || s === 'rejected';

    return s === filterStatus.toLowerCase();
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Breadcrumb & Action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            href="/customer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              color: '#64748b',
            }}
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
              Transport Requests
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              Track the approval and execution status of your racehorse shipments.
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          icon={<Plus size={16} />}
          onClick={() => router.push('/customer/requests/new')}
        >
          New Transport Request
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          backgroundColor: '#ffffff',
          padding: '16px 20px',
          borderRadius: '14px',
          border: '1px solid var(--border-card)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '8px 14px',
            width: '320px',
          }}
        >
          <Search size={16} color="#94a3b8" />
          <input
            type="text"
            placeholder="Search request ID, horse, city..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              border: 'none',
              backgroundColor: 'transparent',
              outline: 'none',
              fontSize: '13.5px',
              width: '100%',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>Filter by:</span>
          {['ALL', 'READY_TO_DEPART', 'IN_TRANSIT', 'IN_REVIEW', 'SUBMITTED', 'CANCELLED'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12.5px',
                fontWeight: 600,
                border: filterStatus === status ? '1px solid var(--primary)' : '1px solid #e2e8f0',
                backgroundColor: filterStatus === status ? 'var(--primary-light)' : '#ffffff',
                color: filterStatus === status ? 'var(--primary)' : 'var(--text-muted)',
              }}
            >
              {status === 'READY_TO_DEPART' ? 'Ready to Depart' : status.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Table Card */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid var(--border-card)',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
              <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Request Code
              </th>
              <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Horse
              </th>
              <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Route
              </th>
              <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Departure
              </th>
              <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Status
              </th>
              <th style={{ padding: '12px 14px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'right' }}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((req) => (
              <tr key={req.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                <td style={{ padding: '16px 14px' }}>
                  <Link
                    href={`/customer/requests/${req.id || 'tr-001'}`}
                    style={{ fontWeight: 700, color: 'var(--primary)' }}
                  >
                    {req.requestCode}
                  </Link>
                </td>
                <td style={{ padding: '16px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Link
                      href={`/customer/horses/${req.horse.id || 'hrs-001'}`}
                      style={{ fontWeight: 600, color: 'var(--text-heading)' }}
                    >
                      {req.horse.name}
                    </Link>
                    {req.requestedHorseCount && req.requestedHorseCount > 1 ? (
                      <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', backgroundColor: '#eff6ff', color: '#2563eb', fontWeight: 700, border: '1px solid #dbeafe' }}>
                        +{req.requestedHorseCount - 1} more
                      </span>
                    ) : null}
                  </div>
                </td>
                <td style={{ padding: '16px 14px' }}>
                  {req.origin} → {req.destination}
                </td>
                <td style={{ padding: '16px 14px' }}>{req.departureDate}</td>
                <td style={{ padding: '16px 14px' }}>
                  <StatusBadge
                    label={req.statusLabel || 'Pending'}
                    variant={req.statusVariant || 'pending'}
                    hasDot={req.status === 'in_transit' || req.status === 'IN_TRANSIT'}
                  />
                </td>
                <td style={{ padding: '16px 14px', textAlign: 'right' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/customer/requests/${req.id || 'tr-001'}`)}
                  >
                    View Details
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
