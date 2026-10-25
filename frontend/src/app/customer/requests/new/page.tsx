'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronRight,
  MapPin,
  Flag,
  Calendar,
  Plane,
  Plus,
  Check,
  ArrowRight,
  Save,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { useCustomerStore } from '@/lib/customer-store';

function CreateTransportRequestForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedHorseId = searchParams.get('horseId');

  const { horses, createRequest } = useCustomerStore();

  // Step state (1 to 4)
  const [currentStep, setCurrentStep] = useState(1);

  // Form states
  const [title, setTitle] = useState('');
  const [transportType, setTransportType] = useState<'International' | 'Domestic'>('International');
  const [origin, setOrigin] = useState('Ho Chi Minh City, Vietnam');
  const [destination, setDestination] = useState('Singapore Turf Club');
  const [departureDate, setDepartureDate] = useState('2026-10-15');
  const [arrivalDate, setArrivalDate] = useState('2026-10-16');
  const [horseCount, setHorseCount] = useState(1);
  const [specialReqs, setSpecialReqs] = useState('');

  // Selected horses
  const [selectedHorseIds, setSelectedHorseIds] = useState<string[]>(
    preselectedHorseId ? [preselectedHorseId] : [horses[0]?.id || 'hrs-001']
  );

  useEffect(() => {
    if (preselectedHorseId && !selectedHorseIds.includes(preselectedHorseId)) {
      setSelectedHorseIds([preselectedHorseId]);
    }
  }, [preselectedHorseId]);

  // Validation errors
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Get today at midnight for date comparison
  const getTodayMidnight = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const validateStep1 = () => {
    const errs: { [key: string]: string } = {};
    if (!title.trim()) errs.title = 'Request title is required.';
    if (!origin.trim()) errs.origin = 'Origin is required.';
    if (!destination.trim()) errs.destination = 'Destination is required.';
    if (!departureDate) {
      errs.departureDate = 'Departure date is required.';
    } else {
      // Ch?n ch?n ng�y xu?t ph�t trong qu� kh?
      const selected = new Date(departureDate);
      if (selected < getTodayMidnight()) {
        errs.departureDate = 'Departure date cannot be in the past. Please select today or a future date.';
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleContinue = () => {
    if (currentStep === 1) {
      if (!validateStep1()) return;
    }
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = () => {
    const newReq = createRequest({
      title,
      transportType,
      origin,
      destination,
      departureDate,
      arrivalDate,
      horseIds: selectedHorseIds,
      specialReqs,
    });
    router.push(`/customer/requests/${newReq.id}`);
  };

  const handleSaveDraft = () => {
    const newReq = createRequest({
      title: title || 'Draft Transport Request',
      transportType,
      origin,
      destination,
      departureDate,
      arrivalDate,
      horseIds: selectedHorseIds,
      specialReqs,
    });
    router.push('/customer/requests');
  };

  const toggleHorseSelection = (id: string) => {
    if (selectedHorseIds.includes(id)) {
      if (selectedHorseIds.length > 1) {
        setSelectedHorseIds(selectedHorseIds.filter((hId) => hId !== id));
      }
    } else {
      setSelectedHorseIds([...selectedHorseIds, id]);
    }
  };

  const progressPercent = ((currentStep - 1) / 3) * 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '90px' }}>
      {/* Top Breadcrumb */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
          <Link href="/customer" style={{ color: 'var(--text-muted)' }}>
            Dashboard
          </Link>
          <ChevronRight size={12} />
          <Link href="/customer/requests" style={{ color: 'var(--text-muted)' }}>
            Transport Requests
          </Link>
          <ChevronRight size={12} />
          <span style={{ color: 'var(--text-heading)', fontWeight: 600 }}>Create Transport Request</span>
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
          Create Transport Request
        </h2>
      </div>

      {/* PROGRESS INDICATOR */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid var(--border-card)',
          padding: '20px 24px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ maxWidth: '750px', margin: '0 auto', position: 'relative' }}>
          {/* Background Line */}
          <div
            style={{
              position: 'absolute',
              top: '16px',
              left: '40px',
              right: '40px',
              height: '3px',
              backgroundColor: '#f1f5f9',
              zIndex: 0,
            }}
          />
          {/* Active progress Line */}
          <div
            style={{
              position: 'absolute',
              top: '16px',
              left: '40px',
              width: `calc(${progressPercent}% * 0.88)`,
              height: '3px',
              backgroundColor: 'var(--primary)',
              transition: 'width 0.3s ease',
              zIndex: 0,
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
            {[
              { num: 1, label: 'Transport Info' },
              { num: 2, label: 'Select Horse' },
              { num: 3, label: 'Documents' },
              { num: 4, label: 'Review & Submit' },
            ].map((step) => {
              const isPast = step.num < currentStep;
              const isActive = step.num === currentStep;

              return (
                <div key={step.num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      backgroundColor: isPast ? '#16a34a' : isActive ? 'var(--primary)' : '#ffffff',
                      color: isPast || isActive ? '#ffffff' : '#94a3b8',
                      border: isPast || isActive ? '2px solid transparent' : '2px solid #cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '13px',
                      fontWeight: 700,
                      boxShadow: isActive ? '0 0 0 3px rgba(37, 99, 235, 0.2)' : 'none',
                    }}
                  >
                    {isPast ? <Check size={16} strokeWidth={3} /> : `0${step.num}`}
                  </div>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? 'var(--text-heading)' : '#94a3b8',
                    }}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* STEP CONTENT CONTAINER */}
      <div style={{ maxWidth: '850px', width: '100%', margin: '0 auto' }}>
        {/* STEP 1: TRANSPORT INFORMATION */}
        {currentStep === 1 && (
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              border: '1px solid var(--border-card)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', backgroundColor: '#f8fafc' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
                Transport Information
              </h3>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                Please provide the route and schedule details for your request.
              </p>
            </div>

            <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
              {/* Row 1: Title & Type */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                    Request Title <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter request title (e.g. Championship Transport to Singapore)"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: errors.title ? '1px solid #dc2626' : '1px solid #cbd5e1',
                      fontSize: '14px',
                      backgroundColor: '#f8fafc',
                    }}
                  />
                  {errors.title && (
                    <span style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertCircle size={12} /> {errors.title}
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                    Transportation Type <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <select
                    value={transportType}
                    onChange={(e) => setTransportType(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                      backgroundColor: '#f8fafc',
                    }}
                  >
                    <option value="International">International (Cross-Border Flight & Transit)</option>
                    <option value="Domestic">Domestic Transit</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Route */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                    Origin <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <MapPin size={16} color="#94a3b8" style={{ position: 'absolute', top: '13px', left: '12px' }} />
                    <input
                      type="text"
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                      placeholder="Search origin (e.g. Ho Chi Minh City, Vietnam)"
                      style={{
                        width: '100%',
                        padding: '10px 14px 10px 36px',
                        borderRadius: '8px',
                        border: errors.origin ? '1px solid #dc2626' : '1px solid #cbd5e1',
                        fontSize: '14px',
                        backgroundColor: '#f8fafc',
                      }}
                    />
                  </div>
                  {errors.origin && <span style={{ fontSize: '12px', color: '#dc2626' }}>{errors.origin}</span>}
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                    Destination <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Flag size={16} color="#94a3b8" style={{ position: 'absolute', top: '13px', left: '12px' }} />
                    <input
                      type="text"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="Search destination (e.g. Singapore Turf Club)"
                      style={{
                        width: '100%',
                        padding: '10px 14px 10px 36px',
                        borderRadius: '8px',
                        border: errors.destination ? '1px solid #dc2626' : '1px solid #cbd5e1',
                        fontSize: '14px',
                        backgroundColor: '#f8fafc',
                      }}
                    />
                  </div>
                  {errors.destination && <span style={{ fontSize: '12px', color: '#dc2626' }}>{errors.destination}</span>}
                </div>
              </div>

              {/* Inline Route Summary */}
              <div
                style={{
                  backgroundColor: '#eff6ff',
                  border: '1px solid #dbeafe',
                  borderRadius: '10px',
                  padding: '14px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-heading)', fontSize: '14px' }}>{origin || 'Origin'}</span>
                  <div style={{ width: '80px', height: '1px', backgroundColor: '#93c5fd', position: 'relative' }}>
                    <Plane size={14} color="#2563eb" style={{ position: 'absolute', top: '-7px', left: '33px' }} />
                  </div>
                  <span style={{ fontWeight: 700, color: 'var(--text-heading)', fontSize: '14px' }}>{destination || 'Destination'}</span>
                </div>
                <span style={{ fontSize: '12px', color: '#1e40af', fontWeight: 600, backgroundColor: '#ffffff', padding: '4px 10px', borderRadius: '6px' }}>
                  Est. Distance: 1,100 km • Est. Time: 12 hrs
                </span>
              </div>

              {/* Row 3: Dates & Horses */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                    Departure Date <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="date"
                    value={departureDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setDepartureDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: errors.departureDate ? '1px solid #dc2626' : '1px solid #cbd5e1',
                      fontSize: '14px',
                      backgroundColor: '#f8fafc',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                    Expected Arrival
                  </label>
                  <input
                    type="date"
                    value={arrivalDate}
                    onChange={(e) => setArrivalDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                      backgroundColor: '#f8fafc',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                    Number of Horses <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={horseCount}
                    onChange={(e) => setHorseCount(parseInt(e.target.value) || 1)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                      backgroundColor: '#f8fafc',
                      textAlign: 'center',
                    }}
                  />
                </div>
              </div>

              {/* Row 4: Special Requirements */}
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span>Special Requirements</span>
                  <span style={{ color: '#94a3b8', fontWeight: 400 }}>Optional</span>
                </label>
                <textarea
                  rows={3}
                  value={specialReqs}
                  onChange={(e) => setSpecialReqs(e.target.value)}
                  placeholder="Enter any special transportation requirements (e.g. Temperature-controlled vehicle required, specific hydration schedule)..."
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    backgroundColor: '#f8fafc',
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: SELECT HORSE */}
        {currentStep === 2 && (
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              border: '1px solid var(--border-card)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
                  Horse Information
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                  Select one or multiple horses for this transport ({selectedHorseIds.length} selected).
                </p>
              </div>
              <button
                onClick={() => alert('Add new horse form')}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  backgroundColor: '#eff6ff',
                  color: 'var(--primary)',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Plus size={14} /> Add New Horse
              </button>
            </div>

            <div style={{ padding: '24px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-light)', backgroundColor: '#f8fafc' }}>
                    <th style={{ padding: '12px 16px', width: '40px' }} />
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Horse</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Breed</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Age / Gender</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Medical Status</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'right' }}>Profile</th>
                  </tr>
                </thead>
                <tbody>
                  {horses.map((h) => {
                    const isSelected = selectedHorseIds.includes(h.id);
                    return (
                      <tr
                        key={h.id}
                        style={{
                          borderBottom: '1px solid var(--border-light)',
                          backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleHorseSelection(h.id)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '16px', fontWeight: 700, color: 'var(--text-heading)' }}>
                          {h.name}
                        </td>
                        <td style={{ padding: '16px', color: 'var(--text-body)' }}>{h.breed}</td>
                        <td style={{ padding: '16px', color: 'var(--text-body)' }}>
                          {h.age} yrs • {h.gender.includes('Male') ? 'Male' : 'Female'}
                        </td>
                        <td style={{ padding: '16px' }}>
                          <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, backgroundColor: '#dcfce7', color: '#15803d' }}>
                            {h.medicalStatus || 'Healthy'}
                          </span>
                        </td>
                        <td style={{ padding: '16px', textAlign: 'right' }}>
                          <Link href={`/customer/horses/${h.id}`} target="_blank" style={{ fontSize: '12.5px', color: 'var(--primary)', fontWeight: 600 }}>
                            View Profile ↗
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* STEP 3: DOCUMENTS CHECKLIST */}
        {currentStep === 3 && (
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              border: '1px solid var(--border-card)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', backgroundColor: '#f8fafc' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
                Required Documents Checklist
              </h3>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                Upload passports, vaccination certificates, and customs permits for selected horses.
              </p>
            </div>

            <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                { name: 'Horse FEI Passport', required: true, uploaded: true },
                { name: 'Equine Influenza Vaccination Record', required: true, uploaded: true },
                { name: 'Veterinary Export Health Certificate', required: true, uploaded: false },
                { name: 'Import / CITES Clearance Permit', required: false, uploaded: false },
              ].map((doc, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '16px 20px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-card)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: doc.uploaded ? '#f0fdf4' : '#ffffff',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <FileText size={22} color={doc.uploaded ? '#16a34a' : '#64748b'} />
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-heading)', fontSize: '14px' }}>
                        {doc.name} {doc.required && <span style={{ color: '#dc2626' }}>*</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        {doc.uploaded ? 'Verified on file' : 'Pending customer upload'}
                      </div>
                    </div>
                  </div>

                  {doc.uploaded ? (
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Check size={14} /> Ready
                    </span>
                  ) : (
                    <button
                      onClick={() => alert(`Upload dialog for ${doc.name}`)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        color: 'var(--primary)',
                      }}
                    >
                      Browse File
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 4: REVIEW & SUBMIT */}
        {currentStep === 4 && (
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              border: '1px solid var(--border-card)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', backgroundColor: '#f8fafc' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
                Review & Submit Request
              </h3>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                Please review your shipment parameters carefully before submitting to the operations team.
              </p>
            </div>

            <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                <div style={{ backgroundColor: '#f8fafc', padding: '14px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Request Title</span>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-heading)', marginTop: '2px' }}>{title || 'Untitled Request'}</div>
                </div>
                <div style={{ backgroundColor: '#f8fafc', padding: '14px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Route</span>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-heading)', marginTop: '2px' }}>
                    {origin} → {destination}
                  </div>
                </div>
                <div style={{ backgroundColor: '#f8fafc', padding: '14px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Departure Date</span>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-heading)', marginTop: '2px' }}>{departureDate}</div>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-heading)' }}>
                  Selected Horses ({selectedHorseIds.length})
                </span>
                <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                  {horses
                    .filter((h) => selectedHorseIds.includes(h.id))
                    .map((h) => (
                      <span
                        key={h.id}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          backgroundColor: '#eff6ff',
                          color: 'var(--primary)',
                          fontSize: '13px',
                          fontWeight: 600,
                          border: '1px solid #dbeafe',
                        }}
                      >
                        {h.name} ({h.breed})
                      </span>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* STICKY BOTTOM ACTION BAR */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: '260px',
          right: 0,
          backgroundColor: '#ffffff',
          borderTop: '1px solid var(--border-light)',
          padding: '16px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 -4px 12px rgba(15, 23, 42, 0.05)',
          zIndex: 40,
        }}
      >
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => router.push('/customer/requests')}
            style={{
              padding: '9px 18px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              fontSize: '13.5px',
              fontWeight: 600,
              color: '#64748b',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSaveDraft}
            style={{
              padding: '9px 18px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#f8fafc',
              fontSize: '13.5px',
              fontWeight: 600,
              color: 'var(--text-body)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Save size={15} /> Save as Draft
          </button>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          {currentStep > 1 && (
            <button
              onClick={handleBack}
              style={{
                padding: '9px 20px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                fontSize: '13.5px',
                fontWeight: 600,
                color: 'var(--text-body)',
              }}
            >
              Back
            </button>
          )}

          {currentStep < 4 ? (
            <button
              onClick={handleContinue}
              style={{
                padding: '9px 24px',
                borderRadius: '8px',
                backgroundColor: 'var(--primary)',
                color: '#ffffff',
                fontSize: '13.5px',
                fontWeight: 600,
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
              }}
            >
              Continue <ArrowRight size={15} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              style={{
                padding: '9px 26px',
                borderRadius: '8px',
                backgroundColor: '#16a34a',
                color: '#ffffff',
                fontSize: '13.5px',
                fontWeight: 600,
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(22, 163, 74, 0.3)',
              }}
            >
              Submit Request <Check size={16} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CreateTransportRequestPage() {
  return (
    <React.Suspense fallback={<div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>Loading transport wizard...</div>}>
      <CreateTransportRequestForm />
    </React.Suspense>
  );
}
