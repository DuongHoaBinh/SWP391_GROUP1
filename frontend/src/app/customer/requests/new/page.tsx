'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Clock,
} from 'lucide-react';
import { useCustomerStore, getFullPhotoUrl } from '@/lib/customer-store';
const HORSE_PLACEHOLDER_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' rx='40' fill='%23F0EEE8'/%3E%3Ctext x='40' y='47' text-anchor='middle' font-family='serif' font-weight='700' font-size='22' fill='%23A67C2E'%3EEQ%3C/text%3E%3C/svg%3E";
import { Horse } from '@/lib/types';
import { AddHorseModal } from '@/components/horses/AddHorseModal';
import { apiClient } from '@/lib/api-client';
import { getCurrentUser } from '@/lib/auth';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import useSWR from 'swr';
import { InsuranceSelection } from '@/features/orders/components/InsuranceSelection';
import { CostSummary } from '@/features/orders/components/InsuranceSummary';
import { BookingChoice } from '@/features/orders/components/BookingChoice';
import { BookingSummary } from '@/features/orders/components/BookingSummary';
import { type BookingType } from '@/features/orders/booking-policy';
import { defaultInsurance, insuranceNames, previewInsurance, vnd, type InsuranceInput, type InsurancePolicy } from '@/features/orders/insurance-policy';

const MapLoadingFallback = () => {
  const { language } = useLanguage();
  return (
    <div
      style={{
        height: '360px',
        backgroundColor: '#F0EEE8',
        borderRadius: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#64748b',
        fontSize: '13px',
        fontWeight: 600,
      }}
    >
      {language === 'en' ? 'Loading route map & checkpoints...' : 'Đang tải bản đồ lộ trình & cửa khẩu...'}
    </div>
  );
};
const RoutePlanningMap = dynamic(
  () => import('@/components/maps/RoutePlanningMap'),
  {
    ssr: false,
    loading: () => <MapLoadingFallback />,
  }
);
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const getDateOffsetString = (days: number) => {
  const now = new Date();
  const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + days * 86_400_000;
  return new Date(utc).toISOString().split('T')[0];
};
const getTodayString = () => getDateOffsetString(0);

const parseLocalDate = (val: string) => {
  const parts = val.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return new Date(val);
  return new Date(parts[0], parts[1] - 1, parts[2]);
};

const getFormSchema = (lang: string) =>
  z
    .object({
      title: z.string().min(1, lang === 'en' ? 'Request title is required' : 'Vui lòng nhập tiêu đề yêu cầu'),
      transportType: z.enum(['International', 'Domestic']),
      origin: z.string().min(1, lang === 'en' ? 'Origin is required' : 'Vui lòng chọn điểm khởi hành'),
      destination: z.string().min(1, lang === 'en' ? 'Destination is required' : 'Vui lòng chọn điểm đến'),
      departureDate: z
        .string()
        .min(1, lang === 'en' ? 'Departure date is required' : 'Vui lòng chọn ngày khởi hành')
        .refine((val) => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const dep = parseLocalDate(val);
          dep.setHours(0, 0, 0, 0);
          return dep >= today;
        }, lang === 'en' ? 'Departure date cannot be in the past' : 'Ngày khởi hành không được chọn ngày trong quá khứ'),
      arrivalDate: z.string().optional(),
      horseCount: z.coerce.number().min(1),
      specialReqs: z.string().optional(),
    })
    .refine(
      (data) => {
        if (data.arrivalDate && data.departureDate) {
          const dep = parseLocalDate(data.departureDate);
          const arr = parseLocalDate(data.arrivalDate);
          dep.setHours(0, 0, 0, 0);
          arr.setHours(0, 0, 0, 0);
          return arr >= dep;
        }
        return true;
      },
      {
        message: lang === 'en' ? 'Estimated arrival date must be on or after departure date' : 'Ngày đến dự kiến phải từ ngày khởi hành trở đi',
        path: ['arrivalDate'],
      }
    );

type FormData = z.infer<ReturnType<typeof getFormSchema>>;

