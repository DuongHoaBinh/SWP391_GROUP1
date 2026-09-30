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
        // Map backend `TransportOrder` to frontend `TransportRequest` properties used in this view
        const mappedData = data.map((item) => ({
          ...item,
          requestCode: item.id.toString(), // or real request code if backend adds it
          horse: item.horses?.[0] || { name: 'Multiple Horses' },
          origin: item.originLocation,
          destination: item.destinationLocation,
          departureDate: new Date(item.requestedDate).toLocaleDateString('en-GB'),
        }));
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
    const matchesFilter = filterStatus === 'ALL' || r.status === filterStatus || r.status.toUpperCase() === filterStatus;
    return matchesSearch && matchesFilter;
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>Filter by:</span>
          {['ALL', 'IN_TRANSIT', 'IN_REVIEW', 'SUBMITTED', 'CANCELLED'].map((status) => (
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
              {status.replace('_', ' ')}
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
                  <Link
                    href={`/customer/horses/${req.horse.id || 'hrs-001'}`}
                    style={{ fontWeight: 600, color: 'var(--text-heading)' }}
                  >
                    {req.horse.name}
                  </Link>
                </td>
                <td style={{ padding: '16px 14px' }}>
                  {req.origin} → {req.destination}
                </td>
                <td style={{ padding: '16px 14px' }}>{req.departureDate}</td>
                <td style={{ padding: '16px 14px' }}>
                  <StatusBadge
                    label={req.statusLabel}
                    variant={
                      req.status === 'IN_TRANSIT'
                        ? 'transit'
                        : req.status === 'APPROVED'
                        ? 'success'
                        : req.status === 'CANCELLED'
                        ? 'danger'
                        : 'pending'
                    }
                    hasDot={req.status === 'IN_TRANSIT'}
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
