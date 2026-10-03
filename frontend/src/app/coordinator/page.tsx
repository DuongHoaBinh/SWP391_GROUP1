'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Truck,
  Plane,
  CalendarCheck,
  Clock,
  Wrench,
  Filter,
  MapPin,
  Flag,
  ShieldAlert,
  Bed,
  CheckCircle2,
  Sliders,
  CalendarDays,
  Bell,
} from 'lucide-react';

export default function CoordinatorDashboardPage() {
  const router = useRouter();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 1. WELCOME BANNER */}
      <div
        style={{
          backgroundColor: '#0f172a',
          backgroundImage:
            'linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          borderRadius: '16px',
          padding: '28px 34px',
          border: '1px solid rgba(15, 23, 42, 0.2)',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '20px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        }}
      >
        <div>
          <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>
            Saturday, September 26
          </p>
          <h2 style={{ fontSize: '28px', fontWeight: 700, color: '#ffffff', margin: '0 0 6px 0', lineHeight: 1.2 }}>
            Good morning, Alex
          </h2>
          <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0, fontWeight: 500 }}>
            Here is an overview of today&apos;s fleet and route operations.
          </p>

          {/* Chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', marginTop: '20px' }}>
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
              <Plane size={14} color="#60a5fa" />
              <span>14 active trips</span>
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
              <Truck size={14} color="#34d399" />
              <span>09 vehicles available</span>
            </div>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                fontSize: '12px',
                fontWeight: 500,
                color: '#ffffff',
                backdropFilter: 'blur(4px)',
              }}
            >
              <Clock size={14} color="#f87171" />
              <span>03 delayed trips</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => router.push('/coordinator/routes')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            padding: '12px 22px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            border: '1px solid rgba(96, 165, 250, 0.3)',
            boxShadow: '0 0 20px rgba(37, 99, 235, 0.4)',
            cursor: 'pointer',
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#1d4ed8')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#2563eb')}
        >
          <MapPin size={16} /> Plan New Route
        </button>
      </div>

      {/* 2. KPI CARDS (5 Columns) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}
      >
        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
            <Truck size={20} />
          </div>
          <h3 style={{ fontSize: '30px', fontWeight: 800, color: '#111827', margin: '0 0 4px 0', lineHeight: 1 }}>14</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Active Trips</p>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
            <Truck size={20} />
          </div>
          <h3 style={{ fontSize: '30px', fontWeight: 800, color: '#111827', margin: '0 0 4px 0', lineHeight: 1 }}>09</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Available Vehicles</p>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#f8fafc', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
            <CalendarCheck size={20} />
          </div>
          <h3 style={{ fontSize: '30px', fontWeight: 800, color: '#111827', margin: '0 0 4px 0', lineHeight: 1 }}>06</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Scheduled Departures</p>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={20} />
            </div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#dc2626', backgroundColor: '#fef2f2', padding: '2px 7px', borderRadius: '4px' }}>Action Req</span>
          </div>
          <h3 style={{ fontSize: '30px', fontWeight: 800, color: '#dc2626', margin: '0 0 4px 0', lineHeight: 1 }}>03</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Delayed Trips</p>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
            <Wrench size={20} />
          </div>
          <h3 style={{ fontSize: '30px', fontWeight: 800, color: '#111827', margin: '0 0 4px 0', lineHeight: 1 }}>02</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>In Maintenance</p>
        </div>
      </div>

      {/* 3. MAIN GRID (2 Cols Left, 1 Col Right) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        {/* LEFT COLUMN: Route Progress + Trip Schedule + Vehicle Fleet */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', gridColumn: 'span 2' }}>
          {/* PREMIUM ROUTE OVERVIEW */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'rgba(249, 250, 251, 0.5)',
              }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0 }}>Active Route Progress</h3>
              <div
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  backgroundColor: '#eff6ff',
                  color: '#2563eb',
                  border: '1px solid #dbeafe',
                }}
              >
                TR-2026-001 (Thunder)
              </div>
            </div>

            <div style={{ padding: '36px 32px' }}>
              <div style={{ position: 'relative', maxWidth: '750px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {/* Background Line */}
                <div style={{ position: 'absolute', left: '20px', right: '20px', top: '22px', height: '4px', backgroundColor: '#e5e7eb', zIndex: 0, borderRadius: '999px' }} />
                {/* Progress Active Line (50%) */}
                <div style={{ position: 'absolute', left: '20px', top: '22px', height: '4px', width: '50%', backgroundColor: '#2563eb', zIndex: 0, borderRadius: '999px' }} />

                {/* Stop 1: Origin */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '90px', position: 'relative', zIndex: 10, textAlign: 'center' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#2563eb', color: '#ffffff', border: '3px solid #ffffff', boxShadow: '0 0 0 1px #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Flag size={18} />
                  </div>
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#1f2937', margin: 0, lineHeight: 1.2 }}>Dubai</p>
                    <p style={{ fontSize: '10px', color: '#6b7280', margin: '2px 0 0 0', fontWeight: 500 }}>Origin</p>
                  </div>
                </div>

                {/* Stop 2: Transit */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '90px', position: 'relative', zIndex: 10, textAlign: 'center' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#2563eb', color: '#ffffff', border: '3px solid #ffffff', boxShadow: '0 0 0 1px #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Plane size={18} />
                  </div>
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#1f2937', margin: 0, lineHeight: 1.2 }}>Mumbai</p>
                    <p style={{ fontSize: '10px', color: '#6b7280', margin: '2px 0 0 0', fontWeight: 500 }}>Transit Stop</p>
                  </div>
                </div>

                {/* Stop 3: Quarantine (Current) */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '90px', position: 'relative', zIndex: 10, textAlign: 'center' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#ffffff', color: '#2563eb', border: '3px solid #2563eb', boxShadow: '0 0 0 4px rgba(37, 99, 235, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShieldAlert size={20} />
                  </div>
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#2563eb', margin: 0, lineHeight: 1.2 }}>Singapore</p>
                    <p style={{ fontSize: '10px', color: '#2563eb', margin: '2px 0 0 0', fontWeight: 600 }}>Quarantine</p>
                  </div>
                </div>

                {/* Stop 4: Rest */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '90px', position: 'relative', zIndex: 10, textAlign: 'center' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#ffffff', color: '#9ca3af', border: '3px solid #ffffff', boxShadow: '0 0 0 1px #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Bed size={18} />
                  </div>
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#4b5563', margin: 0, lineHeight: 1.2 }}>Bangkok</p>
                    <p style={{ fontSize: '10px', color: '#6b7280', margin: '2px 0 0 0', fontWeight: 500 }}>Rest Stop</p>
                  </div>
                </div>

                {/* Stop 5: Destination */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '90px', position: 'relative', zIndex: 10, textAlign: 'center' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: '#ffffff', color: '#9ca3af', border: '3px solid #ffffff', boxShadow: '0 0 0 1px #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#4b5563', margin: 0, lineHeight: 1.2 }}>Ho Chi Minh</p>
                    <p style={{ fontSize: '10px', color: '#6b7280', margin: '2px 0 0 0', fontWeight: 500 }}>Destination</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* TRIP SCHEDULE TABLE */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0 }}>Trip Schedule</h3>
                <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', margin: '2px 0 0 0' }}>
                  Live monitoring of all active and scheduled trips
                </p>
              </div>
              <button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#374151',
                  backgroundColor: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                <Filter size={13} color="#9ca3af" /> Filter
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '12px 24px' }}>Trip ID / Horse</th>
                    <th style={{ padding: '12px 24px' }}>Route</th>
                    <th style={{ padding: '12px 24px' }}>Vehicle / Driver</th>
                    <th style={{ padding: '12px 24px' }}>Departure</th>
                    <th style={{ padding: '12px 24px' }}>Arrival</th>
                    <th style={{ padding: '12px 24px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Row 1 */}
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '16px 24px' }}>
                      <p style={{ fontWeight: 700, color: '#111827', margin: 0 }}>TR-2026-001</p>
                      <p style={{ fontSize: '12px', color: '#2563eb', margin: '2px 0 0 0', cursor: 'pointer' }}>Thunder</p>
                    </td>
                    <td style={{ padding: '16px 24px', fontWeight: 700, color: '#1f2937' }}>
                      Dubai <span style={{ color: '#9ca3af' }}>→</span> Singapore
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <p style={{ fontWeight: 700, color: '#1f2937', margin: 0 }}>VH-024</p>
                      <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0 0' }}>John Smith (Escort)</p>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#4b5563' }}>Sep 28</td>
                    <td style={{ padding: '16px 24px', color: '#4b5563' }}>Oct 02</td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, backgroundColor: '#eff6ff', color: '#1d4ed8' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#3b82f6' }} /> In Transit
                      </span>
                    </td>
                  </tr>

                  {/* Row 2 */}
                  <tr style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: 'rgba(254, 242, 242, 0.25)' }}>
                    <td style={{ padding: '16px 24px' }}>
                      <p style={{ fontWeight: 700, color: '#111827', margin: 0 }}>TR-2026-002</p>
                      <p style={{ fontSize: '12px', color: '#2563eb', margin: '2px 0 0 0', cursor: 'pointer' }}>Silver Star</p>
                    </td>
                    <td style={{ padding: '16px 24px', fontWeight: 700, color: '#1f2937' }}>
                      London <span style={{ color: '#9ca3af' }}>→</span> Paris
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <p style={{ fontWeight: 700, color: '#1f2937', margin: 0 }}>VH-012</p>
                      <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0 0' }}>Mike Johnson</p>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#4b5563' }}>Sep 26</td>
                    <td style={{ padding: '16px 24px', color: '#dc2626', fontWeight: 700 }}>Sep 27</td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, backgroundColor: '#fef2f2', color: '#b91c1c' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ef4444' }} /> Delayed
                      </span>
                    </td>
                  </tr>

                  {/* Row 3 */}
                  <tr>
                    <td style={{ padding: '16px 24px' }}>
                      <p style={{ fontWeight: 700, color: '#111827', margin: 0 }}>TR-2026-003</p>
                      <p style={{ fontSize: '12px', color: '#2563eb', margin: '2px 0 0 0', cursor: 'pointer' }}>Midnight</p>
                    </td>
                    <td style={{ padding: '16px 24px', fontWeight: 700, color: '#1f2937' }}>
                      Tokyo <span style={{ color: '#9ca3af' }}>→</span> Seoul
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <p style={{ fontWeight: 700, color: '#1f2937', margin: 0 }}>VH-045</p>
                      <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0 0' }}>Sarah Lee</p>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#4b5563' }}>Oct 05</td>
                    <td style={{ padding: '16px 24px', color: '#4b5563' }}>Oct 06</td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, backgroundColor: '#f3f4f6', color: '#4b5563' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#6b7280' }} /> Scheduled
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* VEHICLE MANAGEMENT */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0 }}>Vehicle Fleet Status</h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '12px 24px' }}>Vehicle ID</th>
                    <th style={{ padding: '12px 24px' }}>Type &amp; Cap.</th>
                    <th style={{ padding: '12px 24px' }}>Location</th>
                    <th style={{ padding: '12px 24px' }}>Status</th>
                    <th style={{ padding: '12px 24px' }}>Assigned Trip</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '16px 24px', fontWeight: 700, color: '#111827' }}>VH-024</td>
                    <td style={{ padding: '16px 24px', color: '#4b5563' }}>Boeing 747 Cargo (12)</td>
                    <td style={{ padding: '16px 24px', color: '#4b5563' }}>Singapore (SIN)</td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, backgroundColor: '#eff6ff', color: '#1d4ed8' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#3b82f6' }} /> In Transit
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#2563eb', fontWeight: 600 }}>TR-2026-001</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '16px 24px', fontWeight: 700, color: '#111827' }}>VH-018</td>
                    <td style={{ padding: '16px 24px', color: '#4b5563' }}>Heavy Truck (2)</td>
                    <td style={{ padding: '16px 24px', color: '#4b5563' }}>London Depot</td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, backgroundColor: '#ecfdf5', color: '#047857' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} /> Available
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#9ca3af' }}>—</td>
                  </tr>
                  <tr style={{ backgroundColor: 'rgba(255, 251, 235, 0.35)' }}>
                    <td style={{ padding: '16px 24px', fontWeight: 700, color: '#111827' }}>VH-009</td>
                    <td style={{ padding: '16px 24px', color: '#4b5563' }}>Standard Trailer (3)</td>
                    <td style={{ padding: '16px 24px', color: '#4b5563' }}>Dubai Service Center</td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, backgroundColor: '#fffbeb', color: '#b45309' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#f59e0b' }} /> Maintenance
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#9ca3af' }}>—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Vehicle Status Summary + Schedule Alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* VEHICLE STATUS SUMMARY */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
              padding: '20px',
            }}
          >
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: '0 0 16px 0' }}>Vehicle Status</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ padding: '12px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Available</span>
                <span style={{ fontSize: '20px', fontWeight: 800, color: '#10b981' }}>09</span>
              </div>
              <div style={{ padding: '12px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>In Transit</span>
                <span style={{ fontSize: '20px', fontWeight: 800, color: '#2563eb' }}>12</span>
              </div>
              <div style={{ padding: '12px', backgroundColor: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#d97706', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Maintenance</span>
                <span style={{ fontSize: '20px', fontWeight: 800, color: '#d97706' }}>03</span>
              </div>
              <div style={{ padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '8px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#dc2626', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Unavailable</span>
                <span style={{ fontSize: '20px', fontWeight: 800, color: '#dc2626' }}>02</span>
              </div>
            </div>
          </div>

          {/* SCHEDULE ALERTS */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', backgroundColor: 'rgba(254, 242, 242, 0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bell size={16} color="#ef4444" /> Schedule Alerts
              </h3>
            </div>
            <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Alert 1 */}
              <div
                onClick={() => alert('Adjust Trip TR-2026-002')}
                style={{ padding: '12px', borderRadius: '8px', border: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background-color 0.15s' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#f9fafb')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#ffffff')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <p style={{ fontWeight: 700, fontSize: '13.5px', color: '#111827', margin: 0 }}>Route Delay</p>
                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>10m ago</span>
                </div>
                <p style={{ fontSize: '12px', color: '#4b5563', margin: '4px 0 6px 0' }}>
                  TR-2026-002 delayed by 4 hours. Estimated arrival adjusted.
                </p>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>Adjust Trip →</span>
              </div>

              {/* Alert 2 */}
              <div
                onClick={() => alert('Reassign Vehicle VH-009')}
                style={{ padding: '12px', borderRadius: '8px', border: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background-color 0.15s' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#f9fafb')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#ffffff')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <p style={{ fontWeight: 700, fontSize: '13.5px', color: '#111827', margin: 0 }}>Vehicle Conflict</p>
                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>1h ago</span>
                </div>
                <p style={{ fontSize: '12px', color: '#4b5563', margin: '4px 0 6px 0' }}>
                  VH-009 assigned to TR-2026-010 is scheduled for maintenance.
                </p>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>Reassign Vehicle →</span>
              </div>

              {/* Alert 3 */}
              <div
                onClick={() => alert('View Customs details for TR-2026-005')}
                style={{ padding: '12px', borderRadius: '8px', border: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background-color 0.15s' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#f9fafb')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#ffffff')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <p style={{ fontWeight: 700, fontSize: '13.5px', color: '#111827', margin: 0 }}>Departure Conflict</p>
                  <span style={{ fontSize: '11px', color: '#9ca3af' }}>2h ago</span>
                </div>
                <p style={{ fontSize: '12px', color: '#4b5563', margin: '4px 0 6px 0' }}>
                  Customs delay at DXB may impact departure of TR-2026-005.
                </p>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>View Details →</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. QUICK ACTIONS */}
      <div>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', marginBottom: '14px' }}>Quick Actions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <div
            onClick={() => router.push('/coordinator/routes')}
            style={{ backgroundColor: '#2563eb', color: '#ffffff', borderRadius: '12px', padding: '20px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)' }}
          >
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
              <MapPin size={20} />
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 2px 0' }}>Plan Route</h4>
            <p style={{ fontSize: '12px', color: '#bfdbfe', margin: 0, fontWeight: 500 }}>Create a new transport route</p>
          </div>

          <div
            onClick={() => router.push('/coordinator/vehicles')}
            style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}
          >
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
              <Truck size={20} />
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: '0 0 2px 0' }}>Manage Vehicles</h4>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: 0, fontWeight: 500 }}>Update fleet assignments</p>
          </div>

          <div
            onClick={() => router.push('/coordinator/schedule')}
            style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}
          >
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#f3e8ff', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
              <CalendarDays size={20} />
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: '0 0 2px 0' }}>View Schedule</h4>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: 0, fontWeight: 500 }}>Check all upcoming trips</p>
          </div>

          <div
            onClick={() => alert('Adjust Trip')}
            style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}
          >
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
              <Sliders size={20} />
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: '0 0 2px 0' }}>Adjust Trip</h4>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: 0, fontWeight: 500 }}>Modify active trip details</p>
          </div>
        </div>
      </div>
    </div>
  );
}
