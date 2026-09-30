'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, Calendar, MapPin, MoreHorizontal, X, ChevronDown, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCustomerStore } from '@/lib/customer-store';
import { Horse } from '@/lib/types';

export default function HorsesPage() {
  const router = useRouter();
  const { horses } = useCustomerStore();
  const [searchTerm, setSearchTerm] = useState('');

  // Fallback if horses store empty
  const displayHorses = horses.length > 0 ? horses : [];

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'In Transit':
      case 'Scheduled':
        return { bg: '#e0e7ff', text: '#3730a3', dot: '#4f46e5' };
      case 'Available':
        return { bg: '#dcfce7', text: '#166534', dot: '#22c55e' };
      case 'Not Cleared':
        return { bg: '#fee2e2', text: '#991b1b', dot: '#ef4444' };
      case 'Healthy':
      case 'Valid':
        return { bg: '#dcfce7', text: '#15803d', icon: '#22c55e' };
      case 'Monitoring':
      case 'Expiring Soon':
        return { bg: '#ffedd5', text: '#c2410c', icon: '#f97316' };
      case 'Medical Attention':
      case 'Missing':
        return { bg: '#fee2e2', text: '#b91c1c', icon: '#ef4444' };
      default:
        return { bg: '#f1f5f9', text: '#475569', icon: '#94a3b8', dot: '#94a3b8' };
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' }}>
            My Horses
          </h2>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
            View and manage your registered racehorses, medical records, and transport documents.
          </p>
        </div>
        <Button
          variant="primary"
          style={{ borderRadius: '8px', padding: '10px 16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
          onClick={() => alert('Add New Horse')}
        >
          <Plus size={18} />
          Add New Horse
        </Button>
      </div>

      {/* Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
        {/* Total Horses */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 17v-1c0-4-3-7-7-7H9l-2-3H3l1 5-2 3v3h10" /><circle cx="8" cy="7" r="1" /></svg>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5v14"/></svg>
              2 this year
            </div>
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>08</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>Total Horses</div>
          </div>
        </div>

        {/* Active for Transport */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#2563eb', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#2563eb' }} />
              1 In transit
            </div>
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>05</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>Active for Transport</div>
          </div>
        </div>

        {/* Documents Valid */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
              75% compliant
            </div>
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>06</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>Documents Valid</div>
          </div>
        </div>

        {/* Documents Expiring Soon */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#ffedd5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ea580c' }}>
              <AlertTriangle size={20} />
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#ea580c', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Within 14 days
            </div>
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>02</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>Documents Expiring Soon</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', backgroundColor: '#fff', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
          <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input 
            type="text" 
            placeholder="Search horse by name or ID" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '10px 10px 10px 36px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none' }}
          />
        </div>
        
        {['All breed', 'All gender', 'All health', 'All documents'].map((filter, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', color: '#475569', cursor: 'pointer', minWidth: '130px' }}>
            {filter}
            <ChevronDown size={14} color="#94a3b8" style={{ marginLeft: '8px' }} />
          </div>
        ))}
        
        <button style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#94a3b8', fontSize: '14px', fontWeight: 500, cursor: 'pointer', marginLeft: 'auto' }}>
          <X size={14} /> Clear Filters
        </button>
      </div>

      <div style={{ fontSize: '14px', color: '#64748b' }}>
        Showing <strong>{displayHorses.length}</strong> of {displayHorses.length} horses
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
        {displayHorses.map((horse) => {
          const availColor = getStatusColor(horse.availabilityStatus);
          const healthColor = getStatusColor(horse.medicalStatus);
          const docColor = getStatusColor(horse.documentStatus);

          return (
            <div key={horse.id} style={{ backgroundColor: '#fff', borderRadius: '16px', overflow: 'hidden', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
              {/* Image Header */}
              <div style={{ height: '200px', backgroundColor: '#f1f5f9', position: 'relative' }}>
                {horse.photoUrl ? (
                  <img src={horse.photoUrl} alt={horse.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 17v-1c0-4-3-7-7-7H9l-2-3H3l1 5-2 3v3h10" /><circle cx="8" cy="7" r="1" /></svg>
                  </div>
                )}
                
                {/* ID Badge */}
                <div style={{ position: 'absolute', top: '12px', left: '12px', backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(4px)', color: '#fff', fontSize: '11px', fontWeight: 600, padding: '4px 8px', borderRadius: '6px' }}>
                  {horse.code}
                </div>
                
                {/* Availability Badge */}
                {horse.availabilityStatus && (
                  <div style={{ position: 'absolute', top: '12px', right: '12px', backgroundColor: availColor.bg, color: availColor.text, fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '6px', border: `1px solid ${availColor.bg}` }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: availColor.dot }} />
                    {horse.availabilityStatus}
                  </div>
                )}
              </div>

              {/* Content */}
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                
                {/* Title Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>{horse.name}</h3>
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>{horse.breed} • {horse.gender}</p>
                  </div>
                  <button style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}>
                    <MoreHorizontal size={20} />
                  </button>
                </div>

                {/* Details Row */}
                <div style={{ display: 'flex', gap: '20px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '12px', marginBottom: '4px' }}>
                      <Calendar size={14} /> Date of birth
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                      {horse.dob} • {horse.age}y
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '12px', marginBottom: '4px' }}>
                      <MapPin size={14} /> Location
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                      {horse.location || 'Unknown'}
                    </div>
                  </div>
                </div>

                {/* Status Row */}
                <div style={{ display: 'flex', gap: '20px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Health</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, backgroundColor: healthColor.bg, color: healthColor.text, border: `1px solid rgba(0,0,0,0.05)` }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: healthColor.icon }} />
                      {horse.medicalStatus || 'Unknown'}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>Documents</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, backgroundColor: docColor.bg, color: docColor.text, border: `1px solid rgba(0,0,0,0.05)` }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: docColor.icon }} />
                      {horse.documentStatus || 'Unknown'}
                    </div>
                  </div>
                </div>

                {/* Action Button */}
                <Button 
                  variant="outline" 
                  style={{ width: '100%', marginTop: 'auto', borderRadius: '8px', color: '#334155', borderColor: '#e2e8f0', fontWeight: 600 }}
                  onClick={() => router.push(`/customer/horses/${horse.id}`)}
                >
                  View Details
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
