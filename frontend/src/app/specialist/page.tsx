'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  FileSignature,
  AlertTriangle,
  Clock,
  ArrowRight,
  Search,
  FileX,
  ShieldCheck,
  TrendingUp,
  Filter,
  Syringe,
  Stethoscope,
  Building2,
  FolderOpen,
  Scale,
} from 'lucide-react';

export default function SpecialistDashboardPage() {
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
            Here is an overview of your compliance activities.
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
              <FileSignature size={14} color="#60a5fa" />
              <span>12 documents pending</span>
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
              <span>05 missing documents</span>
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
              <Clock size={14} color="#fbbf24" />
              <span>03 documents expiring soon</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            const tableElem = document.getElementById('review-queue-table');
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
          Review Documents <ArrowRight size={14} />
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileSignature size={20} />
            </div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', backgroundColor: '#f3f4f6', padding: '2px 7px', borderRadius: '4px' }}>Today</span>
          </div>
          <h3 style={{ fontSize: '30px', fontWeight: 800, color: '#111827', margin: '0 0 4px 0', lineHeight: 1 }}>12</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Pending Documents</p>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Search size={20} />
            </div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', backgroundColor: '#eff6ff', padding: '2px 7px', borderRadius: '4px' }}>In Progress</span>
          </div>
          <h3 style={{ fontSize: '30px', fontWeight: 800, color: '#111827', margin: '0 0 4px 0', lineHeight: 1 }}>07</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Under Review</p>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileX size={20} />
            </div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#dc2626', backgroundColor: '#fef2f2', padding: '2px 7px', borderRadius: '4px' }}>Needs Action</span>
          </div>
          <h3 style={{ fontSize: '30px', fontWeight: 800, color: '#111827', margin: '0 0 4px 0', lineHeight: 1 }}>05</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Missing Documents</p>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#fff7ed', color: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={20} />
            </div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#d97706', backgroundColor: '#fffbeb', padding: '2px 7px', borderRadius: '4px' }}>Next 7 Days</span>
          </div>
          <h3 style={{ fontSize: '30px', fontWeight: 800, color: '#111827', margin: '0 0 4px 0', lineHeight: 1 }}>03</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Expiring Soon</p>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={20} />
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: 700, color: '#059669', backgroundColor: '#ecfdf5', padding: '2px 7px', borderRadius: '4px' }}>
              <TrendingUp size={12} /> +0.5%
            </div>
          </div>
          <h3 style={{ fontSize: '30px', fontWeight: 800, color: '#111827', margin: '0 0 4px 0', lineHeight: 1 }}>92%</h3>
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Compliance Rate</p>
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
        {/* LEFT COLUMN: Review Queue + Missing Documents */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', gridColumn: 'span 2' }}>
          {/* DOCUMENT REVIEW QUEUE */}
          <div
            id="review-queue-table"
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
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0 }}>Document Review Queue</h3>
                <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', margin: '2px 0 0 0' }}>
                  Documents submitted by customers awaiting approval
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
                    <th style={{ padding: '12px 24px' }}>Document ID</th>
                    <th style={{ padding: '12px 24px' }}>Horse / Request</th>
                    <th style={{ padding: '12px 24px' }}>Document Type</th>
                    <th style={{ padding: '12px 24px' }}>Submitted</th>
                    <th style={{ padding: '12px 24px' }}>Status</th>
                    <th style={{ padding: '12px 24px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Row 1 */}
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '16px 24px', fontWeight: 700, color: '#111827' }}>DOC-2026-041</td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#f3f4f6', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                          ♞
                        </div>
                        <div>
                          <p style={{ fontWeight: 700, color: '#111827', margin: 0 }}>Thunder</p>
                          <p style={{ fontSize: '11px', color: '#2563eb', margin: 0, fontWeight: 600, cursor: 'pointer' }}>TR-2026-001</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#374151' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Syringe size={14} color="#9ca3af" /> Vaccination Certificate
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#4b5563' }}>Sep 24, 2026</td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, backgroundColor: '#fffbeb', color: '#b45309', border: '1px solid #fef3c7' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#f59e0b' }} /> Pending Review
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                      <button
                        onClick={() => alert('Reviewing Vaccination Certificate for Thunder')}
                        style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #2563eb', backgroundColor: '#2563eb', color: '#ffffff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Review
                      </button>
                    </td>
                  </tr>

                  {/* Row 2 */}
                  <tr>
                    <td style={{ padding: '16px 24px', fontWeight: 700, color: '#111827' }}>DOC-2026-042</td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#f3f4f6', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                          ♞
                        </div>
                        <div>
                          <p style={{ fontWeight: 700, color: '#111827', margin: 0 }}>Silver Star</p>
                          <p style={{ fontSize: '11px', color: '#2563eb', margin: 0, fontWeight: 600, cursor: 'pointer' }}>TR-2026-002</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#374151' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Stethoscope size={14} color="#9ca3af" /> Medical Certificate
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#4b5563' }}>Sep 25, 2026</td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, backgroundColor: '#fffbeb', color: '#b45309', border: '1px solid #fef3c7' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#f59e0b' }} /> Pending Review
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                      <button
                        onClick={() => alert('Reviewing Medical Certificate for Silver Star')}
                        style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #2563eb', backgroundColor: '#2563eb', color: '#ffffff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* MISSING DOCUMENTS TABLE */}
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
                backgroundColor: 'rgba(254, 242, 242, 0.35)',
              }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} color="#ef4444" /> Documents Requiring Attention
              </h3>
              <p style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', margin: '2px 0 0 0' }}>
                Missing or rejected documents that block transport approval
              </p>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '12px 24px' }}>Horse / Request</th>
                    <th style={{ padding: '12px 24px' }}>Missing Document</th>
                    <th style={{ padding: '12px 24px' }}>Due Date</th>
                    <th style={{ padding: '12px 24px' }}>Status</th>
                    <th style={{ padding: '12px 24px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '16px 24px' }}>
                      <p style={{ fontWeight: 700, color: '#111827', margin: 0 }}>Royal Star</p>
                      <p style={{ fontSize: '11px', color: '#2563eb', margin: 0, fontWeight: 600, cursor: 'pointer' }}>TR-2026-002</p>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#1f2937' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <FileX size={15} color="#ef4444" /> Quarantine Certificate
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#dc2626', fontWeight: 700 }}>Sep 29, 2026</td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fee2e2' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ef4444' }} /> Missing
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                      <button
                        onClick={() => alert('Sending notification to customer for missing Quarantine Certificate')}
                        style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#374151', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Request
                      </button>
                    </td>
                  </tr>

                  <tr>
                    <td style={{ padding: '16px 24px' }}>
                      <p style={{ fontWeight: 700, color: '#111827', margin: 0 }}>Midnight</p>
                      <p style={{ fontSize: '11px', color: '#2563eb', margin: 0, fontWeight: 600, cursor: 'pointer' }}>TR-2026-008</p>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#1f2937' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <FolderOpen size={15} color="#9ca3af" /> Export Permit (UAE)
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#4b5563' }}>Oct 01, 2026</td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fee2e2' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ef4444' }} /> Rejected
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                      <button
                        onClick={() => alert('Sending notification to customer for re-submitting Export Permit')}
                        style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#ffffff', color: '#374151', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Request
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Compliance Overview + Expiring Docs + Regulations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* COMPLIANCE OVERVIEW */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
              padding: '20px',
            }}
          >
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: '0 0 16px 0' }}>Compliance Overview</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Medical */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Stethoscope size={15} color="#9ca3af" /> Medical Compliance
                  </span>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#10b981' }}>92%</span>
                </div>
                <div style={{ width: '100%', height: '8px', backgroundColor: '#f3f4f6', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ width: '92%', height: '100%', backgroundColor: '#10b981', borderRadius: '999px' }} />
                </div>
              </div>

              {/* Quarantine */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldCheck size={15} color="#9ca3af" /> Quarantine Compliance
                  </span>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#10b981' }}>96%</span>
                </div>
                <div style={{ width: '100%', height: '8px', backgroundColor: '#f3f4f6', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ width: '96%', height: '100%', backgroundColor: '#10b981', borderRadius: '999px' }} />
                </div>
              </div>

              {/* Customs */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Building2 size={15} color="#9ca3af" /> Customs Compliance
                  </span>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#d97706' }}>89%</span>
                </div>
                <div style={{ width: '100%', height: '8px', backgroundColor: '#f3f4f6', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ width: '89%', height: '100%', backgroundColor: '#f59e0b', borderRadius: '999px' }} />
                </div>
              </div>
            </div>
          </div>

          {/* DOCUMENT EXPIRATION */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
              padding: '20px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: 0 }}>Expiring Documents</h3>
              <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#b45309', backgroundColor: '#fffbeb', padding: '2px 8px', borderRadius: '999px' }}>
                3 Soon
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Doc 1 */}
              <div
                onClick={() => alert('View EIA Certificate details')}
                style={{
                  padding: '12px',
                  border: '1px solid #f3f4f6',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <div>
                  <p style={{ fontWeight: 700, fontSize: '13.5px', color: '#111827', margin: 0 }}>EIA Certificate</p>
                  <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0 0' }}>Thunder (TR-2026-001)</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#b45309', backgroundColor: '#fffbeb', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginBottom: '2px' }}>
                    Expires in 3 days
                  </span>
                  <p style={{ fontSize: '10px', color: '#6b7280', margin: 0 }}>Sep 29, 2026</p>
                </div>
              </div>

              {/* Doc 2 */}
              <div
                onClick={() => alert('View Import Permit details')}
                style={{
                  padding: '12px',
                  border: '1px solid #fee2e2',
                  backgroundColor: 'rgba(254, 242, 242, 0.4)',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <div>
                  <p style={{ fontWeight: 700, fontSize: '13.5px', color: '#111827', margin: 0 }}>Import Permit (SG)</p>
                  <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0 0' }}>Starlight (TR-2026-015)</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#dc2626', backgroundColor: '#fef2f2', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginBottom: '2px' }}>
                    Expired
                  </span>
                  <p style={{ fontSize: '10px', color: '#dc2626', margin: 0, fontWeight: 600 }}>Yesterday</p>
                </div>
              </div>
            </div>
          </div>

          {/* REGULATIONS COMPACT */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: 0 }}>Regulations Watchlist</h3>
            </div>
            <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div
                onClick={() => alert('Viewing Singapore quarantine protocol update')}
                style={{ padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', borderRadius: '8px' }}
              >
                <div>
                  <p style={{ fontWeight: 700, fontSize: '13.5px', color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🇸🇬 Singapore
                  </p>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0 0' }}>Quarantine Protocol Update</p>
                </div>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#047857', backgroundColor: '#ecfdf5', padding: '2px 7px', borderRadius: '4px' }}>
                  Active
                </span>
              </div>

              <div
                onClick={() => alert('Viewing UAE equine import regulations')}
                style={{ padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', borderRadius: '8px' }}
              >
                <div>
                  <p style={{ fontWeight: 700, fontSize: '13.5px', color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🇦🇪 UAE
                  </p>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0 0' }}>Equine Import Regulations</p>
                </div>
                <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#b45309', backgroundColor: '#fffbeb', padding: '2px 7px', borderRadius: '4px' }}>
                  Review Required
                </span>
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
            onClick={() => router.push('/specialist/approval')}
            style={{ backgroundColor: '#2563eb', color: '#ffffff', borderRadius: '12px', padding: '20px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)' }}
          >
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
              <Search size={20} />
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 2px 0' }}>Review Documents</h4>
            <p style={{ fontSize: '12px', color: '#bfdbfe', margin: 0, fontWeight: 500 }}>Process pending submissions</p>
          </div>

          <div
            onClick={() => router.push('/specialist/documents')}
            style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}
          >
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
              <FolderOpen size={20} />
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: '0 0 2px 0' }}>Create Dossier</h4>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: 0, fontWeight: 500 }}>Compile transport documents</p>
          </div>

          <div
            onClick={() => router.push('/specialist/missing')}
            style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}
          >
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
              <FileX size={20} />
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: '0 0 2px 0' }}>Request Missing</h4>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: 0, fontWeight: 500 }}>Notify clients of missing docs</p>
          </div>

          <div
            onClick={() => router.push('/specialist/regulations')}
            style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)' }}
          >
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
              <Scale size={20} />
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', margin: '0 0 2px 0' }}>View Regulations</h4>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: 0, fontWeight: 500 }}>Check border compliance</p>
          </div>
        </div>
      </div>
    </div>
  );
}
