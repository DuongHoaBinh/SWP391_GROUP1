'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Navigation, ShieldCheck, Thermometer, Heart, Clock, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { mockTransportRequests } from '@/lib/mock-data';
import { TransportRequest } from '@/lib/types';

export default function TrackingPage() {
  const [selectedRequest, setSelectedRequest] = useState<TransportRequest>(
    mockTransportRequests[0]
  );

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
              Live Trip Tracking
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              Real-time telemetry, GPS milestones, and vital signs monitoring during transit.
            </p>
          </div>
        </div>

        {/* Request Selector */}
        <select
          value={selectedRequest.id}
          onChange={(e) => {
            const found = mockTransportRequests.find((r) => r.id === e.target.value);
            if (found) setSelectedRequest(found);
          }}
          style={{
            padding: '10px 14px',
            borderRadius: '10px',
            border: '1px solid #cbd5e1',
            backgroundColor: '#ffffff',
            fontWeight: 600,
            fontSize: '13.5px',
          }}
        >
          {mockTransportRequests.map((r) => (
            <option key={r.id} value={r.id}>
              {r.requestCode} - {r.horse.name} ({r.statusLabel})
            </option>
          ))}
        </select>
      </div>

      {/* Hero Tracking Card */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '18px',
          border: '1px solid var(--border-card)',
          padding: '28px',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary)', letterSpacing: '0.05em' }}>
              SHIPMENT CODE
            </span>
            <h3 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-heading)', margin: '2px 0 0 0' }}>
              {selectedRequest.requestCode} • {selectedRequest.horse.name}
            </h3>
            <div style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Route: <strong>{selectedRequest.origin}</strong> ({selectedRequest.originCode}) →{' '}
              <strong>{selectedRequest.destination}</strong> ({selectedRequest.destinationCode})
            </div>
          </div>

          <StatusBadge
            label={selectedRequest.statusLabel}
            variant={selectedRequest.status === 'IN_TRANSIT' ? 'transit' : 'pending'}
            hasDot={selectedRequest.status === 'IN_TRANSIT'}
          />
        </div>

        {/* Telemetry Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: '#eff6ff', border: '1px solid #dbeafe' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#2563eb' }}>
              <Thermometer size={20} />
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Stall Temp</span>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#1e3a8a', marginTop: '6px' }}>19.5 °C</div>
            <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>Within range (18-22°C)</div>
          </div>

          <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626' }}>
              <Heart size={20} />
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Heart Rate</span>
            </div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#991b1b', marginTop: '6px' }}>42 bpm</div>
            <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>Normal & Relaxed</div>
          </div>

          <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: '#f0fdf4', border: '1px solid #dcfce7' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a' }}>
              <ShieldCheck size={20} />
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Quarantine Seal</span>
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#166534', marginTop: '6px' }}>Certified</div>
            <div style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>No breaches reported</div>
          </div>

          <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: '#fffbeb', border: '1px solid #fef3c7' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#d97706' }}>
              <Clock size={20} />
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Est. Arrival</span>
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#92400e', marginTop: '6px' }}>
              {selectedRequest.estimatedArrivalDate}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>On schedule</div>
          </div>
        </div>

        {/* Route Map Simulation */}
        <div
          style={{
            backgroundColor: '#0c192c',
            borderRadius: '14px',
            padding: '40px 30px',
            color: '#ffffff',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', top: '16px', left: '20px', fontSize: '12px', color: '#94a3b8' }}>
            LIVE GPS SATELLITE RADAR
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '20px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#22c55e', margin: '0 auto 8px' }} />
              <div style={{ fontWeight: 700, fontSize: '14px' }}>{selectedRequest.originCode}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Departed: {selectedRequest.departureDate}</div>
            </div>

            <div style={{ flex: 1, borderTop: '2px dashed #3b82f6', margin: '0 20px', position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  top: '-14px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: '#ea580c',
                  padding: '6px 12px',
                  borderRadius: '999px',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                ✈ Currently over {selectedRequest.transitPoint || 'Bangkok Airspace'}
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#64748b', margin: '0 auto 8px' }} />
              <div style={{ fontWeight: 700, fontSize: '14px' }}>{selectedRequest.destinationCode}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Arrival: {selectedRequest.estimatedArrivalDate}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
