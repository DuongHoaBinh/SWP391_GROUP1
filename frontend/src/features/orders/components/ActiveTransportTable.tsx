'use client';

import React from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TransportRequest } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface ActiveTransportTableProps {
  requests: TransportRequest[];
  onViewTrip: (request: TransportRequest) => void;
}

export const ActiveTransportTable: React.FC<ActiveTransportTableProps> = ({
  requests,
  onViewTrip,
}) => {
  const { t, translateStatus, translateCountry } = useLanguage();

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '14px',
        border: '1px solid #D8CEBE',
        padding: '24px',
        boxShadow: '0 4px 16px rgba(24, 26, 23, 0.04)',
      }}
    >
      {/* Table Header Row */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 mb-5"
      >
        <h3
          style={{
            fontSize: '17px',
            fontWeight: 700,
            color: '#181A17',
            margin: 0,
          }}
        >
          {t('customer.dashboard.activeTransports', 'Chuyến vận chuyển đang hoạt động')}
        </h3>
        <Link
          href="/customer/requests"
          style={{
            fontSize: '13.5px',
            fontWeight: 600,
            color: '#A67C2E',
            transition: 'color 0.15s ease',
          }}
        >
          {t('common.viewAll', 'Xem tất cả')}
        </Link>
      </div>

      {/* Table Structure */}
      {requests.length === 0 ? (
        <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: '13.5px', color: '#5F6977' }}>
          {t('customer.requests.empty', 'Chưa có yêu cầu vận chuyển nào.')}
        </div>
      ) : (
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            minWidth: '680px',
            borderCollapse: 'collapse',
            textAlign: 'left',
          }}
        >
          <thead>
            <tr
              style={{
                backgroundColor: '#F0EEE8',
                borderBottom: '1px solid #D8CEBE',
              }}
            >
              <th
                style={{
                  padding: '10px 14px',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#5B6779',
                }}
              >
                {t('customer.table.requestId', 'MÃ ĐƠN')}
              </th>
              <th
                style={{
                  padding: '10px 14px',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#5B6779',
                }}
              >
                {t('customer.table.horse', 'CHIẾN MÃ')}
              </th>
              <th
                style={{
                  padding: '10px 14px',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#5B6779',
                }}
              >
                {t('customer.table.route', 'TUYẾN ĐƯỜNG')}
              </th>
              <th
                style={{
                  padding: '10px 14px',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#5B6779',
                }}
              >
                {t('customer.table.departure', 'KHỞI HÀNH')}
              </th>
              <th
                style={{
                  padding: '10px 14px',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#5B6779',
                }}
              >
                {t('customer.table.status', 'TRẠNG THÁI')}
              </th>
              <th
                style={{
                  padding: '10px 14px',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#5B6779',
                  textAlign: 'right',
                }}
              >
                {t('customer.table.action', 'THAO TÁC')}
              </th>
            </tr>
          </thead>
          <tbody>
            {requests.map((req) => (
              <tr
                key={req.id}
                style={{
                  borderBottom: '1px solid #E8E2D8',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <td style={{ padding: '16px 14px' }}>
                  <Link
                    href={`/customer/requests/${req.id || 'tr-001'}`}
                    style={{
                      fontSize: '13.5px',
                      fontWeight: 700,
                      color: '#A67C2E',
                      fontFamily: 'var(--font-mono, monospace)',
                    }}
                    title={t('customer.table.viewRequestDetails', 'Xem chi tiết đơn')}
                  >
                    {req.requestCode}
                  </Link>
                </td>

                <td style={{ padding: '16px 14px' }}>
                  <Link
                    href={`/customer/horses/${req.horse.id || 'hrs-001'}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13.5px',
                      fontWeight: 600,
                      color: '#181A17',
                    }}
                    title={req.horse.name}
                  >
                    <span style={{ color: '#B49A68', display: 'flex', alignItems: 'center' }}>
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
                        <circle cx="8" cy="7" r="1" />
                      </svg>
                    </span>
                    <span>{req.horse.name}</span>
                  </Link>
                </td>

                <td
                  style={{
                    padding: '16px 14px',
                    fontSize: '13.5px',
                    color: '#181A17',
                  }}
                >
                  {translateCountry(req.origin)} → {translateCountry(req.destination)}
                </td>

                <td
                  style={{
                    padding: '16px 14px',
                    fontSize: '13.5px',
                    color: '#5F6977',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {(req.departureDate || '').split(',')[0] || '—'}
                </td>

                <td style={{ padding: '16px 14px', whiteSpace: 'nowrap' }}>
                  <StatusBadge
                    label={translateStatus(req.statusLabel || req.status)}
                    variant={
                      req.status === 'IN_TRANSIT' || req.status === 'in_transit'
                        ? 'transit'
                        : req.status === 'APPROVED' || req.status === 'approved' || req.status === 'completed'
                        ? 'success'
                        : 'pending'
                    }
                    hasDot={req.status === 'IN_TRANSIT' || req.status === 'in_transit'}
                  />
                </td>

                <td
                  style={{
                    padding: '16px 14px',
                    textAlign: 'right',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onViewTrip(req)}
                    className="hover:bg-[#F5EFE2] cursor-pointer border border-[#D4C5A3]"
                    style={{
                      fontSize: '13.5px',
                      fontWeight: 600,
                      color: '#A67C2E',
                      padding: '5px 10px',
                      borderRadius: '8px',
                      backgroundColor: '#FAF8F4',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {t('orders.viewTrip', 'Xem chuyến đi')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
};
