'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCustomerStore } from '@/lib/customer-store';

export default function HorsesPage() {
  const router = useRouter();
  const { horses } = useCustomerStore();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header */}
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
              My Horses
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              Profiles, microchips, and FEI passports of your registered racehorses.
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          icon={<Plus size={16} />}
          onClick={() => alert('Register new horse form')}
        >
          Register New Horse
        </Button>
      </div>

      {/* Horse Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
        {horses.map((horse) => (
          <div
            key={horse.id}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              border: '1px solid var(--border-card)',
              padding: '24px',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <Link
              href={`/customer/horses/${horse.id}`}
              style={{ display: 'flex', alignItems: 'center', gap: '14px', textDecoration: 'none' }}
              title={`View detailed profile of ${horse.name}`}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: '#eff6ff',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  overflow: 'hidden',
                }}
              >
                {horse.photoUrl ? (
                  <img src={horse.photoUrl} alt={horse.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <svg
                    width="30"
                    height="30"
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
                )}
              </div>

              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-heading)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {horse.name}
                  <ChevronRight size={16} color="var(--primary)" />
                </h3>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {horse.breed} • {horse.gender} ({horse.age} years)
                </div>
              </div>
            </Link>

            <div
              style={{
                backgroundColor: '#f8fafc',
                borderRadius: '10px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '12.5px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Microchip:</span>
                <strong style={{ color: 'var(--text-heading)', fontFamily: 'monospace' }}>
                  {horse.microchipNumber}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>FEI Passport:</span>
                <strong style={{ color: 'var(--primary)', fontFamily: 'monospace' }}>
                  {horse.passportNumber}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Owner / Stud:</span>
                <span style={{ color: 'var(--text-body)' }}>{horse.ownerName}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
              <Button
                variant="outline"
                size="sm"
                style={{ flex: 1 }}
                onClick={() => router.push(`/customer/horses/${horse.id}#medical-history-section`)}
              >
                Medical History
              </Button>
              <Button
                variant="secondary"
                size="sm"
                style={{ flex: 1 }}
                onClick={() => router.push(`/customer/requests/new?horseId=${horse.id}`)}
              >
                Ship This Horse
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
