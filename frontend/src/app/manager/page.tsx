'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plane,
  FileCheck2,
  AlertTriangle,
  Calendar,
  Target,
  ArrowRight,
  TrendingUp,
  Filter,
  ChevronRight,
  MoreHorizontal,
  DollarSign,
  PieChart,
  Star,
  Map,
  Users,
  BarChart3,
  ClipboardCheck,
  CheckCircle2,
} from 'lucide-react';

export default function ManagerDashboardPage() {
  const router = useRouter();

  // Emergency Change State
  const [emergencyStatus, setEmergencyStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');

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
          padding: '30px 34px',
          border: '1px solid rgba(15, 23, 42, 0.2)',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div>
          <p
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: '#94a3b8',
              textTransform: 'uppercase',
              marginBottom: '8px',
            }}
          >
            Saturday, September 26
          </p>
          <h2 style={{ fontSize: '28px', fontWeight: 700, color: '#ffffff', margin: '0 0 6px 0', lineHeight: 1.2 }}>
            Good morning, Alex
          </h2>
          <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0, fontWeight: 500 }}>
            Here is an overview of your transportation operations.
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
              <FileCheck2 size={14} color="#60a5fa" />
              <span>08 requests awaiting approval</span>
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
              <Plane size={14} color="#34d399" />
              <span>14 active trips</span>
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
              <AlertTriangle size={14} color="#f87171" />
              <span>02 incidents require attention</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            const tableElem = document.getElementById('pending-requests-table');
            if (tableElem) {
              tableElem.scrollIntoView({ behavior: 'smooth' });
            }
          }}
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
          Review Pending Requests <ArrowRight size={14} />
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
        {/* KPI 1 */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            padding: '20px',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: '#fffbeb',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileCheck2 size={20} />
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#dc2626',
                backgroundColor: '#fef2f2',
                padding: '2px 7px',
                borderRadius: '4px',
              }}
            >
              <TrendingUp size={12} /> +3 today
            </div>
          </div>
          <h3 style={{ fontSize: '30px', fontWeight: 800, color: '#111827', margin: '0 0 4px 0', lineHeight: 1 }}>08</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Pending Approvals
          </p>
        </div>

        {/* KPI 2 */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            padding: '20px',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: '#eff6ff',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Plane size={20} />
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#059669',
                backgroundColor: '#ecfdf5',
                padding: '2px 7px',
                borderRadius: '4px',
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} /> On schedule
            </div>
          </div>
          <h3 style={{ fontSize: '30px', fontWeight: 800, color: '#111827', margin: '0 0 4px 0', lineHeight: 1 }}>14</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Active Trips
          </p>
        </div>

        {/* KPI 3 */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            padding: '20px',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: '#f8fafc',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Calendar size={20} />
            </div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#6b7280',
                backgroundColor: '#f3f4f6',
                padding: '2px 7px',
                borderRadius: '4px',
              }}
            >
              Next 48h
            </div>
          </div>
          <h3 style={{ fontSize: '30px', fontWeight: 800, color: '#111827', margin: '0 0 4px 0', lineHeight: 1 }}>06</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Upcoming Departures
          </p>
        </div>

        {/* KPI 4 */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            padding: '20px',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: '#fef2f2',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={20} />
            </div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#dc2626',
                backgroundColor: '#fef2f2',
                padding: '2px 7px',
                borderRadius: '4px',
              }}
            >
              Needs Action
            </div>
          </div>
          <h3 style={{ fontSize: '30px', fontWeight: 800, color: '#111827', margin: '0 0 4px 0', lineHeight: 1 }}>02</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Emergency Incidents
          </p>
        </div>

        {/* KPI 5 */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            padding: '20px',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: '#ecfdf5',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Target size={20} />
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#059669',
                backgroundColor: '#ecfdf5',
                padding: '2px 7px',
                borderRadius: '4px',
              }}
            >
              <TrendingUp size={12} /> +1.2%
            </div>
          </div>
          <h3 style={{ fontSize: '30px', fontWeight: 800, color: '#111827', margin: '0 0 4px 0', lineHeight: 1 }}>96.4%</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            On-Time Delivery
          </p>
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
        {/* LEFT COLUMN: Incidents Table + Transport Requests Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', gridColumn: 'span 2' }}>
          {/* INCIDENTS TABLE */}
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
                backgroundColor: 'rgba(254, 242, 242, 0.35)',
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: '#111827',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    margin: 0,
                  }}
                >
                  <AlertTriangle size={18} color="#ef4444" /> Incidents Requiring Attention
                </h3>
                <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', margin: '2px 0 0 0' }}>
                  2 active incidents requiring manager review
                </p>
              </div>

              <Link
                href="/manager/incidents"
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: '#eff6ff',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                }}
              >
                View all <ChevronRight size={13} />
              </Link>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '12px 24px' }}>Incident</th>
                    <th style={{ padding: '12px 24px' }}>Trip / Loc</th>
                    <th style={{ padding: '12px 24px' }}>Severity</th>
                    <th style={{ padding: '12px 24px' }}>Time</th>
                    <th style={{ padding: '12px 24px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Row 1 */}
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '16px 24px' }}>
                      <p style={{ fontWeight: 700, color: '#111827', margin: 0 }}>Emergency Route Blockage</p>
                      <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0 0', fontWeight: 400 }}>Highway A4 closed due to accident</p>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#4b5563' }}>
                      <span style={{ fontWeight: 600, color: '#1f2937' }}>TR-2026-014</span>
                      <br />
                      <span style={{ fontSize: '12px' }}>Singapore</span>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: '#fef2f2',
                          color: '#b91c1c',
                          border: '1px solid #fee2e2',
                        }}
                      >
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ef4444' }} /> High
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#6b7280', fontSize: '12px' }}>10 min ago</td>
                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                          onClick={() => alert('Reviewing Incident: Emergency Route Blockage on TR-2026-014')}
                          style={{
                            padding: '6px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#374151',
                            backgroundColor: '#ffffff',
                            cursor: 'pointer',
                          }}
                        >
                          Review
                        </button>
                        <button style={{ color: '#9ca3af', border: 'none', background: 'none', cursor: 'pointer' }}>
                          <MoreHorizontal size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Row 2 */}
                  <tr>
                    <td style={{ padding: '16px 24px' }}>
                      <p style={{ fontWeight: 700, color: '#111827', margin: 0 }}>Flight Delay</p>
                      <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0 0', fontWeight: 400 }}>EK998 delayed by 4 hours</p>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#4b5563' }}>
                      <span style={{ fontWeight: 600, color: '#1f2937' }}>TR-2026-009</span>
                      <br />
                      <span style={{ fontSize: '12px' }}>Dubai Intl</span>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          backgroundColor: '#fffbeb',
                          color: '#b45309',
                          border: '1px solid #fef3c7',
                        }}
                      >
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#f59e0b' }} /> Medium
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#6b7280', fontSize: '12px' }}>45 min ago</td>
                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                          onClick={() => alert('Reviewing Incident: Flight Delay EK998 on TR-2026-009')}
                          style={{
                            padding: '6px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#374151',
                            backgroundColor: '#ffffff',
                            cursor: 'pointer',
                          }}
                        >
                          Review
                        </button>
                        <button style={{ color: '#9ca3af', border: 'none', background: 'none', cursor: 'pointer' }}>
                          <MoreHorizontal size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* TRANSPORT REQUESTS TABLE */}
          <div
            id="pending-requests-table"
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
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0 }}>Transport Requests</h3>
                <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', margin: '2px 0 0 0' }}>
                  Requests requiring management review
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
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
                <Link
                  href="/manager/requests"
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 10px',
                    textDecoration: 'none',
                  }}
                >
                  View all <ChevronRight size={13} />
                </Link>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '12px 24px' }}>Request ID</th>
                    <th style={{ padding: '12px 24px' }}>Route</th>
                    <th style={{ padding: '12px 24px' }}>Customer / Horses</th>
                    <th style={{ padding: '12px 24px' }}>Requested Date</th>
                    <th style={{ padding: '12px 24px' }}>Status</th>
                    <th style={{ padding: '12px 24px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Row 1 */}
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ fontWeight: 700, color: '#111827' }}>TR-2026-001</span>
                      <br />
                      <span
                        style={{
                          display: 'inline-flex',
                          padding: '2px 6px',
                          marginTop: '4px',
                          borderRadius: '4px',
                          fontSize: '9.5px',
                          fontWeight: 700,
                          backgroundColor: '#fef2f2',
                          color: '#b91c1c',
                          textTransform: 'uppercase',
                        }}
                      >
                        High Priority
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 700, color: '#1f2937', display: 'block' }}>DXB</span>
                          <span style={{ fontSize: '10px', color: '#6b7280' }}>Dubai</span>
                        </div>
                        <span style={{ color: '#d1d5db' }}>→</span>
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 700, color: '#1f2937', display: 'block' }}>SGN</span>
                          <span style={{ fontSize: '10px', color: '#6b7280' }}>Ho Chi Minh</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            backgroundColor: '#f3f4f6',
                            border: '1px solid #e5e7eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#6b7280',
                            flexShrink: 0,
                          }}
                        >
                          2♞
                        </div>
                        <div>
                          <p style={{ fontWeight: 700, color: '#111827', margin: 0 }}>Alex Morgan</p>
                          <p style={{ fontSize: '11px', color: '#6b7280', margin: 0 }}>Al Fares Stud</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#4b5563' }}>Sep 28, 2026</td>
                    <td style={{ padding: '16px 24px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          backgroundColor: '#fffbeb',
                          color: '#b45309',
                          border: '1px solid #fef3c7',
                        }}
                      >
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#f59e0b' }} /> Pending Approval
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                          onClick={() => alert('Reviewing Request TR-2026-001 (DXB -> SGN)')}
                          style={{
                            padding: '6px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#374151',
                            backgroundColor: '#ffffff',
                            cursor: 'pointer',
                          }}
                        >
                          Review
                        </button>
                        <button style={{ color: '#9ca3af', border: 'none', background: 'none', cursor: 'pointer' }}>
                          <MoreHorizontal size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Row 2 */}
                  <tr>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ fontWeight: 700, color: '#111827' }}>TR-2026-002</span>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 700, color: '#1f2937', display: 'block' }}>SIN</span>
                          <span style={{ fontSize: '10px', color: '#6b7280' }}>Singapore</span>
                        </div>
                        <span style={{ color: '#d1d5db' }}>→</span>
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ fontWeight: 700, color: '#1f2937', display: 'block' }}>SGN</span>
                          <span style={{ fontSize: '10px', color: '#6b7280' }}>Ho Chi Minh</span>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            backgroundColor: '#f3f4f6',
                            border: '1px solid #e5e7eb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#6b7280',
                            flexShrink: 0,
                          }}
                        >
                          1♞
                        </div>
                        <div>
                          <p style={{ fontWeight: 700, color: '#111827', margin: 0 }}>Emma Wilson</p>
                          <p style={{ fontSize: '11px', color: '#6b7280', margin: 0 }}>Private Owner</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#4b5563' }}>Oct 05, 2026</td>
                    <td style={{ padding: '16px 24px' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          backgroundColor: '#fffbeb',
                          color: '#b45309',
                          border: '1px solid #fef3c7',
                        }}
                      >
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#f59e0b' }} /> Pending Approval
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                          onClick={() => alert('Reviewing Request TR-2026-002 (SIN -> SGN)')}
                          style={{
                            padding: '6px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#374151',
                            backgroundColor: '#ffffff',
                            cursor: 'pointer',
                          }}
                        >
                          Review
                        </button>
                        <button style={{ color: '#9ca3af', border: 'none', background: 'none', cursor: 'pointer' }}>
                          <MoreHorizontal size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Operations Overview + Emergency Changes + Quick Analytics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* OPERATION OVERVIEW (3 Compact Cards) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                padding: '16px',
                textAlign: 'center',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Active
              </span>
              <span style={{ fontSize: '24px', fontWeight: 800, color: '#111827' }}>14</span>
            </div>

            <div
              style={{
                backgroundColor: 'rgba(254, 242, 242, 0.5)',
                borderRadius: '12px',
                border: '1px solid #fee2e2',
                padding: '16px',
                textAlign: 'center',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Delayed
              </span>
              <span style={{ fontSize: '24px', fontWeight: 800, color: '#ef4444' }}>03</span>
            </div>

            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                padding: '16px',
                textAlign: 'center',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                Completed
              </span>
              <span style={{ fontSize: '24px', fontWeight: 800, color: '#10b981' }}>08</span>
            </div>
          </div>

          {/* APPROVAL PANEL (Emergency Changes) */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
              padding: '20px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: 0 }}>Emergency Changes</h3>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  color: '#b45309',
                  backgroundColor: '#fffbeb',
                  border: '1px solid #fef3c7',
                  padding: '2px 8px',
                  borderRadius: '999px',
                }}
              >
                {emergencyStatus === 'PENDING' ? '1 Pending' : emergencyStatus === 'APPROVED' ? 'Approved' : 'Rejected'}
              </span>
            </div>

            <div
              style={{
                border: '1px solid #fed7aa',
                backgroundColor: 'rgba(255, 251, 235, 0.35)',
                borderRadius: '10px',
                padding: '16px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <span style={{ fontWeight: 700, color: '#111827', fontSize: '13.5px' }}>Trip TR-2026-014</span>
                <span
                  onClick={() => alert('Viewing route details for TR-2026-014')}
                  style={{ fontSize: '12px', fontWeight: 600, color: '#2563eb', cursor: 'pointer' }}
                >
                  View details
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280' }}>Current Route:</span>
                  <span style={{ fontWeight: 500, color: '#1f2937' }}>Highway A4</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#6b7280' }}>Proposed:</span>
                  <span
                    style={{
                      fontWeight: 700,
                      color: '#dc2626',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      backgroundColor: '#ffffff',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      border: '1px solid #fecaca',
                      fontSize: '11.5px',
                    }}
                  >
                    Detour via A6 →
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280' }}>Add. Cost:</span>
                  <span style={{ fontWeight: 700, color: '#111827' }}>+$450.00</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#6b7280' }}>Reason:</span>
                  <span style={{ fontWeight: 500, color: '#1f2937', maxWidth: '170px', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Major accident on A4
                  </span>
                </div>
              </div>

              {emergencyStatus === 'PENDING' ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(254, 215, 170, 0.5)' }}>
                  <button
                    onClick={() => setEmergencyStatus('REJECTED')}
                    style={{
                      padding: '8px',
                      borderRadius: '8px',
                      border: '1px solid #d1d5db',
                      backgroundColor: '#ffffff',
                      color: '#374151',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => setEmergencyStatus('APPROVED')}
                    style={{
                      padding: '8px',
                      borderRadius: '8px',
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      fontWeight: 600,
                      fontSize: '13px',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Approve
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    marginTop: '16px',
                    padding: '8px',
                    borderRadius: '8px',
                    textAlign: 'center',
                    fontWeight: 700,
                    fontSize: '12px',
                    backgroundColor: emergencyStatus === 'APPROVED' ? '#ecfdf5' : '#fef2f2',
                    color: emergencyStatus === 'APPROVED' ? '#059669' : '#dc2626',
                  }}
                >
                  {emergencyStatus === 'APPROVED' ? '✓ Route Detour Approved' : '✗ Route Detour Rejected'}
                </div>
              )}
            </div>
          </div>

          {/* REPORTS / ANALYTICS (Compact) */}
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
                padding: '14px 20px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#f9fafb',
              }}
            >
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: 0 }}>Quick Analytics</h3>
              <MoreHorizontal size={16} color="#9ca3af" style={{ cursor: 'pointer' }} />
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Revenue */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      backgroundColor: '#ecfdf5',
                      color: '#10b981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <DollarSign size={16} />
                  </div>
                  <div>
                    <p style={{ fontSize: '11px', color: '#6b7280', margin: 0, fontWeight: 500 }}>Revenue (MTD)</p>
                    <p style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: 0 }}>$142,500</p>
                  </div>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#10b981' }}>+12%</span>
              </div>

              {/* Trans. Cost */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      backgroundColor: '#fef2f2',
                      color: '#ef4444',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <PieChart size={16} />
                  </div>
                  <div>
                    <p style={{ fontSize: '11px', color: '#6b7280', margin: 0, fontWeight: 500 }}>Trans. Cost (MTD)</p>
                    <p style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: 0 }}>$84,200</p>
                  </div>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#ef4444' }}>+4%</span>
              </div>

              {/* Performance */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      backgroundColor: '#eff6ff',
                      color: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Plane size={16} />
                  </div>
                  <div>
                    <p style={{ fontSize: '11px', color: '#6b7280', margin: 0, fontWeight: 500 }}>Trip Performance</p>
                    <p style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: 0 }}>Excellent</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '2px', color: '#2563eb' }}>
                  <Star size={13} fill="#2563eb" />
                  <Star size={13} fill="#2563eb" />
                  <Star size={13} fill="#2563eb" />
                  <Star size={13} fill="#2563eb" />
                  <Star size={13} />
                </div>
              </div>

              <button
                onClick={() => router.push('/manager/reports')}
                style={{
                  width: '100%',
                  marginTop: '6px',
                  padding: '9px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#2563eb',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#eff6ff')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc')}
              >
                View Full Report
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. QUICK ACTIONS */}
      <div>
        <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', marginBottom: '14px' }}>Quick Actions</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
          }}
        >
          {/* Action 1 */}
          <div
            onClick={() => router.push('/manager/requests')}
            style={{
              backgroundColor: '#2563eb',
              color: '#ffffff',
              borderRadius: '12px',
              padding: '20px',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              position: 'relative',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.transform = 'translateY(0)')}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '14px',
              }}
            >
              <ClipboardCheck size={20} />
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 2px 0' }}>Review Requests</h4>
            <p style={{ fontSize: '12px', color: '#bfdbfe', margin: 0, fontWeight: 500 }}>Process pending approvals</p>
          </div>

          {/* Action 2 */}
          <div
            onClick={() => router.push('/manager/planning')}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              padding: '20px',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              position: 'relative',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.transform = 'translateY(0)')}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: '#fffbeb',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '14px',
              }}
            >
              <Map size={20} />
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: '0 0 2px 0' }}>Plan Trip</h4>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: 0, fontWeight: 500 }}>Create routes and logistics</p>
          </div>

          {/* Action 3 */}
          <div
            onClick={() => router.push('/manager/staff')}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              padding: '20px',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              position: 'relative',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.transform = 'translateY(0)')}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: '#ecfdf5',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '14px',
              }}
            >
              <Users size={20} />
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: '0 0 2px 0' }}>Assign Staff</h4>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: 0, fontWeight: 500 }}>Manage drivers and escorts</p>
          </div>

          {/* Action 4 */}
          <div
            onClick={() => router.push('/manager/reports')}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              padding: '20px',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
              position: 'relative',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.transform = 'translateY(0)')}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: '#f3e8ff',
                color: '#a855f7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '14px',
              }}
            >
              <BarChart3 size={20} />
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: '0 0 2px 0' }}>View Reports</h4>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: 0, fontWeight: 500 }}>Analyze operation metrics</p>
          </div>
        </div>
      </div>
    </div>
  );
}