function CreateTransportRequestForm() {
  const router = useRouter();
  const { t, language, translateBreed, translateGender, translateCountry } = useLanguage();
  const searchParams = useSearchParams();
  const preselectedHorseId = searchParams.get('horseId');

  const { horses, requests, refreshHorses } = useCustomerStore();

  useEffect(() => {
    refreshHorses();
  }, []);

  // Helper to find any active (in-progress) transport order for this horse
  const getHorseActiveOrder = (horse: Horse) => {
    return requests.find((r) => {
      const match =
        String(r.horseId) === String(horse.id) ||
        String(r.horse?.id) === String(horse.id) ||
        (horse.backendId && String(r.horseId) === String(horse.backendId)) ||
        (r.horses && r.horses.some((h: any) => String(h.horse?.id) === String(horse.id) || String(h.id) === String(horse.id))) ||
        (r.horse?.name && horse.name && r.horse.name.toLowerCase().trim() === horse.name.toLowerCase().trim());

      const isFinished = r.status === 'COMPLETED' || r.status === 'CANCELLED' || r.status === 'REJECTED';
      return match && !isFinished;
    });
  };

  // Step state (1 to 3)
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddHorseModalOpen, setIsAddHorseModalOpen] = useState(false);

  const todayStr = getTodayString();
  const defaultDepartureStr = getDateOffsetString(18);
  const defaultArrivalStr = getDateOffsetString(19);

  // Form states using react-hook-form
  const currentFormSchema = useMemo(() => getFormSchema(language), [language]);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(currentFormSchema),
    defaultValues: {
      title: '',
      transportType: 'International',
      origin: 'Ho Chi Minh City, Vietnam',
      destination: 'Singapore Turf Club',
      departureDate: defaultDepartureStr,
      arrivalDate: defaultArrivalStr,
      horseCount: 1,
      specialReqs: '',
    },
  });

  const formValues = watch();

  // Route calculation and corridor metrics from Leaflet map
  const [routeData, setRouteData] = useState<{ distanceKm: number; durationHours: number; mode: 'air' | 'road' } | null>(null);

  // Horse quantities mapping: horseId -> quantity
  const [horseQuantities, setHorseQuantities] = useState<Record<string, number>>({});
  const [bookingType, setBookingType] = useState<BookingType>('shared_stall');
  const [insuranceValues, setInsuranceValues] = useState<Record<string, InsuranceInput>>({});
  const [insuranceError, setInsuranceError] = useState('');
  const { data: policy, error: policyError, mutate: reloadPolicy } = useSWR<InsurancePolicy>('/orders/insurance-policy', url => apiClient<InsurancePolicy>(url), { shouldRetryOnError: false });

  const cutoffQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (formValues.destination) params.set('destinationLocation', formValues.destination);
    if (formValues.origin) params.set('originLocation', formValues.origin);
    if (bookingType) params.set('bookingType', bookingType);
    if (formValues.transportType) params.set('transportationType', formValues.transportType);
    return `/orders/cutoff-policy?${params.toString()}`;
  }, [formValues.destination, formValues.origin, bookingType, formValues.transportType]);

  const { data: cutoffPolicy } = useSWR<{
    minLeadDays: number;
    baseCutoffDays: number;
    maxTierALead: number;
    isInternational: boolean;
    destinationCountry: string;
    earliestDepartureDate: string;
  }>(cutoffQuery, (url) => apiClient(url), { shouldRetryOnError: false });

  const minLeadDays = cutoffPolicy?.minLeadDays ?? (bookingType === 'dedicated_charter' ? 4 : 7);
  const earliestDepartureDate = cutoffPolicy?.earliestDepartureDate ?? getDateOffsetString(minLeadDays);

  const refreshedStep = useRef<number | null>(null);
  const initializedSelection = useRef<string | null>(null);
  useEffect(() => {
    if (refreshedStep.current === currentStep) return;
    refreshedStep.current = currentStep;
    void refreshHorses();
  }, [currentStep, refreshHorses]);

  useEffect(() => {
    const selectionKey = preselectedHorseId ?? 'default';
    if (initializedSelection.current === selectionKey) return;
    if (preselectedHorseId) {
      const target = horses.find((item) => String(item.id) === String(preselectedHorseId));
      if (target) {
        const order = getHorseActiveOrder(target);
        const unavailable =
          Boolean(order) ||
          target.status === 'in_transit' ||
          target.availabilityStatus === 'In Transit' ||
          target.status === 'retired' ||
          target.status === 'deceased';
        if (!unavailable) {
          setHorseQuantities({ [preselectedHorseId]: 1 });
          initializedSelection.current = selectionKey;
        } else {
          toast.error(
            order
              ? (language === 'en' ? `Horse "${target.name}" is already assigned to shipment ${order.requestCode}.` : `Chiến mã "${target.name}" đã được phân bổ trong đơn ${order.requestCode}.`)
              : (language === 'en' ? `Horse "${target.name}" is not ready for transit.` : `Chiến mã "${target.name}" hiện không sẵn sàng vận chuyển.`)
          );
          initializedSelection.current = selectionKey;
        }      }
    } else if (horses.length > 0 && Object.keys(horseQuantities).length === 0) {
      const firstAvailable = horses.find((h) => {
        const order = getHorseActiveOrder(h);
        return (
          !order &&
          h.status !== 'in_transit' &&
          h.availabilityStatus !== 'In Transit' &&
          h.status !== 'retired' &&
          h.status !== 'deceased' &&
          (h.status === 'active' || h.availabilityStatus === 'Available')
        );
      });
      if (firstAvailable) {
        setHorseQuantities({ [firstAvailable.id]: 1 });
        initializedSelection.current = selectionKey;
      }
    }
  }, [preselectedHorseId, horses, requests]);

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

  const estimatedInsuranceFee = selectedHorses.reduce((sum, h) => sum + previewInsurance(insuranceValues[h.id] ?? defaultInsurance, policy ?? null).fee * h.quantity, 0);
  const validateInsurance = () => {
    const invalid = selectedHorses.map(h => ({ name: h.name, ...previewInsurance(insuranceValues[h.id] ?? defaultInsurance, policy ?? null) })).find(p => p.error);
    const message = invalid
      ? `${invalid.name}: ${invalid.error}`
      : estimatedInsuranceFee > 9999999999999
      ? (language === 'en' ? 'Total insurance fee exceeds order limit.' : 'Tổng phí bảo hiểm vượt giới hạn đơn hàng.')
      : '';
    setInsuranceError(message);
    return !message;
  };

  const breedBreakdown = selectedHorses.reduce<Record<string, number>>((acc, h) => {
    const breed = h.breed || 'Other Breed';
    acc[breed] = (acc[breed] || 0) + h.quantity;
    return acc;
  }, {} as Record<string, number>);

  const toggleHorseSelection = (id: string) => {
    const target = horses.find((h) => String(h.id) === String(id));
    if (!target) return;
    const activeOrder = getHorseActiveOrder(target);
    const isInTransit =
      (target.availabilityStatus || '').toLowerCase().includes('transit') ||
      activeOrder?.status === 'IN_TRANSIT' ||
      activeOrder?.status === 'in_transit';
    const isScheduled = !isInTransit && Boolean(activeOrder);
    const isRetired = target.status === 'retired' || target.status === 'deceased';
    const isUnavailable = isInTransit || isScheduled || isRetired;

    if (isUnavailable) {
      if (isInTransit) {
        toast.error(language === 'en' ? `Horse "${target.name}" is en route (${activeOrder?.requestCode || 'in transit'}), cannot select.` : `Chiến mã "${target.name}" đang trên hành trình (${activeOrder?.requestCode || 'đang vận chuyển'}), không thể chọn.`);
      } else if (isScheduled) {
        toast.error(language === 'en' ? `Horse "${target.name}" is already scheduled in order ${activeOrder?.requestCode}, cannot select.` : `Chiến mã "${target.name}" đã được lên lịch trong đơn ${activeOrder?.requestCode}, không thể chọn.`);
      } else {
        toast.error(language === 'en' ? `Horse "${target.name}" is currently not available for transport.` : `Chiến mã "${target.name}" hiện không sẵn sàng vận chuyển.`);
      }
      return;
    }

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

  const isDepartureBeforeCutoff = (depDate?: string) =>
    Boolean(depDate && earliestDepartureDate && depDate < earliestDepartureDate);

  const cutoffViolationMessage = () =>
    language === 'en'
      ? `Order Cutoff: route requires booking at least ${minLeadDays} day(s) ahead (earliest departure: ${earliestDepartureDate}).`
      : `Sát hạn đặt đơn (Order Cutoff): tuyến này yêu cầu đặt trước tối thiểu ${minLeadDays} ngày (ngày khởi hành sớm nhất: ${earliestDepartureDate}).`;

  const handleContinue = async () => {
    if (currentStep === 1) {
      const isValid = await trigger(['title', 'origin', 'destination', 'departureDate', 'arrivalDate']);
      if (!isValid) return;
      if (isDepartureBeforeCutoff(formValues.departureDate)) {
        toast.error(cutoffViolationMessage());
        return;
      }
    }
    if (currentStep === 2) {
      if (!validateInsurance()) return;
      if (totalSelectedHorses === 0) {
        toast.error(language === 'en' ? 'Please select at least one horse available for transit.' : 'Vui lòng chọn ít nhất một con ngựa sẵn sàng vận chuyển.');
        return;
      }
      const invalidSelected = selectedHorses.find((h) => {
        const activeOrder = getHorseActiveOrder(h);
        return (
          Boolean(activeOrder) ||
          (h.availabilityStatus || '').toLowerCase().includes('transit') ||
          h.status === 'in_transit' ||
          h.status === 'retired' ||
          (Boolean(h.status) && h.status !== 'active')
        );
      });
      if (invalidSelected) {
        const activeOrder = getHorseActiveOrder(invalidSelected);
        toast.error(
          activeOrder
            ? (language === 'en' ? `Horse "${invalidSelected.name}" is in order ${activeOrder.requestCode}, cannot create new request.` : `Chiến mã "${invalidSelected.name}" đang trong đơn ${activeOrder.requestCode}, không thể tạo đơn mới.`)
            : (language === 'en' ? `Horse "${invalidSelected.name}" is not available for transit.` : `Chiến mã "${invalidSelected.name}" không khả dụng để vận chuyển.`)
        );
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
    if (isSubmitting || !validateInsurance()) return;
    if (isDepartureBeforeCutoff(data.departureDate)) {
      toast.error(cutoffViolationMessage());
      return;
    }
    setIsSubmitting(true);
    try {
      const selectedHorsesData: Array<{
        horseId?: number;
        name: string;
        breed?: string;
        gender?: 'male' | 'female' | 'gelding';
        age?: number;
        quantity: number; declaredValue: number; declaredCurrency: 'VND' | 'USD'; insurancePackage: 'basic' | 'standard' | 'premium';
      }> = [];

      for (const h of selectedHorses) {
        const qty = h.quantity || 1;
        const numericHorseId = h.backendId || (Number(h.id) > 0 ? Number(h.id) : undefined);
        const g = String(h.gender || '').toLowerCase();
        const normalizedGender: 'male' | 'female' | 'gelding' =
          g.includes('male') || g.includes('stallion')
            ? 'male'
            : g.includes('female') || g.includes('mare')
            ? 'female'
            : 'gelding';
        selectedHorsesData.push({
          horseId: numericHorseId,
          name: h.name,
          breed: h.breed,
          gender: normalizedGender,
          age: h.age,
          quantity: qty,
          declaredValue: Number((insuranceValues[h.id] ?? defaultInsurance).declaredValue || 0),
          declaredCurrency: (insuranceValues[h.id] ?? defaultInsurance).declaredCurrency,
          insurancePackage: (insuranceValues[h.id] ?? defaultInsurance).insurancePackage,
        });
      }

      const currentUser = getCurrentUser();
      const routeNote = routeData
        ? `[Lộ trình: ${routeData.mode === 'air' ? 'Đường Hàng Không' : 'Đường Bộ Liên Vận'}, ${routeData.distanceKm} km, ~${routeData.durationHours}h]`
        : '';
      const typeNote = `[Hình thức: ${data.transportType === 'International' ? 'Quốc tế' : 'Nội địa'}]`;
      const titleNote = data.title ? `[Tiêu đề: ${data.title.trim()}]` : '';
      const combinedReqs = [titleNote, typeNote, data.specialReqs, routeNote].filter(Boolean).join(' | ');

      const payload = {
        bookingType,
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

      toast.success(t('requests.createSuccess', 'Yêu cầu vận chuyển đã được tạo thành công!'));
      router.push(`/customer/requests/${newReq.id}`);
    } catch (error: any) {
      console.error('Failed to create request:', error);
      toast.error(error?.message || t('requests.createFailed', 'Gửi yêu cầu vận chuyển thất bại. Vui lòng thử lại.'));
      setIsSubmitting(false);
    }
  };

  const progressPercent = ((currentStep - 1) / 2) * 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Breadcrumb */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
          <Link href="/customer" style={{ color: 'var(--text-muted)' }}>
            {language === 'en' ? 'Dashboard' : 'Bảng điều khiển'}
          </Link>
          <ChevronRight size={12} aria-hidden="true" />
          <Link href="/customer/requests" style={{ color: 'var(--text-muted)' }}>
            {t('customer.requestsTitle', 'Yêu cầu vận chuyển')}
          </Link>
          <ChevronRight size={12} aria-hidden="true" />
          <span style={{ color: 'var(--text-heading)', fontWeight: 600 }}>{t('customer.createRequestTitle', 'Tạo yêu cầu vận chuyển')}</span>
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
          {t('customer.createRequestTitle', 'Tạo Yêu Cầu Vận Chuyển')}
        </h1>
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
          {/* Track bounded to center of first and last step */}
          <div
            style={{
              position: 'absolute',
              top: '16px',
              left: '16.666%',
              right: '16.666%',
              height: '3px',
              backgroundColor: '#F0EEE8',
              zIndex: 0,
            }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                backgroundColor: 'var(--primary)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          <div className="grid grid-cols-3 relative z-[1]">
            {[
              { num: 1, label: t('customer.newRequest.step1', 'Thông tin lộ trình') },
              { num: 2, label: t('customer.newRequest.step2', 'Chọn ngựa vận chuyển') },
              { num: 3, label: t('customer.newRequest.step3', 'Rà soát & Gửi đơn') },
            ].map((step) => {
              const isPast = step.num < currentStep;
              const isActive = step.num === currentStep;

              return (
                <div key={step.num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', textAlign: 'center' }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      backgroundColor: isPast ? '#2D5A3F' : isActive ? 'var(--primary)' : '#ffffff',
                      color: isPast || isActive ? '#ffffff' : '#5F6977',
                      border: isPast || isActive ? '2px solid transparent' : '2px solid #D8CEBE',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '13px',
                      fontWeight: 700,
                      boxShadow: isActive ? '0 0 0 4px rgba(166, 124, 46, 0.2)' : 'none',
                    }}
                  >
                    {isPast ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : `0${step.num}`}
                  </div>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? 'var(--text-heading)' : '#5F6977',
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
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', backgroundColor: '#F0EEE8' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
                {language === 'en' ? 'Transport Information' : 'Thông tin vận chuyển'}
              </h2>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                {language === 'en' ? 'Please provide the route and schedule details for your request.' : 'Vui lòng cung cấp chi tiết lộ trình và lịch trình dự kiến cho yêu cầu của bạn.'}
              </p>
            </div>

            <div className="p-5 sm:p-7 flex flex-col gap-5">
              {/* Row 1: Title & Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <label htmlFor="req-title" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                    {language === 'en' ? 'Request Title' : 'Tiêu đề yêu cầu'} <span style={{ color: '#B33E3E' }} aria-hidden="true">*</span>
                  </label>
                  <input
                    id="req-title"
                    type="text"
                    aria-invalid={Boolean(errors.title)}
                    {...register('title')}
                    placeholder={language === 'en' ? 'Enter request title (e.g. Championship Transport to Singapore)' : 'Nhập tiêu đề yêu cầu (VD: Vận chuyển thi đấu đến Singapore)'}
                    className={`w-full px-3.5 py-2.5 rounded-lg border bg-white text-[#181A17] font-medium text-sm placeholder:text-[#8892A0] focus:outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20 transition-all ${errors.title ? 'border-[#B33E3E]' : 'border-[#D8CEBE]'}`}
                  />
                  {errors.title && (
                    <span role="alert" style={{ fontSize: '12px', color: '#B33E3E', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertCircle size={12} aria-hidden="true" /> {errors.title.message}
                    </span>
                  )}
                </div>

                <div>
                  <label htmlFor="req-transport-type" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                    {language === 'en' ? 'Transportation Type' : 'Hình thức vận chuyển'} <span style={{ color: '#B33E3E' }} aria-hidden="true">*</span>
                  </label>
                  <select
                    id="req-transport-type"
                    {...register('transportType')}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#D8CEBE] bg-white text-[#181A17] font-medium text-sm focus:outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20 transition-all cursor-pointer"
                  >
                    <option value="International" className="text-[#181A17] bg-white">{language === 'en' ? 'International Cross-Border' : 'Vận chuyển quốc tế xuyên biên giới'}</option>
                    <option value="Domestic" className="text-[#181A17] bg-white">{language === 'en' ? 'Domestic Transit' : 'Vận chuyển nội địa'}</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Route */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <label htmlFor="req-origin" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                    {language === 'en' ? 'Origin' : 'Điểm xuất phát'} <span style={{ color: '#B33E3E' }} aria-hidden="true">*</span>
                  </label>
                  <div className="relative">
                    <MapPin size={16} color="#5F6977" aria-hidden="true" style={{ position: 'absolute', top: '13px', left: '12px' }} />
                    <input
                      id="req-origin"
                      type="text"
                      aria-invalid={Boolean(errors.origin)}
                      {...register('origin')}
                      placeholder={language === 'en' ? 'Search origin (e.g. Ho Chi Minh City, Vietnam)' : 'Tìm điểm đón ngựa (VD: TP. Hồ Chí Minh, Việt Nam)'}
                      className={`w-full pl-9 pr-3.5 py-2.5 rounded-lg border bg-white text-[#181A17] font-medium text-sm placeholder:text-[#8892A0] focus:outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20 transition-all ${errors.origin ? 'border-[#B33E3E]' : 'border-[#D8CEBE]'}`}
                    />
                  </div>
                  {errors.origin && <span role="alert" style={{ fontSize: '12px', color: '#B33E3E', display: 'block', marginTop: '4px' }}>{errors.origin.message}</span>}
                </div>

                <div>
                  <label htmlFor="req-destination" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                    {language === 'en' ? 'Destination' : 'Điểm đến'} <span style={{ color: '#B33E3E' }} aria-hidden="true">*</span>
                  </label>
                  <div className="relative">
                    <Flag size={16} color="#5F6977" aria-hidden="true" style={{ position: 'absolute', top: '13px', left: '12px' }} />
                    <input
                      id="req-destination"
                      type="text"
                      aria-invalid={Boolean(errors.destination)}
                      {...register('destination')}
                      placeholder={language === 'en' ? 'Search destination (e.g. Singapore Turf Club)' : 'Tìm điểm đến (VD: Singapore Turf Club)'}
                      className={`w-full pl-9 pr-3.5 py-2.5 rounded-lg border bg-white text-[#181A17] font-medium text-sm placeholder:text-[#8892A0] focus:outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20 transition-all ${errors.destination ? 'border-[#B33E3E]' : 'border-[#D8CEBE]'}`}
                    />
                  </div>
                  {errors.destination && <span role="alert" style={{ fontSize: '12px', color: '#B33E3E', display: 'block', marginTop: '4px' }}>{errors.destination.message}</span>}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <label htmlFor="req-departure-date" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                    {language === 'en' ? 'Departure Date' : 'Ngày xuất phát'} <span style={{ color: '#B33E3E' }} aria-hidden="true">*</span>
                  </label>
                  <input
                    id="req-departure-date"
                    type="date"
                    min={earliestDepartureDate}
                    aria-invalid={Boolean(errors.departureDate) || isDepartureBeforeCutoff(formValues.departureDate)}
                    {...register('departureDate', {
                      onChange: (e) => {
                        const newDep = e.target.value;
                        if (formValues.arrivalDate && formValues.arrivalDate < newDep) {
                          setValue('arrivalDate', newDep, { shouldValidate: true });
                        }
                      },
                    })}
                    className={`w-full px-3.5 py-2.5 rounded-lg border bg-white text-[#181A17] font-medium text-sm focus:outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20 transition-all ${errors.departureDate || isDepartureBeforeCutoff(formValues.departureDate) ? 'border-[#B33E3E]' : 'border-[#D8CEBE]'}`}
                  />
                  {errors.departureDate && (
                    <span role="alert" style={{ fontSize: '12px', color: '#B33E3E', display: 'block', marginTop: '4px' }}>
                      {errors.departureDate.message}
                    </span>
                  )}
                  {isDepartureBeforeCutoff(formValues.departureDate) ? (
                    <span role="alert" style={{ fontSize: '12px', color: '#991B1B', backgroundColor: '#FEF2F2', padding: '7px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', border: '1px solid #FECACA' }}>
                      <AlertCircle size={13} aria-hidden="true" style={{ flexShrink: 0, color: '#B33E3E' }} />
                      <span>{cutoffViolationMessage()}</span>
                    </span>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#8C6621', backgroundColor: '#F5EFE2', padding: '7px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', border: '1px solid #DFCA9A' }}>
                      <Clock size={13} aria-hidden="true" style={{ flexShrink: 0, color: '#A67C2E' }} />
                      <span>
                        {language === 'en' ? (
                          <>Route <strong>Order Cutoff</strong>: requires booking at least <strong>{minLeadDays} days</strong> ahead (earliest: <strong>{earliestDepartureDate}</strong>).</>
                        ) : (
                          <>Hạn đặt đơn (<strong>Order Cutoff</strong>): tuyến yêu cầu đặt trước tối thiểu <strong>{minLeadDays} ngày</strong> (sớm nhất: <strong>{earliestDepartureDate}</strong>).</>
                        )}
                      </span>
                    </span>
                  )}
                </div>

                <div>
                  <label htmlFor="req-arrival-date" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                    {language === 'en' ? 'Expected Arrival' : 'Dự kiến đến nơi'}
                  </label>
                  <input
                    id="req-arrival-date"
                    type="date"
                    min={formValues.departureDate || todayStr}
                    aria-invalid={Boolean(errors.arrivalDate)}
                    {...register('arrivalDate')}
                    className={`w-full px-3.5 py-2.5 rounded-lg border bg-white text-[#181A17] font-medium text-sm focus:outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20 transition-all ${errors.arrivalDate ? 'border-[#B33E3E]' : 'border-[#D8CEBE]'}`}
                  />
                  {errors.arrivalDate && (
                    <span role="alert" style={{ fontSize: '12px', color: '#B33E3E', display: 'block', marginTop: '4px' }}>
                      {errors.arrivalDate.message}
                    </span>
                  )}
                </div>
              </div>

              {/* Row 4: Special Requirements */}
              <div>
                <label htmlFor="req-special-reqs" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span>{language === 'en' ? 'Special Requirements' : 'Yêu cầu đặc biệt'}</span>
                  <span style={{ color: '#5F6977', fontWeight: 400 }}>{language === 'en' ? 'Optional' : 'Tùy chọn'}</span>
                </label>
                <textarea
                  id="req-special-reqs"
                  rows={3}
                  {...register('specialReqs')}
                  placeholder={language === 'en' ? 'Enter any special transportation requirements (e.g. Temperature-controlled vehicle required, specific hydration schedule)...' : 'Nhập các yêu cầu vận chuyển đặc biệt (VD: Yêu cầu xe điều hòa nhiệt độ, lịch bù nước cụ thể)...'}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#D8CEBE] bg-white text-[#181A17] font-medium text-sm placeholder:text-[#8892A0] focus:outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20 transition-all"
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
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', backgroundColor: '#F0EEE8',
                      color: '#181A17', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
                  {t('customer.newRequest.horseInfoTitle', 'Horse Information')}
                </h2>
                <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                  {t('customer.newRequest.selectHorsesDesc', 'Tích chọn các con ngựa cần vận chuyển từ đàn của bạn (Đã chọn: {count} con).').replace('{count}', String(totalSelectedHorses))}
                </p>
                {selectedHorses.length > 0 && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', alignItems: 'center' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-heading)' }}>
                      {t('customer.newRequest.breedBreakdown', 'Breed Breakdown:')}
                    </span>
                    {Object.entries(breedBreakdown).map(([breed, count]) => (
                      <span
                        key={breed}
                        style={{
                          fontSize: '11.5px',
                          padding: '3px 10px',
                          borderRadius: '20px',
                          backgroundColor: '#F5EFE2',
                          color: '#8C6621',
                          fontWeight: 600,
                          border: '1px solid #DFCA9A',
                        }}
                      >
                        {translateBreed(breed)}: <strong>{count}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsAddHorseModalOpen(true)}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A67C2E]"
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  backgroundColor: '#FAF8F4',
                  color: 'var(--primary)',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: '1px solid #D4C5A3',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
              >
                <Plus size={14} aria-hidden="true" /> {t('customer.newRequest.addNewHorseBtn', 'Add New Horse')}
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-5">
              <div className="overflow-x-auto w-full">
                <table style={{ width: '100%', minWidth: '650px', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #D8CEBE', backgroundColor: '#F0EEE8' }}>
                    <th style={{ padding: '12px 16px', width: '44px' }} />
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#5F6977' }}>{t('customer.newRequest.horse', 'Horse')}</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#5F6977' }}>{t('customer.table.breed', 'Breed')}</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#5F6977' }}>{t('customer.newRequest.ageGender', 'Age / Gender')}</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#5F6977' }}>{t('customer.newRequest.medicalStatus', 'Medical Status')}</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#5F6977', textAlign: 'right' }}>{t('customer.newRequest.profile', 'Profile')}</th>
                  </tr>
                </thead>
                <tbody>
                  {horses.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '40px 20px', textAlign: 'center', color: '#5F6977' }}>
                        <p style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>
                          {language === 'en' ? 'No horses in your stable yet.' : 'Chưa có ngựa nào trong chuồng của bạn.'}
                        </p>
                        <button
                          type="button"
                          onClick={() => setIsAddHorseModalOpen(true)}
                          style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            backgroundColor: '#181A17',
                            color: '#FAF8F4',
                            fontSize: '13px',
                            fontWeight: 600,
                            border: 'none',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <Plus size={14} aria-hidden="true" /> {t('customer.newRequest.addNewHorseBtn', 'Thêm ngựa mới')}
                        </button>
                      </td>
                    </tr>
                  ) : horses.map((h) => {
                    const activeOrder = getHorseActiveOrder(h);
                    const isInTransit =
                      (h.availabilityStatus || '').toLowerCase().includes('transit') ||
                      activeOrder?.status === 'IN_TRANSIT' ||
                      activeOrder?.status === 'in_transit';
                    const isScheduled = !isInTransit && Boolean(activeOrder);
                    const isRetired = h.status === 'retired' || h.status === 'deceased';
                    const isUnavailable = isInTransit || isScheduled || isRetired;
                    const isSelected = (horseQuantities[h.id] || 0) > 0;
                    const orderCode = activeOrder?.requestCode;

                    return (
                      <tr
                        key={h.id}
                        style={{
                          borderBottom: '1px solid var(--border-light)',
                          backgroundColor: isSelected ? '#FAF8F4' : isUnavailable ? '#F0EEE8' : 'transparent',
                          opacity: isUnavailable ? 0.72 : 1,
                        }}
                      >
                        <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                          <label
                            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center cursor-pointer select-none"
                            style={{ cursor: isUnavailable ? 'not-allowed' : 'pointer' }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isUnavailable}
                              aria-label={`${language === 'en' ? 'Select horse' : 'Chọn chiến mã'} ${h.name}`}
                              onChange={() => !isUnavailable && toggleHorseSelection(h.id)}
                              title={
                                isInTransit
                                  ? t('customer.newRequest.inTransitTooltip', 'Horse is currently in transit ({code})').replace('{code}', orderCode || 'REQ')
                                  : isScheduled
                                  ? t('customer.newRequest.scheduledTooltip', 'Horse is scheduled in order {code}').replace('{code}', orderCode || '')
                                  : t('customer.newRequest.selectTooltip', 'Select for transport')
                              }
                              style={{
                                width: '18px',
                                height: '18px',
                                cursor: isUnavailable ? 'not-allowed' : 'pointer',
                                accentColor: '#A67C2E',
                              }}
                            />
                          </label>
                        </td>
                        <td style={{ padding: '16px', fontWeight: 700, color: 'var(--text-heading)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '42px',
                                height: '42px',
                                borderRadius: '50%',
                                overflow: 'hidden',
                                backgroundColor: '#F0EEE8',
                                border: '2px solid #ffffff',
                                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <img
                                src={getFullPhotoUrl(h.photoUrl) || HORSE_PLACEHOLDER_SVG}
                                alt={h.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={(e) => {
                                  const img = e.currentTarget as HTMLImageElement;
                                  if (img.src !== HORSE_PLACEHOLDER_SVG) img.src = HORSE_PLACEHOLDER_SVG;
                                }}
                              />
                            </div>
                            <div>
                              <div>{h.name}</div>
                              {isSelected && Number(h.quantity ?? 1) > 1 && <label className="mt-2 flex items-center gap-2 text-xs font-medium">
                                {language === 'en' ? 'Horses' : 'Số ngựa'}
                                <input type="number" min={1} max={h.quantity} step={1} value={horseQuantities[h.id]}
                                  aria-label={language === 'en' ? `Horse count for ${h.name}` : `Số ngựa từ hồ sơ ${h.name}`}
                                  onChange={e => {
                                    const quantity = Number(e.target.value);
                                    if (Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= Number(h.quantity)) {
                                      setHorseQuantities(previous => ({ ...previous, [h.id]: quantity }));
                                    }
                                  }} className="w-20 rounded border border-[#D8CEBE] p-2" />
                                / {h.quantity}
                              </label>}
                              {isInTransit ? (
                                <div
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    marginTop: '3px',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    backgroundColor: '#F5EFE2',
                                    color: '#8C6621',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                  }}
                                >
                                  <Truck size={12} aria-hidden="true" />
                                  <span>{t('customer.newRequest.inTransitStatus', 'In Transit ({code})').replace('{code}', orderCode || 'REQ-001')}</span>
                                </div>
                              ) : isScheduled ? (
                                <div
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    marginTop: '3px',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    backgroundColor: '#D8CEBE',
                                    color: '#242722',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                  }}
                                >
                                  <Clock size={12} aria-hidden="true" />
                                  <span>{t('customer.newRequest.scheduledStatus', 'Scheduled ({code})').replace('{code}', orderCode || 'REQ-002')}</span>
                                </div>
                              ) : (
                                <div
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: '#287653',
                                    marginTop: '2px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                  }}
                                >
                                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#287653', display: 'inline-block' }} />
                                  {t('customer.newRequest.readyStatus', 'Ready for transit')}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '16px', color: 'var(--text-body)' }}>{translateBreed(h.breed)}</td>
                        <td style={{ padding: '16px', color: 'var(--text-body)' }}>
                          {h.age} {t('horses.yearsOld', 'years old')} • {translateGender(h.gender)}
                        </td>
                        <td style={{ padding: '16px' }}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              backgroundColor: isUnavailable ? '#F0EEE8' : '#E8F2EB',
                              color: isUnavailable ? '#5F6977' : '#287653',
                            }}
                          >
                            {isUnavailable
                              ? (isInTransit
                                  ? t('customer.newRequest.inTransitBadge', 'In Transit')
                                  : isScheduled
                                  ? t('customer.newRequest.scheduledBadge', 'Scheduled')
                                  : t('customer.newRequest.unavailableBadge', 'Unavailable'))
                              : (h.medicalStatus || (language === 'en' ? 'Healthy' : 'Khỏe mạnh'))}
                          </span>
                        </td>
                        <td style={{ padding: '16px', textAlign: 'right' }}>
                          <Link href={`/customer/horses/${h.id}`} target="_blank" style={{ fontSize: '12.5px', color: 'var(--primary)', fontWeight: 600 }}>
                            {t('customer.newRequest.viewProfile', 'View Profile ↗')}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
              <BookingChoice value={bookingType} onChange={setBookingType} horseCount={totalSelectedHorses} />
              {selectedHorses.length > 0 && <InsuranceSelection horses={selectedHorses} values={insuranceValues}
                onChange={(id, value) => { setInsuranceValues(previous => ({ ...previous, [id]: value })); setInsuranceError(''); }}
                policy={policy ?? null} error={policyError ? (language === 'en' ? 'Unable to load insurance policy.' : 'Chưa tải được chính sách bảo hiểm.') : insuranceError} onRetry={() => void reloadPolicy()} />}
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
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', backgroundColor: '#F0EEE8' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
                {t('customer.newRequest.reviewTitle', 'Review & Submit Request')}
              </h2>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                {t('customer.newRequest.reviewDesc', 'Please review your shipment parameters carefully before submitting to the operations team.')}
              </p>
            </div>

            <div className="p-5 sm:p-7 flex flex-col gap-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div style={{ backgroundColor: '#F0EEE8', color: '#181A17', padding: '14px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#5F6977', textTransform: 'uppercase', fontWeight: 700 }}>
                    {t('customer.newRequest.summaryTitle', 'Request Title')}
                  </span>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-heading)', marginTop: '2px' }}>
                    {formValues.title || (language === 'en' ? 'Untitled Request' : 'Yêu cầu vận chuyển')}
                  </div>
                </div>
                <div style={{ backgroundColor: '#F0EEE8', color: '#181A17', padding: '14px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#5F6977', textTransform: 'uppercase', fontWeight: 700 }}>
                    {t('customer.newRequest.summaryRoute', 'Route')}
                  </span>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-heading)', marginTop: '2px' }}>
                    {translateCountry(formValues.origin)} → {translateCountry(formValues.destination)}
                  </div>
                </div>
                <div style={{ backgroundColor: '#F0EEE8', color: '#181A17', padding: '14px', borderRadius: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#5F6977', textTransform: 'uppercase', fontWeight: 700 }}>
                    {t('customer.newRequest.summaryDepartureDate', 'Departure Date')}
                  </span>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-heading)', marginTop: '2px' }}>{formValues.departureDate}</div>
                </div>
              </div>

              {/* Route & Customs Logistics Summary */}
              {routeData && (
                <div
                  style={{
                    backgroundColor: '#FAF8F4',
                    padding: '16px 20px',
                    borderRadius: '12px',
                    border: '1px solid #D8CEBE',
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
                        backgroundColor: '#D8CEBE',
                        color: '#242722',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Navigation size={18} aria-hidden="true" />
                    </div>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#181A17' }}>
                        {t('customer.newRequest.routePrefix', 'Route:')} {routeData.mode === 'air' ? t('customer.newRequest.routeAir', 'Air Freight Corridor') : t('customer.newRequest.routeRoad', 'Overland Road Transit')}
                      </div>
                      <div style={{ fontSize: '12.5px', color: '#5F6977' }}>
                        {t('customer.newRequest.distance', 'Distance:')} <strong style={{ color: '#181A17' }}>{routeData.distanceKm.toLocaleString()} km</strong> • {t('customer.newRequest.estimatedTime', 'Estimated Duration:')} <strong style={{ color: '#181A17' }}>~{routeData.durationHours} {t('customer.newRequest.hours', 'hours')}</strong>
                      </div>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: '20px',
                      backgroundColor: '#E8F2EB',
                      color: '#287653',
                      border: '1px solid #B7DBC4',
                    }}
                  >
                    {t('customer.newRequest.quarantineOptimized', '✓ Quarantine & Vet Stations Optimized')}
                  </span>
                </div>
              )}

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-heading)' }}>
                    {t('customer.newRequest.selectedHorsesCount', 'Selected Horses ({count} horses)').replace('{count}', String(totalSelectedHorses))}
                  </span>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {Object.entries(breedBreakdown).map(([breed, count]) => (
                      <span
                        key={breed}
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          backgroundColor: '#F5EFE2',
                          color: '#8C6621',
                          fontWeight: 600,
                          border: '1px solid #DFCA9A',
                        }}
                      >
                        {translateBreed(breed)}: {count}
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
                        backgroundColor: '#FAF8F4',
                        color: 'var(--primary)',
                        fontSize: '13px',
                        fontWeight: 600,
                        border: '1px solid #D8CEBE',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <span>{h.name}</span>
                      <span style={{ color: '#5F6977', fontSize: '12px', fontWeight: 500 }}>• {translateBreed(h.breed)}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {currentStep === 3 && (
        <section
          aria-label={language === 'en' ? 'Insurance confirmation' : 'Xác nhận bảo hiểm'}
          className="mx-auto w-full max-w-[850px] space-y-4 rounded-2xl border border-[#D8CEBE] bg-white p-5 sm:p-6"
        >
          <h3 className="font-bold text-[#181A17]">
            {language === 'en' ? 'Insurance & Estimated Cost' : 'Bảo hiểm & chi phí dự kiến'}
          </h3>
          <ul className="space-y-2 text-sm text-[#181A17]">
            {selectedHorses.map((h) => {
              const value = insuranceValues[h.id] ?? defaultInsurance;
              return (
                <li key={h.id}>
                  <strong>{h.name}</strong> · {Number(value.declaredValue || 0).toLocaleString('vi-VN')} {value.declaredCurrency}/
                  {language === 'en' ? 'horse' : 'ngựa'} · {language === 'en' ? 'Package' : 'Gói'} {insuranceNames[value.insurancePackage]} ·{' '}
                  {vnd(previewInsurance(value, policy ?? null).fee * h.quantity)}
                </li>
              );
            })}
          </ul>
          <BookingSummary bookingType={bookingType} horseCount={totalSelectedHorses} />
          <CostSummary transportCost={null} insuranceFee={estimatedInsuranceFee} />
          <p className="text-xs text-[#5F6977]">
            {language === 'en'
              ? 'Insurance fees are rounded to VND per horse and recalculated on the server when saved. The final quote includes base freight and insurance; no payment is required at submission.'
              : 'Phí bảo hiểm làm tròn đến VNĐ trên mỗi ngựa. Backend xác nhận lại phí khi lưu yêu cầu. Tổng tiền sẽ gồm cước cơ bản và phí bảo hiểm; chưa yêu cầu thanh toán ở bước này.'}
          </p>
          {insuranceError && <p role="alert" className="text-sm text-[#B33E3E]">{insuranceError}</p>}
        </section>
      )}

      {/* STICKY BOTTOM ACTION BAR (stays clear of Sidebar) */}
      <div
        className="sticky bottom-0 z-20 mx-auto w-full max-w-[850px] rounded-2xl border border-[#D8CEBE] bg-white/95 px-5 py-3.5 shadow-[0_-6px_20px_rgba(24,26,23,0.08)] backdrop-blur-sm flex items-center justify-between gap-3 flex-wrap"
        style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom, 14px))' }}
      >
        <span className="text-xs font-semibold text-[#5F6977]">
          {language === 'en' ? `Step ${currentStep} of 3` : `Bước ${currentStep} / 3`}
        </span>
        <div className="flex items-center gap-3 ml-auto">
          {currentStep > 1 && (
            <button
              type="button"
              onClick={handleBack}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A67C2E] cursor-pointer"
              style={{
                padding: '9px 20px',
                borderRadius: '8px',
                border: '1px solid #D8CEBE',
                backgroundColor: '#ffffff',
                fontSize: '13.5px',
                fontWeight: 600,
                color: 'var(--text-body)',
              }}
            >
              {t('common.back', 'Back')}
            </button>
          )}

          {currentStep < 3 ? (
            <button
              type="button"
              onClick={handleContinue}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A67C2E] cursor-pointer"
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
                boxShadow: '0 4px 12px rgba(166, 124, 46, 0.25)',
              }}
            >
              {t('customer.newRequest.continueBtn', 'Continue')} <ArrowRight size={15} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (isSubmitting) return;
                handleSubmit(onSubmitForm)();
              }}
              disabled={isSubmitting}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#287653]"
              style={{
                padding: '9px 26px',
                borderRadius: '8px',
                backgroundColor: isSubmitting ? '#8892A0' : '#287653',
                color: '#ffffff',
                fontSize: '13.5px',
                fontWeight: 600,
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: isSubmitting ? 'none' : '0 4px 12px rgba(40, 118, 83, 0.25)',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmitting ? (
                <>
                  {t('customer.newRequest.submitting', 'Submitting...')} <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                </>
              ) : (
                <>
                  {t('customer.newRequest.submitBtn', 'Submit Request')} <Check size={16} strokeWidth={2.5} aria-hidden="true" />
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
  const { language } = useLanguage();
  return (
    <React.Suspense fallback={<div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>{language === 'en' ? 'Loading transport wizard...' : 'Đang tải trình tạo đơn vận chuyển...'}</div>}>
      <CreateTransportRequestForm />
    </React.Suspense>
  );
}
