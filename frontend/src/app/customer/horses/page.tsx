'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, Calendar, MapPin, X, AlertTriangle, Edit3, Trash2, CheckCircle2, ShieldCheck, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCustomerStore } from '@/lib/customer-store';
import { Horse } from '@/lib/types';
import { AddHorseModal } from '@/components/horses/AddHorseModal';
import { EditHorseModal } from '@/components/horses/EditHorseModal';
import { DeleteHorseModal } from '@/components/horses/DeleteHorseModal';

export default function HorsesPage() {
  const router = useRouter();
  const { horses } = useCustomerStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [breedFilter, setBreedFilter] = useState('ALL');
  const [genderFilter, setGenderFilter] = useState('ALL');
  const [healthFilter, setHealthFilter] = useState('ALL');
  const [docFilter, setDocFilter] = useState('ALL');

  const [isAddHorseModalOpen, setIsAddHorseModalOpen] = useState(false);
  const [editingHorse, setEditingHorse] = useState<Horse | null>(null);
  const [deletingHorse, setDeletingHorse] = useState<Horse | null>(null);

  // Dynamic Metrics
  const totalCount = horses.length;
  const activeCount = horses.filter(h => h.availabilityStatus === 'Available' || h.availabilityStatus === 'In Transit').length;
  const inTransitCount = horses.filter(h => h.availabilityStatus === 'In Transit').length;
  const validDocCount = horses.filter(h => h.documentStatus === 'Valid').length;
  const compliancePct = totalCount > 0 ? Math.round((validDocCount / totalCount) * 100) : 100;
  const expiringDocCount = horses.filter(h => h.documentStatus === 'Expiring Soon' || h.documentStatus === 'Missing').length;

  // Extract unique breeds
  const availableBreeds = useMemo(() => {
    const set = new Set<string>();
    horses.forEach(h => {
      if (h.breed) set.add(h.breed);
    });
    return Array.from(set);
  }, [horses]);

  // Filtering
  const filteredHorses = useMemo(() => {
    return horses.filter((horse) => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        horse.name.toLowerCase().includes(q) ||
        (horse.code && horse.code.toLowerCase().includes(q)) ||
        (horse.breed && horse.breed.toLowerCase().includes(q)) ||
        (horse.microchipNumber && horse.microchipNumber.toLowerCase().includes(q));

      const matchesBreed = breedFilter === 'ALL' || horse.breed?.toLowerCase() === breedFilter.toLowerCase();
      const matchesGender = genderFilter === 'ALL' || horse.gender?.toLowerCase() === genderFilter.toLowerCase();
      const matchesHealth = healthFilter === 'ALL' || horse.medicalStatus?.toLowerCase() === healthFilter.toLowerCase();
      const matchesDoc = docFilter === 'ALL' || horse.documentStatus?.toLowerCase() === docFilter.toLowerCase();

      return matchesSearch && matchesBreed && matchesGender && matchesHealth && matchesDoc;
    });
  }, [horses, searchTerm, breedFilter, genderFilter, healthFilter, docFilter]);

  const hasActiveFilters = searchTerm !== '' || breedFilter !== 'ALL' || genderFilter !== 'ALL' || healthFilter !== 'ALL' || docFilter !== 'ALL';

  const clearAllFilters = () => {
    setSearchTerm('');
    setBreedFilter('ALL');
    setGenderFilter('ALL');
    setHealthFilter('ALL');
    setDocFilter('ALL');
  };

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px 0' }}>
            My Horses
          </h2>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
            View and manage your registered racehorses, passports, microchips, and medical compliance.
          </p>
        </div>
        <Button
          variant="primary"
          style={{ borderRadius: '8px', padding: '10px 18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}
          onClick={() => setIsAddHorseModalOpen(true)}
        >
          <Plus size={18} />
          Add New Horse
        </Button>
      </div>

      {/* Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
        {/* Total Horses */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 17v-1c0-4-3-7-7-7H9l-2-3H3l1 5-2 3v3h10" /><circle cx="8" cy="7" r="1" /></svg>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
              Registered
            </div>
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>{totalCount.toString().padStart(2, '0')}</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>Total Horses</div>
          </div>
        </div>

        {/* Active for Transport */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#2563eb', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#2563eb' }} />
              {inTransitCount} in transit
            </div>
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>{activeCount.toString().padStart(2, '0')}</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>Active for Transport</div>
          </div>
        </div>

        {/* Documents Valid */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
              <ShieldCheck size={20} />
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {compliancePct}% compliant
            </div>
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>{validDocCount.toString().padStart(2, '0')}</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>Documents Valid</div>
          </div>
        </div>

        {/* Documents Expiring / Missing */}
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: expiringDocCount > 0 ? '#fee2e2' : '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: expiringDocCount > 0 ? '#dc2626' : '#94a3b8' }}>
              <AlertTriangle size={20} />
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: expiringDocCount > 0 ? '#dc2626' : '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {expiringDocCount > 0 ? 'Action needed' : 'All up to date'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>{expiringDocCount.toString().padStart(2, '0')}</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>Expiring / Missing Docs</div>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', backgroundColor: '#fff', padding: '12px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
        {/* Search Input */}
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input 
            type="text" 
            placeholder="Search by name, ID, breed, or microchip..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '9px 10px 9px 36px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13.5px', outline: 'none' }}
          />
        </div>
        
        {/* Breed Filter */}
        <select
          value={breedFilter}
          onChange={(e) => setBreedFilter(e.target.value)}
          style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13.5px', color: '#475569', backgroundColor: '#fff', outline: 'none', cursor: 'pointer' }}
        >
          <option value="ALL">All Breeds</option>
          {availableBreeds.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

        {/* Gender Filter */}
        <select
          value={genderFilter}
          onChange={(e) => setGenderFilter(e.target.value)}
          style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13.5px', color: '#475569', backgroundColor: '#fff', outline: 'none', cursor: 'pointer' }}
        >
          <option value="ALL">All Genders</option>
          <option value="Stallion">Stallion</option>
          <option value="Mare">Mare</option>
          <option value="Gelding">Gelding</option>
        </select>

        {/* Health Filter */}
        <select
          value={healthFilter}
          onChange={(e) => setHealthFilter(e.target.value)}
          style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13.5px', color: '#475569', backgroundColor: '#fff', outline: 'none', cursor: 'pointer' }}
        >
          <option value="ALL">All Health</option>
          <option value="Healthy">Healthy</option>
          <option value="Monitoring">Monitoring</option>
          <option value="Medical Attention">Medical Attention</option>
        </select>

        {/* Documents Filter */}
        <select
          value={docFilter}
          onChange={(e) => setDocFilter(e.target.value)}
          style={{ padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13.5px', color: '#475569', backgroundColor: '#fff', outline: 'none', cursor: 'pointer' }}
        >
          <option value="ALL">All Documents</option>
          <option value="Valid">Valid</option>
          <option value="Expiring Soon">Expiring Soon</option>
          <option value="Missing">Missing</option>
        </select>
        
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#dc2626', fontSize: '13px', fontWeight: 600, cursor: 'pointer', padding: '6px 8px' }}
          >
            <X size={14} /> Clear Filters
          </button>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13.5px', color: '#64748b' }}>
        <span>Showing <strong>{filteredHorses.length}</strong> of {horses.length} horses</span>
        {hasActiveFilters && <span style={{ color: '#2563eb', fontWeight: 500 }}>Filters active</span>}
      </div>

      {/* Grid */}
      {filteredHorses.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
          {filteredHorses.map((horse) => {
            const availColor = getStatusColor(horse.availabilityStatus);
            const healthColor = getStatusColor(horse.medicalStatus);
            const docColor = getStatusColor(horse.documentStatus);

            return (
              <div
                key={horse.id}
                style={{
                  backgroundColor: '#fff',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                {/* Image Header */}
                <div style={{ height: '180px', backgroundColor: '#f1f5f9', position: 'relative' }}>
                  {horse.photoUrl ? (
                    <img src={horse.photoUrl} alt={horse.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '42px', fontWeight: 700, backgroundColor: '#f8fafc' }}>
                      ♞
                    </div>
                  )}
                  
                  {/* ID Badge */}
                  <div style={{ position: 'absolute', top: '12px', left: '12px', backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '4px 8px', borderRadius: '6px' }}>
                    {horse.code || horse.id}
                  </div>
                  
                  {/* Availability Badge */}
                  {horse.availabilityStatus && (
                    <div style={{ position: 'absolute', top: '12px', right: '12px', backgroundColor: availColor.bg, color: availColor.text, fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '6px', border: `1px solid ${availColor.bg}` }}>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        title="Edit horse profile"
                        aria-label="Edit horse"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingHorse(horse);
                        }}
                        style={{
                          background: 'none',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          color: '#64748b',
                          cursor: 'pointer',
                          padding: '6px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        title="Delete horse"
                        aria-label="Delete horse"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingHorse(horse);
                        }}
                        style={{
                          background: 'none',
                          border: '1px solid #fecaca',
                          borderRadius: '6px',
                          color: '#dc2626',
                          cursor: 'pointer',
                          padding: '6px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Details Row */}
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '12px', marginBottom: '4px' }}>
                        <Calendar size={13} /> Age / DOB
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                        {horse.age ? `${horse.age} yrs` : 'N/A'} • {horse.dob || 'Recorded'}
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '12px', marginBottom: '4px' }}>
                        <MapPin size={13} /> Location
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {horse.location || 'Ho Chi Minh City'}
                      </div>
                    </div>
                  </div>

                  {/* Status Row */}
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Health Status</div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, backgroundColor: healthColor.bg, color: healthColor.text }}>
                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: healthColor.icon }} />
                        {horse.medicalStatus || 'Healthy'}
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Documents</div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, backgroundColor: docColor.bg, color: docColor.text }}>
                        <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: docColor.icon }} />
                        {horse.documentStatus || 'Valid'}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '8px' }}>
                    <Button 
                      variant="outline" 
                      style={{ flex: 1, borderRadius: '8px', color: '#334155', borderColor: '#cbd5e1', fontWeight: 600, fontSize: '13px' }}
                      onClick={() => router.push(`/customer/horses/${horse.id}`)}
                    >
                      View Details
                    </Button>
                    <Button
                      variant="primary"
                      style={{ borderRadius: '8px', padding: '8px 14px', fontWeight: 600, fontSize: '13px' }}
                      onClick={() => router.push(`/customer/requests/new?horseId=${horse.id}`)}
                    >
                      Ship Horse
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', backgroundColor: '#fff', borderRadius: '16px', border: '1px dashed #cbd5e1', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '28px', marginBottom: '16px' }}>
            ♞
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
            {hasActiveFilters ? 'No horses match your filter criteria' : 'No horses registered yet'}
          </h3>
          <p style={{ fontSize: '14px', color: '#64748b', maxWidth: '400px', margin: '0 0 20px 0', lineHeight: 1.5 }}>
            {hasActiveFilters
              ? 'Try adjusting or clearing your search term and filters to see your registered racehorses.'
              : 'Add your racehorses with their FEI Passport, microchip numbers, and medical records to begin transport booking.'}
          </p>
          {hasActiveFilters ? (
            <Button variant="outline" onClick={clearAllFilters}>
              Clear All Filters
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setIsAddHorseModalOpen(true)}>
              <Plus size={16} /> Add Your First Horse
            </Button>
          )}
        </div>
      )}

      {/* MODALS */}
      <AddHorseModal
        isOpen={isAddHorseModalOpen}
        onClose={() => setIsAddHorseModalOpen(false)}
      />

      {editingHorse && (
        <EditHorseModal
          isOpen={Boolean(editingHorse)}
          onClose={() => setEditingHorse(null)}
          horse={editingHorse}
        />
      )}

      {deletingHorse && (
        <DeleteHorseModal
          isOpen={Boolean(deletingHorse)}
          onClose={() => setDeletingHorse(null)}
          horse={deletingHorse}
        />
      )}
    </div>
  );
}
