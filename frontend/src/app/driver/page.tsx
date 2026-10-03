'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  Truck,
  Crosshair,
  Calendar,
  AlertTriangle,
  Clock,
  ArrowRight,
  ChevronRight,
  Map,
  PhoneCall,
  MapPin,
  Stethoscope,
  PlayCircle,
  FileEdit,
} from 'lucide-react';

export default function DriverDashboardPage() {
  const router = useRouter();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. WELCOME BANNER */}
      <div
        style={{
          backgroundColor: '#0f172a',
          backgroundImage:
            'linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          borderRadius: '16px',
          padding: '24px 30px',
          border: '1px solid rgba(15, 23, 42, 0.2)',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        }}
      >
        <div>
          <p style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.12em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>
            Saturday, September 26
          </p>
          <h2 style={{ fontSize: '26px', fontWeight: 700, color: '#ffffff', margin: '0 0 4px 0', lineHeight: 1.2 }}>
            Good morning, John
          </h2>
          <p style={{ fontSize: '13.5px', color: '#94a3b8', margin: 0, fontWeight: 500 }}>
            Here is your assigned transportation schedule.
          </p>

          {/* Chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginTop: '16px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: '12px',
                fontWeight: 500,
                color: '#ffffff',
                backdropFilter: 'blur(4px)',
              }}
            >
              <Truck size={14} color="#60a5fa" />
              <span>01 active trip</span>
            </div>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: '12px',
                fontWeight: 500,
                color: '#ffffff',
                backdropFilter: 'blur(4px)',
              }}
            >
              <span style={{ fontSize: '14px' }}>♞</span>
              <span>04 horses assigned</span>
            </div>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(245, 158, 11, 0.2)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                fontSize: '12px',
                fontWeight: 500,
                color: '#ffffff',
                backdropFilter: 'blur(4px)',
              }}
            >
              <FileEdit size={14} color="#fbbf24" />
              <span>01 report pending</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => alert('Quick Action: Update Trip Milestone & Location')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            padding: '14px 24px',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 700,
            border: '1px solid rgba(96, 165, 250, 0.3)',
            boxShadow: '0 0 20px rgba(37, 99, 235, 0.4)',
            cursor: 'pointer',
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#1d4ed8')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#2563eb')}
        >
          <Crosshair size={16} /> Update Trip Status
        </button>
      </div>

      {/* 2. KPI CARDS (4 Columns) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '14px',
        }}
      >
        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ color: '#9ca3af', marginBottom: '8px' }}><Calendar size={20} /></div>
          <h3 style={{ fontSize: '26px', fontWeight: 800, color: '#111827', margin: '0 0 2px 0' }}>02</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: 0 }}>Today&apos;s Trips</p>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ color: '#2563eb', marginBottom: '8px' }}><Truck size={20} /></div>
          <h3 style={{ fontSize: '26px', fontWeight: 800, color: '#111827', margin: '0 0 2px 0' }}>01</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: 0 }}>Active Trip</p>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ color: '#10b981', marginBottom: '8px', fontSize: '20px' }}>♞</div>
          <h3 style={{ fontSize: '26px', fontWeight: 800, color: '#111827', margin: '0 0 2px 0' }}>04</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: 0 }}>Horses Assigned</p>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ color: '#f59e0b', marginBottom: '8px' }}><FileEdit size={20} /></div>
          <h3 style={{ fontSize: '26px', fontWeight: 800, color: '#111827', margin: '0 0 2px 0' }}>01</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: 0 }}>Pending Reports</p>
        </div>
      </div>

      {/* 3. MAIN GRID (2 Cols Left, 1 Col Right) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '20px',
          alignItems: 'start',
        }}
      >
        {/* LEFT COLUMN: Active Trip + Progress + Assigned Horses */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', gridColumn: 'span 2' }}>
          {/* MY ACTIVE TRIP */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '14px',
              border: '2px solid rgba(37, 99, 235, 0.25)',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                backgroundColor: 'rgba(239, 246, 255, 0.6)',
                borderBottom: '1px solid rgba(37, 99, 235, 0.15)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <PlayCircle size={18} color="#2563eb" /> My Active Trip
              </h3>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  backgroundColor: '#eff6ff',
                  color: '#1d4ed8',
                  border: '1px solid #dbeafe',
                }}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#3b82f6' }} /> In Transit
              </span>
            </div>

            <div style={{ padding: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '18px', marginBottom: '24px' }}>
                <div>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 2px 0' }}>Trip ID</p>
                  <p style={{ fontSize: '16px', fontWeight: 800, color: '#111827', margin: 0 }}>TR-2026-001</p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 2px 0' }}>Route</p>
                  <p style={{ fontSize: '15px', fontWeight: 800, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Dubai <span style={{ color: '#9ca3af' }}>→</span> Ho Chi Minh City
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 2px 0' }}>Horse</p>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: 0 }}>Thunder (+3 others)</p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 2px 0' }}>Vehicle</p>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: 0 }}>VH-024</p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 2px 0' }}>Departure</p>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: 0 }}>Sep 28, 2026</p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 2px 0' }}>Est. Arrival</p>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: 0 }}>Oct 02, 2026</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                <button
                  onClick={() => alert('Opening Status Update Modal')}
                  style={{
                    flex: '1 1 200px',
                    padding: '14px 20px',
                    borderRadius: '10px',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '15px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 10px rgba(37, 99, 235, 0.3)',
                  }}
                >
                  Update Status <ChevronRight size={16} />
                </button>
                <button
                  onClick={() => router.push('/driver/status')}
                  style={{
                    padding: '14px 20px',
                    borderRadius: '10px',
                    backgroundColor: '#ffffff',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    fontWeight: 600,
                    fontSize: '13.5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Map size={16} /> View Route
                </button>
                <button
                  onClick={() => router.push('/driver/health')}
                  style={{
                    padding: '14px 20px',
                    borderRadius: '10px',
                    backgroundColor: '#ffffff',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    fontWeight: 600,
                    fontSize: '13.5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span>♞</span> View Horses
                </button>
              </div>
            </div>
          </div>

          {/* TRIP PROGRESS (Vertical Timeline) */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: 0 }}>Trip Progress</h3>
            </div>
            <div style={{ padding: '24px 28px' }}>
              <div style={{ position: 'relative', paddingLeft: '28px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
                {/* Vertical background guide line */}
                <div style={{ position: 'absolute', left: '8px', top: '10px', bottom: '10px', width: '2px', backgroundColor: '#e5e7eb' }} />
                {/* Active progress segment */}
                <div style={{ position: 'absolute', left: '8px', top: '10px', height: '48%', width: '2px', backgroundColor: '#2563eb' }} />

                {/* Step 1 (Done) */}
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '-25px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#2563eb', border: '2px solid #ffffff', boxShadow: '0 0 0 2px #2563eb' }} />
                  <p style={{ fontWeight: 700, color: '#111827', fontSize: '14px', margin: 0 }}>Trip Started</p>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0 0' }}>Departed Dubai Depot</p>
                </div>

                {/* Step 2 (Done) */}
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '-25px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#2563eb', border: '2px solid #ffffff', boxShadow: '0 0 0 2px #2563eb' }} />
                  <p style={{ fontWeight: 700, color: '#111827', fontSize: '14px', margin: 0 }}>Checkpoint Reached</p>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0 0' }}>Border crossing complete</p>
                </div>

                {/* Step 3 (Current Active) */}
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '-29px', top: '2px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#ffffff', border: '4px solid #2563eb', boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#2563eb' }} />
                  </div>
                  <p style={{ fontWeight: 700, color: '#2563eb', fontSize: '15px', margin: 0 }}>Rest Stop</p>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0 0', fontWeight: 500 }}>Currently at Mumbai Transit Hub</p>
                </div>

                {/* Step 4 (Future) */}
                <div style={{ position: 'relative', opacity: 0.5 }}>
                  <div style={{ position: 'absolute', left: '-25px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ffffff', border: '2px solid #d1d5db' }} />
                  <p style={{ fontWeight: 700, color: '#111827', fontSize: '14px', margin: 0 }}>Quarantine</p>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0 0' }}>Singapore</p>
                </div>

                {/* Step 5 (Future) */}
                <div style={{ position: 'relative', opacity: 0.5 }}>
                  <div style={{ position: 'absolute', left: '-25px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ffffff', border: '2px solid #d1d5db' }} />
                  <p style={{ fontWeight: 700, color: '#111827', fontSize: '14px', margin: 0 }}>Destination &amp; Handover</p>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0 0' }}>Ho Chi Minh City</p>
                </div>
              </div>
            </div>
          </div>

          {/* ASSIGNED HORSES */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: 0 }}>Assigned Horses</h3>
            </div>
            <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              {/* Horse 1 */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      backgroundColor: '#f3f4f6',
                      border: '1px solid #e5e7eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '16px',
                      color: '#475569',
                    }}
                  >
                    TH
                  </div>
                  <div>
                    <p style={{ fontWeight: 700, color: '#111827', fontSize: '15px', margin: 0 }}>Thunder</p>
                    <span style={{ display: 'inline-flex', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, backgroundColor: '#ecfdf5', color: '#047857', border: '1px solid #d1fae5', marginTop: '2px' }}>
                      Healthy
                    </span>
                  </div>
                </div>
                <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 14px 0', flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={13} /> Last Check: 08:40
                </p>
                <button
                  onClick={() => alert('Log health for Thunder')}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #2563eb',
                    backgroundColor: '#ffffff',
                    color: '#2563eb',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Update Health
                </button>
              </div>

              {/* Horse 2 */}
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      backgroundColor: '#f3f4f6',
                      border: '1px solid #e5e7eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '16px',
                      color: '#475569',
                    }}
                  >
                    RS
                  </div>
                  <div>
                    <p style={{ fontWeight: 700, color: '#111827', fontSize: '15px', margin: 0 }}>Royal Star</p>
                    <span style={{ display: 'inline-flex', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, backgroundColor: '#fffbeb', color: '#b45309', border: '1px solid #fef3c7', marginTop: '2px' }}>
                      Monitoring
                    </span>
                  </div>
                </div>
                <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 14px 0', flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={13} /> Last Check: 09:15
                </p>
                <button
                  onClick={() => alert('Log health for Royal Star')}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #2563eb',
                    backgroundColor: '#ffffff',
                    color: '#2563eb',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Update Health
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Emergency Assistance + Recent Updates */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* EMERGENCY CARD */}
          <div
            style={{
              backgroundColor: '#fef2f2',
              borderRadius: '12px',
              border: '1px solid #fecaca',
              padding: '22px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
            }}
          >
            <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#dc2626', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={20} /> Emergency Assistance
            </h3>
            <p style={{ fontSize: '13px', color: '#991b1b', lineHeight: 1.5, margin: '0 0 18px 0', fontWeight: 500 }}>
              Report an incident immediately if a horse or vehicle requires urgent attention.
            </p>
            <button
              onClick={() => alert('Emergency dispatch initiated: Logistics Manager and Vet alerted!')}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '10px',
                backgroundColor: '#dc2626',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '15px',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 10px rgba(220, 38, 38, 0.35)',
              }}
            >
              <PhoneCall size={18} /> Report Emergency
            </button>
          </div>

          {/* RECENT TRIP UPDATES */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: 0 }}>Recent Trip Updates</h3>
            </div>
            <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ padding: '10px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MapPin size={14} />
                </div>
                <div>
                  <p style={{ fontSize: '13.5px', fontWeight: 700, color: '#111827', margin: 0 }}>Status Update</p>
                  <p style={{ fontSize: '12.5px', color: '#4b5563', margin: '2px 0 0 0' }}>Checkpoint reached</p>
                  <p style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 0 0 0' }}>10 minutes ago</p>
                </div>
              </div>

              <div style={{ padding: '10px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Stethoscope size={14} />
                </div>
                <div>
                  <p style={{ fontSize: '13.5px', fontWeight: 700, color: '#111827', margin: 0 }}>Health Log</p>
                  <p style={{ fontSize: '12.5px', color: '#4b5563', margin: '2px 0 0 0' }}>Thunder checked</p>
                  <p style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 0 0 0' }}>30 minutes ago</p>
                </div>
              </div>

              <div style={{ padding: '10px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Clock size={14} />
                </div>
                <div>
                  <p style={{ fontSize: '13.5px', fontWeight: 700, color: '#111827', margin: 0 }}>Schedule Update</p>
                  <p style={{ fontSize: '12.5px', color: '#4b5563', margin: '2px 0 0 0' }}>Quarantine checkpoint updated</p>
                  <p style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 0 0 0' }}>1 hour ago</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. QUICK ACTIONS */}
      <div>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', marginBottom: '12px' }}>Quick Actions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          <div
            onClick={() => alert('Update Status')}
            style={{ backgroundColor: '#2563eb', color: '#ffffff', borderRadius: '12px', padding: '18px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)' }}
          >
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
              <Crosshair size={18} />
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, margin: 0 }}>Update Status</h4>
          </div>

          <div
            onClick={() => alert('Update Health')}
            style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '18px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}
          >
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
              <Stethoscope size={18} />
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: 0 }}>Update Health</h4>
          </div>

          <div
            onClick={() => router.push('/driver/status')}
            style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '18px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}
          >
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
              <Map size={18} />
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: 0 }}>View Route</h4>
          </div>

          <div
            onClick={() => alert('Emergency assistance triggered')}
            style={{ backgroundColor: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '12px', padding: '18px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}
          >
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#dc2626', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
              <PhoneCall size={18} />
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#dc2626', margin: 0 }}>Emergency</h4>
          </div>
        </div>
      </div>
    </div>
  );
}
