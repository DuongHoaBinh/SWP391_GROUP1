'use client';

import React from 'react';
import Link from 'next/link';
import { CalendarCheck, Plane } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TransportRequest } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface UpcomingTripCardProps {
  request: TransportRequest;
  onViewDetails: (request: TransportRequest) => void;
}

export const UpcomingTripCard: React.FC<UpcomingTripCardProps> = ({
  request,
  onViewDetails,
}) => {
  const { t, language } = useLanguage();

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '14px',
        border: '1px solid #D8CEBE',
        padding: '24px',
        boxShadow: '0 4px 16px rgba(24, 26, 23, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* Top Header */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E8E2D8]"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#B49A68', display: 'flex', alignItems: 'center' }} aria-hidden="true">
            <CalendarCheck size={18} />
          </span>
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: '#181A17',
              margin: 0,
            }}
          >
            {t('customer.dashboard.upcomingTrip', language === 'en' ? 'Upcoming Trip' : 'Chuyến đi sắp tới')}
          </h3>
        </div>

        {/* Code Badge Link */}
        <Link
          href={`/customer/requests/${request.id || 'tr-001'}`}
          style={{
            padding: '4px 12px',
            borderRadius: '999px',
            backgroundColor: '#181A17',
            color: '#F7F7F4',
            fontSize: '12px',
            fontWeight: 700,
            border: '1px solid #2C2F2A',
            fontFamily: 'var(--font-mono, monospace)',
            transition: 'all 0.15s ease',
          }}
          title={t('customer.table.viewRequestDetails', 'Xem chi tiết đơn')}
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
          href={`/customer/horses/${request.horse?.id || 'hrs-001'}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            transition: 'opacity 0.15s ease',
          }}
          title={request.horse?.name || ''}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '12px',
              backgroundColor: '#F0EEE8',
              border: '1px solid #D8CEBE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#181A17',
              flexShrink: 0,
            }}
          >
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
                color: '#181A17',
                letterSpacing: '-0.01em',
              }}
            >
              {request.horse.name}
            </div>
            <div
              style={{
                fontSize: '13px',
                color: '#5B6779',
                marginTop: '2px',
              }}
            >
              {t('customer.table.departure', language === 'en' ? 'Departure' : 'Khởi hành')}:{' '}
              <strong style={{ color: '#181A17' }}>{request.departureDate}</strong>
            </div>
          </div>
        </Link>

        {/* Route Progress Timeline */}
        <div
          className="flex items-center gap-2 flex-1 w-full max-w-[380px] min-w-0 sm:min-w-[260px]"
        >
          <div style={{ textAlign: 'center', minWidth: '60px' }}>
            <div style={{ fontSize: '11px', color: '#5B6779', fontWeight: 600, marginBottom: '4px' }}>
              {language === 'en' ? 'Origin' : 'Xuất phát'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#287653' }} />
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#181A17' }}>
              {request.originCode}
            </div>
          </div>

          <div style={{ flex: 1, height: '3px', backgroundColor: '#B49A68', borderRadius: '2px' }} />

          <div style={{ textAlign: 'center', minWidth: '70px' }}>
            <div style={{ fontSize: '11px', color: '#5B6779', fontWeight: 600, marginBottom: '4px' }}>
              {language === 'en' ? 'Transit' : 'Trung chuyển'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: '#F8F0DF',
                  border: '2px solid #B49A68',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#966516',
                }}
              >
                <Plane size={14} style={{ transform: 'rotate(45deg)' }} />
              </div>
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#966516' }}>
              {request.transitPoint || 'BKK, TH'}
            </div>
          </div>

          <div style={{ flex: 1, height: '3px', backgroundColor: '#D8CEBE', borderRadius: '2px' }} />

          <div style={{ textAlign: 'center', minWidth: '65px' }}>
            <div style={{ fontSize: '11px', color: '#5B6779', fontWeight: 600, marginBottom: '4px' }}>
              {language === 'en' ? 'Destination' : 'Đích đến'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: '#FAF8F4',
                  border: '2px solid #A67C2E',
                }}
              />
            </div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#A67C2E' }}>
              {request.destinationCode}
            </div>
          </div>
        </div>

        {/* View Details Button */}
        <div>
          <Button variant="outline" size="md" onClick={() => onViewDetails(request)}>
            {t('orders.viewDetails', language === 'en' ? 'View Details' : 'Xem chi tiết')}
          </Button>
        </div>
      </div>
    </div>
  );
};
