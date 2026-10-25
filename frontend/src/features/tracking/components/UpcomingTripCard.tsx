'use client';

import React from 'react';
import Link from 'next/link';
import { CalendarCheck, Plane, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TransportRequest } from '@/lib/types';

interface UpcomingTripCardProps {
  request: TransportRequest;
  onViewDetails: (request: TransportRequest) => void;
}

export const UpcomingTripCard: React.FC<UpcomingTripCardProps> = ({
  request,
  onViewDetails,
}) => {
  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        border: '1px solid var(--border-card)',
        padding: '24px',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <CalendarCheck size={18} />
          </span>
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--text-heading)',
              margin: 0,
            }}
          >
            Upcoming Trip
          </h3>
        </div>

        {/* Code Badge Link */}
        <Link
          href={`/customer/requests/${request.id || 'tr-001'}`}
          style={{
            padding: '4px 12px',
            borderRadius: '999px',
            backgroundColor: '#eff6ff',
            color: 'var(--primary)',
            fontSize: '12px',
            fontWeight: 700,
            border: '1px solid #dbeafe',
            transition: 'all 0.15s ease',
          }}
          title="View Request Details"
        >
          {request.requestCode}
        </Link>
      </div>

      {/* Main Content Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '24px',
          flexWrap: 'wrap',
        }}
      >
        {/* Horse Information Link */}
        <Link
          href={`/customer/horses/${request.horse.id || 'hrs-001'}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            transition: 'opacity 0.15s ease',
          }}
          title={`View Profile of ${request.horse.name}`}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              backgroundColor: '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary)',
              flexShrink: 0,
            }}
          >
            {/* Horse Silhouette */}
            <svg
              width="28"
              height="28"
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

          <div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 800,
                color: 'var(--text-heading)',
                letterSpacing: '-0.01em',
              }}
            >
              {request.horse.name}
            </div>
            <div
              style={{
                fontSize: '13px',
                color: 'var(--text-muted)',
                marginTop: '2px',
              }}
            >
              Departure: <strong style={{ color: 'var(--text-body)' }}>{request.departureDate}</strong>
            </div>
          </div>
        </Link>

        {/* Route Progress Timeline */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flex: '1',
            maxWidth: '380px',
            minWidth: '260px',
          }}
        >
          {/* Origin */}
          <div style={{ textAlign: 'center', minWidth: '60px' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>
              Origin
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: '#ea580c',
                }}
              />
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-heading)' }}>
              {request.originCode}
            </div>
          </div>

          {/* Line 1 */}
          <div
            style={{
              flex: 1,
              height: '3px',
              backgroundColor: '#ea580c',
              borderRadius: '2px',
              position: 'relative',
            }}
          />

          {/* Transit Point with Plane Icon */}
          <div style={{ textAlign: 'center', minWidth: '70px' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>
              Transit
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: '#fff7ed',
                  border: '2px solid #ea580c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ea580c',
                }}
              >
                <Plane size={14} style={{ transform: 'rotate(45deg)' }} />
              </div>
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#ea580c' }}>
              {request.transitPoint || 'BKK, TH'}
            </div>
          </div>

          {/* Line 2 */}
          <div
            style={{
              flex: 1,
              height: '3px',
              backgroundColor: '#e2e8f0',
              borderRadius: '2px',
            }}
          />

          {/* Destination */}
          <div style={{ textAlign: 'center', minWidth: '65px' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, marginBottom: '4px' }}>
              Destination
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: '#cbd5e1',
                  border: '2px solid #94a3b8',
                }}
              />
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>
              {request.destinationCode}
            </div>
          </div>
        </div>

        {/* View Details Button */}
        <div>
          <Button
            variant="outline"
            size="md"
            onClick={() => onViewDetails(request)}
          >
            View Details
          </Button>
        </div>
      </div>
    </div>
  );
};
