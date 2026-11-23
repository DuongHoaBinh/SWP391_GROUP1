'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronRight,
  Plus,
  Check,
  ArrowRight,
  AlertCircle,
  Loader2,
  Truck,
  Plane,
  Navigation,
  Clock,
  Search,
  X,
} from 'lucide-react';
import { AddressAutocompleteInput } from '@/components/ui/AddressAutocompleteInput';
import { normalizeVietnamese, type GeocodedLocation, type RouteLegPreview } from '@/lib/geo-corridors';
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

const parseLocalDate = (val: string) => {
  const parts = val.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return new Date(val);
  return new Date(parts[0], parts[1] - 1, parts[2]);
};

const getFormSchema = (lang: string) =>
  z.object({
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
    horseCount: z.coerce.number().min(1),
    specialReqs: z.string().optional(),
  });

type FormData = z.infer<ReturnType<typeof getFormSchema>>;

function CreateTransportRequestForm() {
  const router = useRouter();
  const { t, language, translateBreed, translateCountry } = useLanguage();
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

  const defaultDepartureStr = getDateOffsetString(7);

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
      horseCount: 1,
      specialReqs: '',
    },
  });

  const formValues = watch();

  // Route calculation and corridor metrics from Leaflet map
  const [selectedOriginGeo, setSelectedOriginGeo] = useState<GeocodedLocation | null>(null);
  const [selectedDestGeo, setSelectedDestGeo] = useState<GeocodedLocation | null>(null);
  const [routeData, setRouteData] = useState<{
    distanceKm: number;
    durationHours: number;
    mode: 'air' | 'road';
    legs?: RouteLegPreview[];
  } | null>(null);

  useEffect(() => {
    register('origin');
    register('destination');
  }, [register]);

  const estimatedArrivalDisplay = useMemo(() => {
    if (!formValues.departureDate) return '—';
    const dep = parseLocalDate(formValues.departureDate);
    if (Number.isNaN(dep.getTime())) return '—';
    const durationHours = routeData?.durationHours ?? 24;
    const arr = new Date(dep.getTime() + durationHours * 3_600_000);
    return arr.toLocaleDateString(language === 'en' ? 'en-US' : 'vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }, [formValues.departureDate, routeData?.durationHours, language]);

  // Horse quantities mapping: horseId -> quantity
  const [horseQuantities, setHorseQuantities] = useState<Record<string, number>>({});
  const [horseFilter, setHorseFilter] = useState<'available' | 'all'>('available');
  const [horseSearch, setHorseSearch] = useState('');
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

  const minLeadDays = cutoffPolicy?.minLeadDays ?? (bookingType === 'dedicated_charter' ? 2 : 3);
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

  const getHorseRowState = (h: Horse) => {
    const activeOrder = getHorseActiveOrder(h);
    const activeStatus = String(activeOrder?.status || '').toLowerCase();
    const horseStatus = String(h.status || '').toLowerCase();
    const isInTransit =
      (h.availabilityStatus || '').toLowerCase().includes('transit') ||
      horseStatus === 'in_transit' ||
      activeStatus === 'in_transit';
    const isScheduled = !isInTransit && Boolean(activeOrder);
    const isRetired =
      horseStatus === 'retired' ||
      horseStatus === 'deceased' ||
      (Boolean(horseStatus) && horseStatus !== 'active' && !isInTransit);
    const isUnavailable = isInTransit || isScheduled || isRetired;
    const sortRank = isUnavailable ? (isScheduled ? 1 : isInTransit ? 2 : 3) : 0;
    return { activeOrder, isInTransit, isScheduled, isRetired, isUnavailable, sortRank };
  };

  // Show selectable horses first without re-sorting on selection toggle
  const sortedHorses = horses
    .map((horse, index) => ({ horse, index, ...getHorseRowState(horse) }))
    .sort((a, b) => a.sortRank - b.sortRank || a.index - b.index);

  const availableHorsesCount = sortedHorses.filter((row) => !row.isUnavailable).length;
  const normalizedHorseQuery = normalizeVietnamese(horseSearch.trim());
  const filteredHorses = sortedHorses.filter((row) => {
    if (horseFilter === 'available' && row.isUnavailable) return false;
    if (!normalizedHorseQuery) return true;
    return (
      normalizeVietnamese(row.horse.name || '').includes(normalizedHorseQuery) ||
      normalizeVietnamese(row.horse.breed || '').includes(normalizedHorseQuery) ||
      normalizeVietnamese(translateBreed(row.horse.breed) || '').includes(normalizedHorseQuery)
    );
  });

  const toggleHorseSelection = (id: string) => {
    const target = horses.find((h) => String(h.id) === String(id));
    if (!target) return;
    const { activeOrder, isInTransit, isScheduled, isUnavailable } = getHorseRowState(target);

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
      const isValid = await trigger(['title', 'origin', 'destination', 'departureDate']);
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
      const invalidSelected = selectedHorses.find((h) => getHorseRowState(h).isUnavailable);
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
        age?: number;
        quantity: number; declaredValue: number; declaredCurrency: 'VND' | 'USD'; insurancePackage: 'basic' | 'standard' | 'premium';
      }> = [];

      for (const h of selectedHorses) {
        const qty = h.quantity || 1;
        const numericHorseId = h.backendId || (Number(h.id) > 0 ? Number(h.id) : undefined);
        selectedHorsesData.push({
          horseId: numericHorseId,
          name: h.name,
          breed: h.breed,
          age: h.age,
          quantity: qty,
          declaredValue: Number((insuranceValues[h.id] ?? defaultInsurance).declaredValue || 0),
          declaredCurrency: (insuranceValues[h.id] ?? defaultInsurance).declaredCurrency,
          insurancePackage: (insuranceValues[h.id] ?? defaultInsurance).insurancePackage,
        });
      }

      const currentUser = getCurrentUser();
      const combinedReqs = data.specialReqs?.trim() || '';

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
    <div className="flex flex-col gap-6 pb-8">
      {/* Editorial Header */}
      <header className="border-b border-[#E5DDD0] pb-5">
        <div className="flex items-center gap-1.5 text-xs text-[#747D88] mb-1.5 flex-wrap">
          <Link href="/customer" className="text-[#5F6977] hover:text-[#181A17] no-underline transition-colors">
            {language === 'en' ? 'Dashboard' : 'Bảng điều khiển'}
          </Link>
          <ChevronRight size={12} aria-hidden="true" />
          <Link href="/customer/requests" className="text-[#5F6977] hover:text-[#181A17] no-underline transition-colors">
            {t('customer.requestsTitle', 'Yêu cầu vận chuyển')}
          </Link>
          <ChevronRight size={12} aria-hidden="true" />
          <span className="text-[#181A17] font-semibold">{t('customer.createRequestTitle', 'Tạo yêu cầu vận chuyển')}</span>
        </div>
        <h1 className="text-2xl font-extrabold text-[#181A17] tracking-tight m-0">
          {t('customer.createRequestTitle', 'Tạo Yêu Cầu Vận Chuyển')}
        </h1>
        <p className="text-sm text-[#5F6977] mt-1 mb-0">
          {language === 'en'
            ? 'Configure your route, select horses, and confirm insurance preferences.'
            : 'Điền thông tin hành trình, chọn ngựa vận chuyển và xác nhận gói bảo hiểm.'}
        </p>
      </header>

      {/* PROGRESS INDICATOR */}
      <div className="bg-white rounded-2xl border border-[#E5DDD0] p-5 shadow-sm">
        <div className="max-w-[720px] mx-auto relative">
          <div className="absolute top-4 left-[16.666%] right-[16.666%] h-[2px] bg-[#EFEAE0] z-0">
            <div
              className="h-full bg-[#181A17] transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
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
                <div key={step.num} className="flex flex-col items-center gap-1.5 text-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      isPast
                        ? 'bg-[#287653] text-white'
                        : isActive
                          ? 'bg-[#181A17] text-[#C4B38E] ring-4 ring-[#C4B38E]/25'
                          : 'bg-white text-[#5F6977] border border-[#D8CEBE]'
                    }`}
                  >
                    {isPast ? <Check size={15} strokeWidth={3} aria-hidden="true" /> : `0${step.num}`}
                  </div>
                  <span className={`text-xs ${isActive ? 'font-bold text-[#181A17]' : 'font-medium text-[#5F6977]'}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* STEP CONTENT CONTAINER */}
      <div className="max-w-[850px] w-full mx-auto">
        {/* STEP 1: TRANSPORT INFORMATION */}
        {currentStep === 1 && (
          <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-sm">
            <div className="px-6 py-4 bg-white border-b border-[#EFEAE0]">
              <h2 className="text-base font-extrabold text-[#181A17] m-0">
                {language === 'en' ? 'Transport Information' : 'Thông tin vận chuyển'}
              </h2>
              <p className="text-xs text-[#5F6977] mt-1 mb-0">
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
                  <AddressAutocompleteInput
                    id="req-origin"
                    name="origin"
                    icon="origin"
                    value={formValues.origin || ''}
                    domesticOnly={formValues.transportType === 'Domestic'}
                    hasError={Boolean(errors.origin)}
                    language={language}
                    placeholder={language === 'en' ? 'Enter pickup address (e.g. Ho Chi Minh City, Vietnam)' : 'Nhập địa chỉ xuất phát (VD: Quận 7, TP. Hồ Chí Minh)'}
                    onChangeText={(val) => {
                      setValue('origin', val, { shouldValidate: true, shouldDirty: true });
                      setSelectedOriginGeo(null);
                    }}
                    onSelectSuggestion={(address, geo) => {
                      setValue('origin', address, { shouldValidate: true, shouldDirty: true });
                      setSelectedOriginGeo(geo);
                    }}
                  />
                  {errors.origin && <span role="alert" style={{ fontSize: '12px', color: '#B33E3E', display: 'block', marginTop: '4px' }}>{errors.origin.message}</span>}
                </div>

                <div>
                  <label htmlFor="req-destination" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                    {language === 'en' ? 'Destination' : 'Điểm đến'} <span style={{ color: '#B33E3E' }} aria-hidden="true">*</span>
                  </label>
                  <AddressAutocompleteInput
                    id="req-destination"
                    name="destination"
                    icon="destination"
                    value={formValues.destination || ''}
                    domesticOnly={formValues.transportType === 'Domestic'}
                    hasError={Boolean(errors.destination)}
                    language={language}
                    placeholder={language === 'en' ? 'Enter destination address (e.g. Singapore Turf Club)' : 'Nhập địa chỉ đến (VD: Đà Lạt, Singapore, New Delhi...)'}
                    onChangeText={(val) => {
                      setValue('destination', val, { shouldValidate: true, shouldDirty: true });
                      setSelectedDestGeo(null);
                    }}
                    onSelectSuggestion={(address, geo) => {
                      setValue('destination', address, { shouldValidate: true, shouldDirty: true });
                      setSelectedDestGeo(geo);
                    }}
                  />
                  {errors.destination && <span role="alert" style={{ fontSize: '12px', color: '#B33E3E', display: 'block', marginTop: '4px' }}>{errors.destination.message}</span>}
                </div>
              </div>

              {/* Interactive Route & Border Checkpoints Map */}
              <RoutePlanningMap
                originText={formValues.origin}
                destinationText={formValues.destination}
                transportType={formValues.transportType}
                selectedOriginGeo={selectedOriginGeo}
                selectedDestGeo={selectedDestGeo}
                onRouteCalculated={setRouteData}
                onApplyPreset={(preset) => {
                  setSelectedOriginGeo(null);
                  setSelectedDestGeo(null);
                  setValue('origin', preset.origin, { shouldValidate: true });
                  setValue('destination', preset.destination, { shouldValidate: true });
                  setValue('transportType', preset.type, { shouldValidate: true });
                }}
              />

              {/* Booking Type (placed on Step 1 so changing Shared Stall / Charter immediately updates Order Cutoff) */}
              <BookingChoice value={bookingType} onChange={setBookingType} horseCount={0} compact />

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
                    {...register('departureDate')}
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
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                    {language === 'en' ? 'Estimated Arrival (Auto-calculated)' : 'Dự kiến đến nơi (ước tính tự động)'}
                  </span>
                  <div className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5DDD0] bg-[#FAF8F4] text-[#181A17] font-semibold text-sm flex items-center justify-between gap-2">
                    <span>{estimatedArrivalDisplay}</span>
                    {routeData && (
                      <span className="text-xs font-medium text-[#5F6977]">
                        (~{routeData.durationHours}{language === 'en' ? 'h' : ' giờ'})
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#747D88] mt-1.5 mb-0">
                    {language === 'en'
                      ? 'Final ETA is confirmed by the Coordinator during route planning.'
                      : 'Thời gian đến chính thức sẽ do Điều phối viên chốt theo lịch xe/bay.'}
                  </p>
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
          <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-sm">
            <div className="px-6 py-4 bg-white border-b border-[#EFEAE0] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-[#181A17] m-0">
                  {t('customer.newRequest.horseInfoTitle', 'Horse Information')}
                </h2>
                <p className="text-xs text-[#5F6977] mt-1 mb-0">
                  {t('customer.newRequest.selectHorsesDesc', 'Tích chọn các con ngựa cần vận chuyển từ đàn của bạn (Đã chọn: {count} con).').replace('{count}', String(totalSelectedHorses))}
                </p>
                {selectedHorses.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-2.5 items-center">
                    <span className="text-[11.5px] font-bold text-[#181A17]">
                      {t('customer.newRequest.breedBreakdown', 'Breed Breakdown:')}
                    </span>
                    {Object.entries(breedBreakdown).map(([breed, count]) => (
                      <span
                        key={breed}
                        className="text-[11.5px] px-2.5 py-0.5 rounded-full bg-[#FAF8F4] text-[#8C6621] font-semibold border border-[#E5DDD0]"
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
                className="px-3.5 py-2 rounded-xl bg-white hover:border-[#B49A68] text-[#181A17] text-xs font-semibold border border-[#D8CEBE] inline-flex items-center gap-1.5 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A67C2E]"
              >
                <Plus size={14} className="text-[#A67C2E]" aria-hidden="true" /> {t('customer.newRequest.addNewHorseBtn', 'Add New Horse')}
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              {/* Filter & Quick-Search Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div
                  className="inline-flex rounded-xl border border-[#E5DDD0] bg-[#FAF8F4] p-0.5"
                  role="tablist"
                  aria-label={language === 'en' ? 'Filter horses' : 'Lọc danh sách ngựa'}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={horseFilter === 'available'}
                    onClick={() => setHorseFilter('available')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      horseFilter === 'available'
                        ? 'bg-white text-[#181A17] shadow-xs'
                        : 'text-[#5F6977] hover:text-[#181A17]'
                    }`}
                  >
                    {language === 'en'
                      ? `Ready (${availableHorsesCount})`
                      : `Sẵn sàng (${availableHorsesCount})`}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={horseFilter === 'all'}
                    onClick={() => setHorseFilter('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      horseFilter === 'all'
                        ? 'bg-white text-[#181A17] shadow-xs'
                        : 'text-[#5F6977] hover:text-[#181A17]'
                    }`}
                  >
                    {language === 'en'
                      ? `All (${sortedHorses.length})`
                      : `Tất cả (${sortedHorses.length})`}
                  </button>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search
                    size={14}
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#747D88]"
                  />
                  <input
                    type="text"
                    value={horseSearch}
                    onChange={(e) => setHorseSearch(e.target.value)}
                    placeholder={
                      language === 'en'
                        ? 'Search by name or breed...'
                        : 'Tìm tên hoặc giống ngựa...'
                    }
                    aria-label={
                      language === 'en'
                        ? 'Search horses by name or breed'
                        : 'Tìm ngựa theo tên hoặc giống'
                    }
                    className="w-full rounded-xl border border-[#D8CEBE] bg-white pl-8 pr-8 py-1.5 text-xs font-medium text-[#181A17] placeholder:text-[#8892A0] focus:outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20 transition-all"
                  />
                  {horseSearch && (
                    <button
                      type="button"
                      onClick={() => setHorseSearch('')}
                      aria-label={language === 'en' ? 'Clear search' : 'Xóa từ khóa tìm kiếm'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#747D88] hover:text-[#181A17] cursor-pointer"
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              {/* Quick-Remove Chips Bar for Selected Horses */}
              {selectedHorses.length > 0 && (
                <div className="rounded-xl border border-[#E5DDD0] bg-[#FAF8F4] px-3 py-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11.5px] font-bold text-[#181A17] mr-0.5">
                    {language === 'en'
                      ? `Selected (${totalSelectedHorses}):`
                      : `Đã chọn (${totalSelectedHorses}):`}
                  </span>
                  {selectedHorses.map((h) => (
                    <span
                      key={h.id}
                      className="inline-flex items-center gap-1 rounded-full border border-[#D8CEBE] bg-white px-2.5 py-0.5 text-[11.5px] font-semibold text-[#181A17]"
                    >
                      <span>{h.name}</span>
                      {h.quantity > 1 && (
                        <span className="text-[#8C6621] font-bold">×{h.quantity}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleHorseSelection(h.id)}
                        aria-label={
                          language === 'en'
                            ? `Remove ${h.name} from selection`
                            : `Bỏ chọn ${h.name}`
                        }
                        className="ml-0.5 rounded-full p-0.5 text-[#747D88] hover:bg-[#F0EEE8] hover:text-[#181A17] cursor-pointer transition-colors"
                      >
                        <X size={11} aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                  {selectedHorses.length >= 2 && (
                    <button
                      type="button"
                      onClick={() => setHorseQuantities({})}
                      className="ml-auto text-[11.5px] font-semibold text-[#A67C2E] hover:text-[#8C6621] hover:underline cursor-pointer"
                    >
                      {language === 'en' ? 'Clear all' : 'Bỏ chọn tất cả'}
                    </button>
                  )}
                </div>
              )}

              {/* Bounded Scrollable Table with Sticky Header */}
              <div className="overflow-x-auto max-h-[380px] overflow-y-auto rounded-xl border border-[#E5DDD0] w-full">
                <table className="w-full min-w-[650px] border-collapse text-left">
                  <thead className="sticky top-0 z-10 bg-[#FAF8F4] shadow-[0_1px_0_#E5DDD0]">
                    <tr>
                      <th className="py-2.5 px-3 w-11" />
                      <th className="py-2.5 px-3 text-[11px] font-bold uppercase tracking-wider text-[#5F6977] whitespace-nowrap">
                        {t('customer.newRequest.horse', 'Horse')}
                      </th>
                      <th className="py-2.5 px-3 text-[11px] font-bold uppercase tracking-wider text-[#5F6977] whitespace-nowrap">
                        {t('customer.table.breed', 'Breed')}
                      </th>
                      <th className="py-2.5 px-3 text-[11px] font-bold uppercase tracking-wider text-[#5F6977] whitespace-nowrap">
                        {t('customer.newRequest.ageHandling', 'Tuổi / Lưu ý')}
                      </th>
                      <th className="py-2.5 px-3 text-[11px] font-bold uppercase tracking-wider text-[#5F6977] whitespace-nowrap">
                        {t('customer.newRequest.medicalStatus', 'Medical Status')}
                      </th>
                      <th className="py-2.5 px-3 text-[11px] font-bold uppercase tracking-wider text-[#5F6977] text-right whitespace-nowrap">
                        {t('customer.newRequest.profile', 'Profile')}
                      </th>
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
                    ) : filteredHorses.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-[#5F6977]">
                          {horseSearch.trim() ? (
                            <div className="space-y-3">
                              <p className="text-sm font-semibold text-[#181A17] m-0">
                                {language === 'en'
                                  ? `No horses match "${horseSearch.trim()}".`
                                  : `Không tìm thấy ngựa phù hợp với "${horseSearch.trim()}".`}
                              </p>
                              <button
                                type="button"
                                onClick={() => setHorseSearch('')}
                                className="px-3.5 py-1.5 rounded-lg border border-[#D8CEBE] bg-white hover:border-[#B49A68] text-xs font-semibold text-[#181A17] cursor-pointer transition-colors"
                              >
                                {language === 'en' ? 'Clear search' : 'Xóa từ khóa'}
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <p className="text-sm font-semibold text-[#181A17] m-0">
                                {language === 'en'
                                  ? 'No horses are currently ready for transport (all are busy or scheduled).'
                                  : 'Hiện không có ngựa nào sẵn sàng vận chuyển (tất cả đang bận hoặc đã lên lịch).'}
                              </p>
                              <div className="flex flex-wrap items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setHorseFilter('all')}
                                  className="px-3.5 py-1.5 rounded-lg border border-[#D8CEBE] bg-white hover:border-[#B49A68] text-xs font-semibold text-[#181A17] cursor-pointer transition-colors"
                                >
                                  {language === 'en'
                                    ? `Show all (${sortedHorses.length})`
                                    : `Xem tất cả (${sortedHorses.length})`}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsAddHorseModalOpen(true)}
                                  className="px-3.5 py-1.5 rounded-lg bg-[#181A17] text-[#FAF8F4] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                  <Plus size={13} aria-hidden="true" />{' '}
                                  {t('customer.newRequest.addNewHorseBtn', 'Thêm ngựa mới')}
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredHorses.map(({ horse: h, activeOrder, isInTransit, isScheduled, isUnavailable }) => {
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
                            <td className="py-2 px-3 text-center">
                              <label
                                className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center cursor-pointer select-none"
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
                                    width: '17px',
                                    height: '17px',
                                    cursor: isUnavailable ? 'not-allowed' : 'pointer',
                                    accentColor: '#A67C2E',
                                  }}
                                />
                              </label>
                            </td>
                            <td className="py-2.5 px-3 font-bold text-[#181A17]">
                              <div className="flex items-center gap-2.5">
                                <div
                                  className="w-9 h-9 rounded-full overflow-hidden bg-[#F0EEE8] border-2 border-white shadow-xs shrink-0 flex items-center justify-center"
                                >
                                  <img
                                    src={getFullPhotoUrl(h.photoUrl) || HORSE_PLACEHOLDER_SVG}
                                    alt={h.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      const img = e.currentTarget as HTMLImageElement;
                                      if (img.src !== HORSE_PLACEHOLDER_SVG) img.src = HORSE_PLACEHOLDER_SVG;
                                    }}
                                  />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[13px] font-bold text-[#181A17] leading-snug">{h.name}</div>
                                  {isSelected && Number(h.quantity ?? 1) > 1 && (
                                    <label className="mt-1.5 flex items-center gap-2 text-xs font-medium">
                                      {language === 'en' ? 'Horses' : 'Số ngựa'}
                                      <input
                                        type="number"
                                        min={1}
                                        max={h.quantity}
                                        step={1}
                                        value={horseQuantities[h.id]}
                                        aria-label={language === 'en' ? `Horse count for ${h.name}` : `Số ngựa từ hồ sơ ${h.name}`}
                                        onChange={(e) => {
                                          const quantity = Number(e.target.value);
                                          if (Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= Number(h.quantity)) {
                                            setHorseQuantities((previous) => ({ ...previous, [h.id]: quantity }));
                                          }
                                        }}
                                        className="w-20 rounded border border-[#D8CEBE] px-2 py-1 text-xs"
                                      />
                                      / {h.quantity}
                                    </label>
                                  )}
                                  {isInTransit ? (
                                    <div className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded bg-[#F5EFE2] text-[#8C6621] text-[11px] font-bold">
                                      <Truck size={11} aria-hidden="true" />
                                      <span>{t('customer.newRequest.inTransitStatus', 'In Transit ({code})').replace('{code}', orderCode || 'REQ-001')}</span>
                                    </div>
                                  ) : isScheduled ? (
                                    <div className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded bg-[#D8CEBE] text-[#242722] text-[11px] font-bold">
                                      <Clock size={11} aria-hidden="true" />
                                      <span>{t('customer.newRequest.scheduledStatus', 'Scheduled ({code})').replace('{code}', orderCode || 'REQ-002')}</span>
                                    </div>
                                  ) : (
                                    <div className="text-[11px] font-semibold text-[#287653] mt-0.5 flex items-center gap-1.5">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#287653] inline-block" />
                                      {t('customer.newRequest.readyStatus', 'Ready for transit')}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-[13px] text-[#3F443D] whitespace-nowrap">
                              {translateBreed(h.breed)}
                            </td>
                            <td className="py-2.5 px-3 text-[13px] text-[#3F443D] whitespace-nowrap">
                              {h.age} {t('horses.yearsOld', 'years old')}{h.requiresPrivateStall ? ` • ${t('horses.privateStallShort', 'Chuồng riêng')}` : ''}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span
                                className="inline-block whitespace-nowrap px-2 py-0.5 rounded-md text-[11px] font-bold"
                                style={{
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
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <Link href={`/customer/horses/${h.id}`} target="_blank" className="text-xs text-[#A67C2E] hover:underline font-semibold whitespace-nowrap">
                                {t('customer.newRequest.viewProfile', 'View Profile ↗')}
                              </Link>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {filteredHorses.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[#5F6977]">
                  <span>
                    {language === 'en'
                      ? `Showing ${filteredHorses.length} / ${sortedHorses.length} horses`
                      : `Đang hiển thị ${filteredHorses.length} / ${sortedHorses.length} ngựa`}
                  </span>
                  {horseFilter === 'available' && sortedHorses.length > availableHorsesCount && (
                    <button
                      type="button"
                      onClick={() => setHorseFilter('all')}
                      className="font-semibold text-[#A67C2E] hover:text-[#8C6621] hover:underline cursor-pointer"
                    >
                      {language === 'en'
                        ? `Show ${sortedHorses.length - availableHorsesCount} unavailable / busy horses`
                        : `Hiện thêm ${sortedHorses.length - availableHorsesCount} ngựa đang bận`}
                    </button>
                  )}
                </div>
              )}
              <div className="rounded-xl border border-[#E5DDD0] bg-[#FAF8F4] px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs text-[#5F6977]">
                  <span className="font-semibold text-[#181A17]">
                    {language === 'en' ? 'Selected Booking Type:' : 'Hình thức đã chọn:'}
                  </span>{' '}
                  <span className="font-bold text-[#8C6621]">
                    {bookingType === 'dedicated_charter'
                      ? (language === 'en' ? 'Dedicated Charter' : 'Bao nguyên xe (Dedicated Charter)')
                      : (language === 'en' ? 'Shared Stall' : 'Ghép ô chuồng (Shared Stall)')}
                  </span>
                  {totalSelectedHorses >= 3 && bookingType === 'shared_stall' && (
                    <span className="block sm:inline sm:ml-2 text-[#181A17]">
                      · {language === 'en'
                        ? `With ${totalSelectedHorses} horses selected, Dedicated Charter is often more convenient.`
                        : `Với ${totalSelectedHorses} ngựa đã chọn, Bao nguyên xe sẽ tối ưu hơn.`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {totalSelectedHorses >= 3 && bookingType === 'shared_stall' ? (
                    <button
                      type="button"
                      onClick={() => setBookingType('dedicated_charter')}
                      className="px-3 py-1.5 rounded-lg bg-[#181A17] text-[#C4B38E] text-xs font-semibold cursor-pointer hover:bg-[#2A2D27] transition-colors"
                    >
                      {language === 'en' ? 'Switch to Dedicated Charter' : 'Chuyển sang Bao nguyên xe'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setBookingType(bookingType === 'shared_stall' ? 'dedicated_charter' : 'shared_stall')
                      }
                      className="px-3 py-1.5 rounded-lg border border-[#D8CEBE] bg-white hover:border-[#B49A68] text-xs font-semibold text-[#181A17] cursor-pointer transition-colors"
                    >
                      {bookingType === 'shared_stall'
                        ? (language === 'en' ? 'Switch to Charter' : 'Đổi sang Bao nguyên xe')
                        : (language === 'en' ? 'Switch to Shared Stall' : 'Đổi sang Ghép ô chuồng')}
                    </button>
                  )}
                </div>
              </div>
              {selectedHorses.length > 0 && <InsuranceSelection horses={selectedHorses} values={insuranceValues}
                onChange={(id, value) => { setInsuranceValues(previous => ({ ...previous, [id]: value })); setInsuranceError(''); }}
                policy={policy ?? null} error={policyError ? (language === 'en' ? 'Unable to load insurance policy.' : 'Chưa tải được chính sách bảo hiểm.') : insuranceError} onRetry={() => void reloadPolicy()} />}
            </div>
          </div>
        )}

        {/* STEP 3: REVIEW & SUBMIT */}
        {currentStep === 3 && (
          <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-sm">
            <div className="px-6 py-4 bg-white border-b border-[#EFEAE0]">
              <h2 className="text-base font-extrabold text-[#181A17] m-0">
                {t('customer.newRequest.reviewTitle', 'Review & Submit Request')}
              </h2>
              <p className="text-xs text-[#5F6977] mt-1 mb-0">
                {t('customer.newRequest.reviewDesc', 'Please review your shipment parameters carefully before submitting to the operations team.')}
              </p>
            </div>

            <div className="p-5 sm:p-7 flex flex-col gap-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-[#FAF8F4] border border-[#E5DDD0] p-3.5 rounded-xl">
                  <span className="text-[11px] text-[#5F6977] uppercase font-bold block">
                    {t('customer.newRequest.summaryTitle', 'Request Title')}
                  </span>
                  <div className="font-bold text-sm text-[#181A17] mt-1">
                    {formValues.title || (language === 'en' ? 'Untitled Request' : 'Yêu cầu vận chuyển')}
                  </div>
                </div>
                <div className="bg-[#FAF8F4] border border-[#E5DDD0] p-3.5 rounded-xl">
                  <span className="text-[11px] text-[#5F6977] uppercase font-bold block">
                    {t('customer.newRequest.summaryRoute', 'Route')}
                  </span>
                  <div className="font-bold text-sm text-[#181A17] mt-1">
                    {translateCountry(formValues.origin)} → {translateCountry(formValues.destination)}
                  </div>
                </div>
                <div className="bg-[#FAF8F4] border border-[#E5DDD0] p-3.5 rounded-xl">
                  <span className="text-[11px] text-[#5F6977] uppercase font-bold block">
                    {t('customer.newRequest.summaryDepartureDate', 'Departure Date')}
                  </span>
                  <div className="font-bold text-sm text-[#181A17] mt-1">{formValues.departureDate}</div>
                </div>
              </div>

              {/* Route & Multimodal Logistics Summary */}
              {routeData && (
                <div className="bg-[#FAF8F4] p-4 sm:p-5 rounded-xl border border-[#D8CEBE] flex flex-col gap-3.5">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-[#E5DDD0] text-[#181A17] flex items-center justify-center shrink-0">
                        <Navigation size={18} aria-hidden="true" />
                      </div>
                      <div>
                        <div className="text-[13.5px] font-bold text-[#181A17]">
                          {t('customer.newRequest.routePrefix', 'Lộ trình:')}{' '}
                          {routeData.mode === 'air'
                            ? t('customer.newRequest.routeAir', 'Đa phương thức: Xe thùng + Hàng không')
                            : t('customer.newRequest.routeRoad', 'Xe thùng đường bộ')}
                        </div>
                        <div className="text-xs text-[#5F6977]">
                          {t('customer.newRequest.distance', 'Quãng đường:')}{' '}
                          <strong className="text-[#181A17]">{routeData.distanceKm.toLocaleString()} km</strong> •{' '}
                          {t('customer.newRequest.estimatedTime', 'Thời gian ước tính:')}{' '}
                          <strong className="text-[#181A17]">
                            ~{routeData.durationHours} {t('customer.newRequest.hours', 'giờ')}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {routeData.legs && routeData.legs.length > 0 && (
                    <div className="pt-3 border-t border-dashed border-[#D8CEBE] space-y-2">
                      {routeData.legs.map((leg) => (
                        <div
                          key={`${leg.sequenceNo}-${leg.type}`}
                          className="flex items-center justify-between gap-2 text-xs bg-white border border-[#E5DDD0] rounded-lg px-3 py-2 flex-wrap"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-[#181A17] shrink-0">
                              {language === 'en' ? `Leg ${leg.sequenceNo}` : `Chặng ${leg.sequenceNo}`}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${
                                leg.type === 'air'
                                  ? 'bg-[#181A17] text-[#C4B38E]'
                                  : 'bg-[#F5EFE2] text-[#8C6621] border border-[#DFCA9A]'
                              }`}
                            >
                              {leg.type === 'air' ? (
                                <Plane size={11} aria-hidden="true" />
                              ) : (
                                <Truck size={11} aria-hidden="true" />
                              )}
                              <span>{language === 'en' ? leg.vehicleLabelEn : leg.vehicleLabelVi}</span>
                            </span>
                            <span className="text-[#181A17] font-medium truncate">
                              {leg.fromName} <span className="text-[#A67C2E]">→</span> {leg.toName}
                            </span>
                          </div>
                          <span className="text-[#5F6977] font-semibold shrink-0">
                            ~{leg.distanceKm.toLocaleString()} km · ~{leg.durationHours}h
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
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
          className="mx-auto w-full max-w-[850px] space-y-4 rounded-2xl border border-[#E5DDD0] bg-white p-5 sm:p-6 shadow-sm"
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
          {insuranceError && <p role="alert" className="text-sm text-[#B33E3E]">{insuranceError}</p>}
        </section>
      )}

      {/* STICKY BOTTOM ACTION BAR (stays clear of Sidebar) */}
      <div
        className="sticky bottom-0 z-20 mx-auto w-full max-w-[850px] rounded-2xl border border-[#E5DDD0] bg-white/95 px-5 py-3.5 shadow-[0_-6px_20px_rgba(24,26,23,0.06)] backdrop-blur-sm flex items-center justify-between gap-3 flex-wrap"
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
              className="px-5 py-2.5 rounded-xl border border-[#D8CEBE] bg-white hover:border-[#B49A68] text-xs font-semibold text-[#181A17] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A67C2E]"
            >
              {t('common.back', 'Back')}
            </button>
          )}

          {currentStep < 3 ? (
            <button
              type="button"
              onClick={handleContinue}
              className="px-5 py-2.5 rounded-xl bg-[#181A17] hover:bg-[#2A2D27] text-[#FBF9F5] text-xs font-bold inline-flex items-center gap-2 cursor-pointer shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4B38E]"
            >
              {t('customer.newRequest.continueBtn', 'Continue')} <ArrowRight size={15} className="text-[#C4B38E]" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (isSubmitting) return;
                handleSubmit(onSubmitForm)();
              }}
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl bg-[#287653] hover:bg-[#205F43] disabled:bg-[#8892A0] text-white text-xs font-bold inline-flex items-center gap-2 shadow-sm transition-colors cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#287653]"
            >
              {isSubmitting ? (
                <>
                  {t('customer.newRequest.submitting', 'Submitting...')} <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                </>
              ) : (
                <>
                  {t('customer.newRequest.submitBtn', 'Submit Request')} <Check size={15} strokeWidth={2.5} aria-hidden="true" />
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
          setHorseSearch('');
          setHorseFilter('available');
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
