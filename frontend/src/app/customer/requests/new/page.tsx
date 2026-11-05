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
  AlertCircle,
  Loader2,
  Truck,
  Navigation,
} from 'lucide-react';
import { useCustomerStore } from '@/lib/customer-store';
import { Horse } from '@/lib/types';
import { AddHorseModal } from '@/components/horses/AddHorseModal';
import { apiClient } from '@/lib/api-client';
import { getCurrentUser } from '@/lib/auth';
import dynamic from 'next/dynamic';

const RoutePlanningMap = dynamic(
  () => import('@/components/maps/RoutePlanningMap'),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: '360px',
          backgroundColor: '#f1f5f9',
          borderRadius: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#64748b',
          fontSize: '13px',
          fontWeight: 600,
        }}
      >
        Đang tải bản đồ lộ trình & cửa khẩu...
      </div>
    ),
  }
);
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const getTodayString = () => new Date().toISOString().split('T')[0];
const getTomorrowString = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};

const formSchema = z
  .object({
    title: z.string().min(1, 'Request title is required'),
    transportType: z.enum(['International', 'Domestic']),
    origin: z.string().min(1, 'Origin is required'),
    destination: z.string().min(1, 'Destination is required'),
    departureDate: z
      .string()
      .min(1, 'Departure date is required')
      .refine((val) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dep = new Date(val);
        dep.setHours(0, 0, 0, 0);
        return dep >= today;
      }, 'Ngày khởi hành không được chọn ngày trong quá khứ'),
    arrivalDate: z.string().optional(),
    horseCount: z.coerce.number().min(1),
    specialReqs: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.arrivalDate && data.departureDate) {
        const dep = new Date(data.departureDate);
        const arr = new Date(data.arrivalDate);
        dep.setHours(0, 0, 0, 0);
        arr.setHours(0, 0, 0, 0);
        return arr >= dep;
      }
      return true;
    },
    {
      message: 'Ngày đến dự kiến phải từ ngày khởi hành trở đi',
      path: ['arrivalDate'],
    }
  );
type FormData = z.infer<typeof formSchema>;

function CreateTransportRequestForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedHorseId = searchParams.get('horseId');

  const { horses, refreshHorses } = useCustomerStore();

  // Step state (1 to 3)
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddHorseModalOpen, setIsAddHorseModalOpen] = useState(false);

  const todayStr = getTodayString();
  const tomorrowStr = getTomorrowString();

  // Form states using react-hook-form
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      transportType: 'International',
      origin: 'Ho Chi Minh City, Vietnam',
      destination: 'Singapore Turf Club',
      departureDate: todayStr,
      arrivalDate: tomorrowStr,
      horseCount: 1,
      specialReqs: '',
    },
  });

  const formValues = watch();

  // Route calculation and corridor metrics from Leaflet map
  const [routeData, setRouteData] = useState<{ distanceKm: number; durationHours: number; mode: 'air' | 'road' } | null>(null);

  // Horse quantities mapping: horseId -> quantity
  const [horseQuantities, setHorseQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    refreshHorses();
  }, [currentStep, refreshHorses]);

  useEffect(() => {
    if (preselectedHorseId) {
      const target = horses.find((item) => item.id === preselectedHorseId);
      if (target && (target.status === 'active' || target.availabilityStatus === 'Available')) {
        setHorseQuantities({ [preselectedHorseId]: 1 });
      }
    } else if (horses.length > 0 && Object.keys(horseQuantities).length === 0) {
      const firstAvailable = horses.find(
        (h) => h.status === 'active' || h.availabilityStatus === 'Available'
      );
      if (firstAvailable) {
        setHorseQuantities({ [firstAvailable.id]: 1 });
      }
    }
  }, [preselectedHorseId, horses]);

  const selectedHorseIds = Object.keys(horseQuantities).filter((id) => (horseQuantities[id] || 0) > 0);
  const totalSelectedHorses = Object.values(horseQuantities).reduce((sum, q) => sum + (q || 0), 0);

  useEffect(() => {
    setValue('horseCount', Math.max(1, totalSelectedHorses));
  }, [totalSelectedHorses, setValue]);

  const selectedHorses = horses
    .filter((h) => (horseQuantities[h.id] || 0) > 0)
    .map((h) => ({
      ...h,
      quantity: horseQuantities[h.id] || 1,
    }));

  const breedBreakdown = selectedHorses.reduce((acc, h) => {
    const breed = h.breed || 'Other Breed';
    acc[breed] = (acc[breed] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const toggleHorseSelection = (id: string) => {
    const target = horses.find((h) => h.id === id);
    if (!target) return;
    const isUnavailable =
      target.status === 'in_transit' ||
      target.availabilityStatus === 'In Transit' ||
      target.status === 'delivered' ||
      target.availabilityStatus === 'Delivered' ||
      target.status === 'retired';
    if (isUnavailable) return;

    setHorseQuantities((prev) => {
      const next = { ...prev };
      if ((next[id] || 0) > 0) {
        delete next[id];
      } else {
        next[id] = 1;
      }
      return next;
    });
  };

  const handleContinue = async () => {
    if (currentStep === 1) {
      const isValid = await trigger(['title', 'origin', 'destination', 'departureDate']);
      if (!isValid) return;
    }
    if (currentStep === 2) {
      if (totalSelectedHorses === 0) {
        alert('Vui lòng chọn ít nhất một con ngựa sẵn sàng vận chuyển.');
        return;
      }
      const invalidSelected = selectedHorses.find(
        (h) =>
          h.status === 'in_transit' ||
          h.availabilityStatus === 'In Transit' ||
          h.status === 'delivered' ||
          h.availabilityStatus === 'Delivered' ||
          (Boolean(h.status) && h.status !== 'active')
      );
      if (invalidSelected) {
        alert(`Ngựa "${invalidSelected.name}" đang vận chuyển hoặc đã bàn giao, không thể chọn.`);
        return;
      }
    }
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmitForm = async (data: FormData) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const selectedHorsesData: Array<{
        horseId?: number;
        name: string;
        breed?: string;
        gender?: 'male' | 'female' | 'gelding';
        age?: number;
        quantity: number;
      }> = [];

      for (const h of selectedHorses) {
        const qty = h.quantity || 1;
        const numericHorseId = h.backendId || (Number(h.id) > 0 ? Number(h.id) : undefined);
        selectedHorsesData.push({
          horseId: numericHorseId,
          name: h.name,
          breed: h.breed,
          gender: h.gender === 'Stallion' ? 'male' : h.gender === 'Mare' ? 'female' : 'gelding',
          age: h.age,
          quantity: qty,
        });
      }

      const currentUser = getCurrentUser();
      const routeNote = routeData
        ? `[Lộ trình: ${routeData.mode === 'air' ? 'Đường Hàng Không' : 'Đường Bộ Liên Vận'}, ${routeData.distanceKm} km, ~${routeData.durationHours}h]`
        : '';
      const typeNote = `[Hình thức: ${data.transportType === 'International' ? 'Quốc tế (International)' : 'Nội địa (Domestic)'}]`;
      const titleNote = data.title ? `[Tiêu đề: ${data.title.trim()}]` : '';
      const combinedReqs = [titleNote, typeNote, data.specialReqs, routeNote].filter(Boolean).join(' | ');

      const payload = {
        contactName: currentUser.fullName || currentUser.name || 'Current Customer',
        contactPhone: currentUser.phone || '0901234567',
        contactEmail: currentUser.email || 'customer@example.com',
        requestedHorseCount: totalSelectedHorses || (data.horseCount ? Number(data.horseCount) : 1),
        originLocation: data.origin,
        destinationLocation: data.destination,
        requestedDate: new Date(data.departureDate).toISOString(),
        transportationType: data.transportType,
        transportType: data.transportType,
        specialRequirements: combinedReqs || undefined,
        horses: selectedHorsesData.length > 0 ? selectedHorsesData : undefined,
        // Fallback for single horse if array is not preferred by backend yet
        horseName: selectedHorsesData[0]?.name,
        horseBreed: selectedHorsesData[0]?.breed,
        horseGender: selectedHorsesData[0]?.gender,
        horseAge: selectedHorsesData[0]?.age,
      };

      const newReq = await apiClient<any>('/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Refresh horse stock in store
      try {
        await refreshHorses();
      } catch {}

      router.push(`/customer/requests/${newReq.id}`);
    } catch (error) {
      console.error('Failed to create request:', error);
      alert('Failed to submit request. Please try again.');
      setIsSubmitting(false);
    }
  };

  const progressPercent = ((currentStep - 1) / 2) * 100;

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
              { num: 1, label: 'Thông tin lộ trình' },
              { num: 2, label: 'Chọn ngựa vận chuyển' },
              { num: 3, label: 'Rà soát & Gửi đơn' },
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
                    {...register('title')}
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
                      <AlertCircle size={12} /> {errors.title.message}
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                    Transportation Type <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <select
                    {...register('transportType')}
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
                      {...register('origin')}
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
                  {errors.origin && <span style={{ fontSize: '12px', color: '#dc2626' }}>{errors.origin.message}</span>}
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                    Destination <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Flag size={16} color="#94a3b8" style={{ position: 'absolute', top: '13px', left: '12px' }} />
                    <input
                      type="text"
                      {...register('destination')}
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
                  {errors.destination && <span style={{ fontSize: '12px', color: '#dc2626' }}>{errors.destination.message}</span>}
                </div>
              </div>

              {/* Interactive Route & Border Checkpoints Map */}
              <RoutePlanningMap
                originText={formValues.origin}
                destinationText={formValues.destination}
                transportType={formValues.transportType}
                onRouteCalculated={setRouteData}
                onApplyPreset={(preset) => {
                  setValue('origin', preset.origin, { shouldValidate: true });
                  setValue('destination', preset.destination, { shouldValidate: true });
                  setValue('transportType', preset.type, { shouldValidate: true });
                }}
              />

              {/* Row 3: Dates */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                    Departure Date <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="date"
                    min={todayStr}
                    {...register('departureDate', {
                      onChange: (e) => {
                        const newDep = e.target.value;
                        if (formValues.arrivalDate && formValues.arrivalDate < newDep) {
                          setValue('arrivalDate', newDep, { shouldValidate: true });
                        }
                      },
                    })}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: errors.departureDate ? '1px solid #dc2626' : '1px solid #cbd5e1',
                      fontSize: '14px',
                      backgroundColor: '#f8fafc',
                    }}
                  />
                  {errors.departureDate && (
                    <span style={{ fontSize: '12px', color: '#dc2626', display: 'block', marginTop: '4px' }}>
                      {errors.departureDate.message}
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                    Expected Arrival
                  </label>
                  <input
                    type="date"
                    min={formValues.departureDate || todayStr}
                    {...register('arrivalDate')}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: errors.arrivalDate ? '1px solid #dc2626' : '1px solid #cbd5e1',
                      fontSize: '14px',
                      backgroundColor: '#f8fafc',
                    }}
                  />
                  {errors.arrivalDate && (
                    <span style={{ fontSize: '12px', color: '#dc2626', display: 'block', marginTop: '4px' }}>
                      {errors.arrivalDate.message}
                    </span>
                  )}
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
                  {...register('specialReqs')}
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
                  Tích chọn các con ngựa cần vận chuyển từ đàn của bạn (Đã chọn: {totalSelectedHorses} con).
                </p>
                {selectedHorses.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-heading)' }}>
                      Breed Breakdown:
                    </span>
                    {Object.entries(breedBreakdown).map(([breed, count]) => (
                      <span
                        key={breed}
                        style={{
                          fontSize: '11.5px',
                          padding: '3px 10px',
                          borderRadius: '20px',
                          backgroundColor: '#e0f2fe',
                          color: '#0284c7',
                          fontWeight: 600,
                          border: '1px solid #bae6fd',
                        }}
                      >
                        {breed}: <strong>{count}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setIsAddHorseModalOpen(true)}
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
                  cursor: 'pointer',
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
                    const isInTransit = h.status === 'in_transit' || h.availabilityStatus === 'In Transit';
                    const isDelivered = h.status === 'delivered' || h.availabilityStatus === 'Delivered';
                    const isRetired = h.status === 'retired' || h.status === 'deceased';
                    const isUnavailable = isInTransit || isDelivered || isRetired;
                    const isSelected = (horseQuantities[h.id] || 0) > 0;
                    return (
                      <tr
                        key={h.id}
                        style={{
                          borderBottom: '1px solid var(--border-light)',
                          backgroundColor: isSelected ? '#eff6ff' : isUnavailable ? '#f8fafc' : 'transparent',
                          opacity: isUnavailable ? 0.7 : 1,
                        }}
                      >
                        <td style={{ padding: '16px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isUnavailable}
                            onChange={() => !isUnavailable && toggleHorseSelection(h.id)}
                            style={{ width: '16px', height: '16px', cursor: isUnavailable ? 'not-allowed' : 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '16px', fontWeight: 700, color: 'var(--text-heading)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                overflow: 'hidden',
                                backgroundColor: '#eff6ff',
                                border: '1px solid #e2e8f0',
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {h.photoUrl ? (
                                <img src={h.photoUrl} alt={h.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <span style={{ fontSize: '14px', fontWeight: 700, color: '#2563eb' }}>{h.name.charAt(0)}</span>
                              )}
                            </div>
                            <div>
                              <div>{h.name}</div>
                              {isInTransit ? (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '3px', padding: '2px 7px', borderRadius: '4px', backgroundColor: '#e0e7ff', color: '#4338ca', fontSize: '11px', fontWeight: 700 }}>
                                  <Truck size={12} /> Đang vận chuyển
                                </div>
                              ) : isDelivered ? (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '3px', padding: '2px 7px', borderRadius: '4px', backgroundColor: '#ecfdf5', color: '#047857', fontSize: '11px', fontWeight: 700 }}>
                                  <Check size={12} /> Đã hoàn tất vận chuyển (Không thể chọn lại)
                                </div>
                              ) : (
                                <div style={{ fontSize: '11px', fontWeight: 600, color: '#16a34a', marginTop: '2px' }}>
                                  ● Sẵn sàng vận chuyển
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '16px', color: 'var(--text-body)' }}>{h.breed}</td>
                        <td style={{ padding: '16px', color: 'var(--text-body)' }}>
                          {h.age} yrs •{' '}
                          {h.gender === 'Mare' || String(h.gender).toLowerCase() === 'female'
                            ? 'Female (Mare)'
                            : h.gender === 'Gelding' || String(h.gender).toLowerCase() === 'gelding'
                            ? 'Gelding'
                            : 'Male (Stallion)'}
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

        {/* STEP 3: REVIEW & SUBMIT */}
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
                  <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-heading)', marginTop: '2px' }}>{formValues.title || 'Untitled Request'}</div>
                </div>
                <div style={{ backgroundColor: '#f8fafc', padding: '14px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Route</span>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-heading)', marginTop: '2px' }}>
                    {formValues.origin} → {formValues.destination}
                  </div>
                </div>
                <div style={{ backgroundColor: '#f8fafc', padding: '14px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Departure Date</span>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-heading)', marginTop: '2px' }}>{formValues.departureDate}</div>
                </div>
              </div>

              {/* Route & Customs Logistics Summary */}
              {routeData && (
                <div
                  style={{
                    backgroundColor: '#eff6ff',
                    padding: '16px 20px',
                    borderRadius: '12px',
                    border: '1px solid #dbeafe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        backgroundColor: '#dbeafe',
                        color: '#1d4ed8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Navigation size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e40af' }}>
                        Lộ trình: {routeData.mode === 'air' ? 'Đường Hàng Không (Air Freight Corridor)' : 'Đường Bộ Liên Vận (Overland Road)'}
                      </div>
                      <div style={{ fontSize: '12.5px', color: '#475569' }}>
                        Quãng đường: <strong style={{ color: '#0f172a' }}>{routeData.distanceKm.toLocaleString()} km</strong> • Thời gian ước tính: <strong style={{ color: '#0f172a' }}>~{routeData.durationHours} giờ</strong>
                      </div>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: '20px',
                      backgroundColor: '#dcfce7',
                      color: '#15803d',
                      border: '1px solid #bbf7d0',
                    }}
                  >
                    ✓ Đã tối ưu kiểm dịch & trạm thú y
                  </span>
                </div>
              )}

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-heading)' }}>
                    Selected Horses ({totalSelectedHorses} horses)
                  </span>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {Object.entries(breedBreakdown).map(([breed, count]) => (
                      <span
                        key={breed}
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          backgroundColor: '#e0f2fe',
                          color: '#0284c7',
                          fontWeight: 600,
                          border: '1px solid #bae6fd',
                        }}
                      >
                        {breed}: {count}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                  {selectedHorses.map((h) => (
                    <span
                      key={h.id}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
                        backgroundColor: '#eff6ff',
                        color: 'var(--primary)',
                        fontSize: '13px',
                        fontWeight: 600,
                        border: '1px solid #dbeafe',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <span>{h.name}</span>
                      <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 500 }}>• {h.breed}</span>
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

          {currentStep < 3 ? (
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
              onClick={handleSubmit(onSubmitForm)}
              disabled={isSubmitting}
              style={{
                padding: '9px 26px',
                borderRadius: '8px',
                backgroundColor: isSubmitting ? '#94a3b8' : '#16a34a',
                color: '#ffffff',
                fontSize: '13.5px',
                fontWeight: 600,
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: isSubmitting ? 'none' : '0 2px 8px rgba(22, 163, 74, 0.3)',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? (
                <>
                  Submitting... <Loader2 size={16} className="animate-spin" />
                </>
              ) : (
                <>
                  Submit Request <Check size={16} strokeWidth={2.5} />
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <AddHorseModal
        isOpen={isAddHorseModalOpen}
        onClose={() => setIsAddHorseModalOpen(false)}
        onHorseAdded={(newHorse) => {
          setHorseQuantities((prev) => ({ ...prev, [newHorse.id]: 1 }));
        }}
      />
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
