'use client';

import React from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TransportRequest } from '@/lib/types';

interface ActiveTransportTableProps {
  requests: TransportRequest[];
  onViewTrip: (request: TransportRequest) => void;
}

export const ActiveTransportTable: React.FC<ActiveTransportTableProps> = ({
  requests,
  onViewTrip,
}) => {
  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        border: '1px solid var(--border-card)',
        padding: '24px',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Table Header Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
        }}
      >
        <h3
          style={{
            fontSize: '17px',
            fontWeight: 700,
            color: 'var(--text-heading)',
            margin: 0,
          }}
        >
          Active Transport
        </h3>
        <Link
          href="/customer/requests"
          style={{
            fontSize: '13.5px',
            fontWeight: 600,
            color: 'var(--primary)',
            transition: 'color 0.15s ease',
          }}
        >
          View All
        </Link>
      </div>

      {/* Table Structure */}
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: '1px solid var(--border-light)',
              }}
            >
              <th
                style={{
                  padding: '10px 14px',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                }}
              >
                REQUEST ID
              </th>
              <th
                style={{
                  padding: '10px 14px',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                }}
              >
                HORSE
              </th>
              <th
                style={{
                  padding: '10px 14px',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                }}
              >
                ROUTE (ORG → DST)
              </th>
              <th
                style={{
                  padding: '10px 14px',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                }}
              >
                DEPARTURE
              </th>
              <th
                style={{
                  padding: '10px 14px',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                }}
              >
                STATUS
              </th>
              <th
                style={{
                  padding: '10px 14px',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                  textAlign: 'right',
                }}
              >
                ACTION
              </th>
            </tr>
          </thead>
          <tbody>
            {requests.map((req) => (
              <tr
                key={req.id}
                style={{
                  borderBottom: '1px solid var(--border-light)',
                  transition: 'background-color 0.15s ease',
                }}
              >
                {/* Request ID Link */}
                <td style={{ padding: '16px 14px' }}>
                  <Link
                    href={`/customer/requests/${req.id || 'tr-001'}`}
                    style={{
                      fontSize: '13.5px',
                      fontWeight: 700,
                      color: 'var(--primary)',
                    }}
                    title="View Request Details"
                  >
                    {req.requestCode}
                  </Link>
                </td>

                {/* Horse Link */}
                <td style={{ padding: '16px 14px' }}>
                  <Link
                    href={`/customer/horses/${req.horse.id || 'hrs-001'}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '13.5px',
                      fontWeight: 600,
                      color: 'var(--text-heading)',
                    }}
                    title={`View Profile of ${req.horse.name}`}
                  >
                    <span
                      style={{
                        color: '#64748b',
                        display: 'flex',
                        alignItems: 'center',
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
                        <circle cx="8" cy="7" r="1" />
                      </svg>
                    </span>
                    <span>{req.horse.name}</span>
                  </Link>
                </td>

                {/* Route */}
                <td
                  style={{
                    padding: '16px 14px',
                    fontSize: '13.5px',
                    color: 'var(--text-body)',
                  }}
                >
                  {req.origin} → {req.destination}
                </td>

                {/* Departure */}
                <td
                  style={{
                    padding: '16px 14px',
                    fontSize: '13.5px',
                    color: 'var(--text-body)',
                  }}
                >
                  {req.departureDate.split(',')[0]}
                </td>

                {/* Status */}
                <td style={{ padding: '16px 14px' }}>
                  <StatusBadge
                    label={req.statusLabel}
                    variant={
                      req.status === 'IN_TRANSIT'
                        ? 'transit'
                        : req.status === 'APPROVED'
                        ? 'success'
                        : 'pending'
                    }
                    hasDot={req.status === 'IN_TRANSIT'}
                  />
                </td>

                {/* Action */}
                <td
                  style={{
                    padding: '16px 14px',
                    textAlign: 'right',
                  }}
                >
                  <button
                    onClick={() => onViewTrip(req)}
                    style={{
                      fontSize: '13.5px',
                      fontWeight: 600,
                      color: 'var(--primary)',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    View Trip
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
