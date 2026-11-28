'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  Ship,
} from 'lucide-react';
import { AddressAutocompleteInput } from '@/components/ui/AddressAutocompleteInput';
import { normalizeVietnamese, resolveLocation, type GeocodedLocation, type RouteLegPreview } from '@/lib/geo-corridors';
import { useCustomerStore, getFullPhotoUrl } from '@/lib/customer-store';
import { requestQuote, type QuoteResult } from '@/features/orders/quote-api';
import { QuoteBreakdown } from '@/features/orders/components/QuoteBreakdown';
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
import { type BookingType } from '@/features/orders/booking-policy';
import { defaultInsurance, insuranceNames, previewInsurance, type InsuranceInput, type InsurancePolicy } from '@/features/orders/insurance-policy';
import { RequirementChecklist } from '@/features/documents/components/RequirementChecklist';
import { fetchComplianceRequirements, type ComplianceRequirementsResponse } from '@/features/documents/requirements-api';
import { HorseDocumentUploadModal } from '@/features/documents/components/HorseDocumentVault';
import { SepayPaymentModal } from '@/features/orders/components/SepayPaymentModal';

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
  const preselectedHorseIdsParam = searchParams.get('horseIds');

  const { horses, requests, refreshHorses, refreshRequests } = useCustomerStore();

  useEffect(() => {
    void refreshHorses();
    void refreshRequests();
  }, [refreshHorses, refreshRequests]);

  // Helper to find any active (in-progress) transport order for this horse (from real /orders/my-orders)
  const getHorseActiveOrder = useCallback((horse: Horse) => {
    return requests.find((r) => {
      const match =
        String(r.horseId) === String(horse.id) ||
        String(r.horse?.id) === String(horse.id) ||
        (horse.backendId && String(r.horseId) === String(horse.backendId)) ||
        (r.horses && r.horses.some((h: any) => String(h.horse?.id) === String(horse.id) || String(h.horseId) === String(horse.id) || String(h.id) === String(horse.id))) ||
        (r.horse?.name && horse.name && r.horse.name.toLowerCase().trim() === horse.name.toLowerCase().trim());

      const st = String(r.status || '').toUpperCase();
      const rawSt = String(r.statusLabel || '').toLowerCase();
      const isFinished =
        st === 'COMPLETED' ||
        st === 'CANCELLED' ||
        st === 'REJECTED' ||
        ['completed', 'cancelled', 'cancelled_operational', 'rejected', 'refunded'].includes(rawSt);
      return match && !isFinished;
    });
  }, [requests]);

  // Step state (1 to 4)
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddHorseModalOpen, setIsAddHorseModalOpen] = useState(false);
  const [createdOrderForPayment, setCreatedOrderForPayment] = useState<{
    id: number;
    requestCode: string;
    totalCost: number;
    paymentDueAt?: string | null;
    createdAt?: string | null;
  } | null>(null);

  const defaultDepartureStr = getDateOffsetString(6);

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
    mode: 'air' | 'road' | 'sea';
    isDomestic?: boolean;
    estimatedTotalPriceVnd?: number;
    legs?: RouteLegPreview[];
    seaUnavailableNotice?: { vi: string; en: string } | null;
  } | null>(null);
  const lastScopeRef = useRef<'Domestic' | 'International' | null>('International');

  const handleRouteCalculated = useCallback(
    (data: {
      distanceKm: number;
      durationHours: number;
      mode: 'air' | 'road' | 'sea';
      isDomestic: boolean;
      estimatedTotalPriceVnd: number;
      legs?: RouteLegPreview[];
      seaUnavailableNotice?: { vi: string; en: string } | null;
    }) => {
      setRouteData(data);
      const detectedType: 'Domestic' | 'International' = data.isDomestic ? 'Domestic' : 'International';
      setValue('transportType', detectedType, { shouldValidate: true });
      if (lastScopeRef.current !== detectedType) {
        lastScopeRef.current = detectedType;
        setTransportMode(detectedType === 'International' ? 'air' : 'road');
      }
    },
    [setValue]
  );

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
  // Bỏ gom chuyến (Step 3, review 11/2026): mọi đơn mới đi xe riêng.
  const bookingType: BookingType = 'dedicated_charter';
  const [insuranceValues, setInsuranceValues] = useState<Record<string, InsuranceInput>>({});
  const [insuranceError, setInsuranceError] = useState('');
  const [demoPaymentAmount, setDemoPaymentAmount] = useState<string>('');
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

  const minLeadDays = cutoffPolicy?.minLeadDays ?? 2;
  const earliestDepartureDate = cutoffPolicy?.earliestDepartureDate ?? getDateOffsetString(minLeadDays);
  const autoSyncedCutoffRef = useRef<string>('');
  const autoSyncedFeasibleRef = useRef<string>('');

  // Auto-select earliest valid departure date on initial load / route policy change
  useEffect(() => {
    if (!earliestDepartureDate) return;
    const isInitialDefault =
      !autoSyncedCutoffRef.current && formValues.departureDate === defaultDepartureStr;
    if (isInitialDefault || !formValues.departureDate || formValues.departureDate < earliestDepartureDate) {
      autoSyncedCutoffRef.current = earliestDepartureDate;
      setValue('departureDate', earliestDepartureDate, { shouldValidate: true });
    }
  }, [earliestDepartureDate, formValues.departureDate, defaultDepartureStr, setValue]);

  const refreshedStep = useRef<number | null>(null);
  const initializedSelection = useRef<string | null>(null);
  useEffect(() => {
    if (refreshedStep.current === currentStep) return;
    refreshedStep.current = currentStep;
    void refreshHorses();
  }, [currentStep, refreshHorses]);

  useEffect(() => {
    const requestedIds = preselectedHorseIdsParam
      ? preselectedHorseIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
      : preselectedHorseId
        ? [preselectedHorseId]
        : [];
    const selectionKey = requestedIds.length > 0 ? requestedIds.join(',') : 'default';
    if (initializedSelection.current === selectionKey) return;
    if (requestedIds.length > 0 && horses.length > 0) {
      const nextQuantities: Record<string, number> = {};
      const skippedNames: string[] = [];
      for (const reqId of requestedIds) {
        const target = horses.find((item) => String(item.id) === String(reqId) || String(item.backendId) === String(reqId));
        if (!target) continue;
        const order = getHorseActiveOrder(target);
        const unavailable =
          Boolean(order) ||
          target.status === 'in_transit' ||
          target.availabilityStatus === 'In Transit' ||
          target.status === 'retired' ||
          target.status === 'deceased';
        if (!unavailable) {
          nextQuantities[target.id] = 1;
        } else {
          skippedNames.push(target.name);
        }
      }
      if (Object.keys(nextQuantities).length > 0) {
        setHorseQuantities(nextQuantities);
      }
      if (skippedNames.length > 0) {
        toast.error(
          language === 'en'
            ? `Unavailable horse(s) skipped: ${skippedNames.join(', ')}.`
            : `Đã bỏ qua ngựa đang bận / không khả dụng: ${skippedNames.join(', ')}.`,
        );
      }
      initializedSelection.current = selectionKey;
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
  }, [preselectedHorseId, preselectedHorseIdsParam, horses, requests, getHorseActiveOrder, language]);

  const selectedHorseIds = Object.keys(horseQuantities).filter((id) => (horseQuantities[id] || 0) > 0);
  const totalSelectedHorses = Object.values(horseQuantities).reduce((sum, q) => sum + (q || 0), 0);

  useEffect(() => {
    setValue('horseCount', Math.max(1, totalSelectedHorses));
  }, [totalSelectedHorses, setValue]);

  const selectedHorses = useMemo(() => {
    return horses
      .filter((h) => (horseQuantities[h.id] || 0) > 0)
      .map((h) => ({
        ...h,
        quantity: horseQuantities[h.id] || 1,
      }));
  }, [horses, horseQuantities]);

  const [transportMode, setTransportMode] = useState<'road' | 'air' | 'sea'>('air');
  const [seaMode] = useState<'vessel'>('vessel');
  const [tripType, setTripType] = useState<'one_way' | 'round_trip'>('one_way');
  const [returnDepartureAt, setReturnDepartureAt] = useState<string>('');
  const [acceptReturnPolicy, setAcceptReturnPolicy] = useState<boolean>(false);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [selectedOptionCode, setSelectedOptionCode] = useState<string>('standard');
  // Giờ đón mong muốn (giờ Việt Nam)
  const [pickupTime, setPickupTime] = useState<string>('08:00');
  const [isQuoteLoading, setIsQuoteLoading] = useState<boolean>(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Auto-shift returnDepartureAt when outbound departureDate or duration changes on round-trip
  useEffect(() => {
    if (tripType !== 'round_trip' || !formValues.departureDate) return;
    const depMs = new Date(`${formValues.departureDate}T${pickupTime || '08:00'}:00`).getTime();
    if (!Number.isFinite(depMs)) return;
    const minReturnMs = depMs + (Number(routeData?.durationHours || 6) + 12) * 3600 * 1000;
    const currentReturnMs = returnDepartureAt ? new Date(returnDepartureAt).getTime() : 0;
    if (!currentReturnMs || !Number.isFinite(currentReturnMs) || currentReturnMs < minReturnMs) {
      const shifted = new Date(minReturnMs + 12 * 3600 * 1000);
      shifted.setMinutes(0, 0, 0);
      const pad = (n: number) => String(n).padStart(2, '0');
      const localIso = `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}T${pad(shifted.getHours())}:00`;
      setReturnDepartureAt(localIso);
    }
  }, [tripType, formValues.departureDate, pickupTime, routeData?.durationHours, returnDepartureAt]);

  // Dynamic country compliance requirements (Step 8)
  const [complianceReqs, setComplianceReqs] = useState<ComplianceRequirementsResponse | null>(null);
  const [isComplianceLoading, setIsComplianceLoading] = useState(false);
  const [submittedLaterKeys, setSubmittedLaterKeys] = useState<Set<string>>(new Set());
  const [uploadModalState, setUploadModalState] = useState<{
    isOpen: boolean;
    horseId: number;
    documentTypeCode?: string;
  }>({ isOpen: false, horseId: 0 });

  const targetCountry = cutoffPolicy?.destinationCountry || formValues.destination || 'Vietnam';
  const selectedHorseNumericIds = useMemo(() => {
    return selectedHorses
      .map((h) => Number(h.backendId || h.id))
      .filter((id) => !isNaN(id) && id > 0);
  }, [selectedHorses]);

  const lastComplianceKeyRef = useRef<string>('');
  const complianceParamsKey = useMemo(() => {
    if (!targetCountry || selectedHorseNumericIds.length === 0 || !formValues.departureDate) {
      return '';
    }
    return [
      targetCountry,
      transportMode,
      selectedHorseNumericIds.slice().sort().join(','),
      formValues.departureDate,
      tripType,
      tripType === 'round_trip' && returnDepartureAt ? returnDepartureAt.slice(0, 10) : '',
    ].join('|');
  }, [
    targetCountry,
    transportMode,
    selectedHorseNumericIds,
    formValues.departureDate,
    tripType,
    returnDepartureAt,
  ]);

  const loadComplianceRequirements = useCallback(async () => {
    if (!targetCountry || selectedHorseNumericIds.length === 0 || !formValues.departureDate) {
      setComplianceReqs(null);
      return;
    }
    setIsComplianceLoading(true);
    try {
      const res = await fetchComplianceRequirements({
        country: targetCountry,
        mode: transportMode,
        horseIds: selectedHorseNumericIds,
        departDate: formValues.departureDate,
        returnDate: tripType === 'round_trip' && returnDepartureAt ? returnDepartureAt.slice(0, 10) : undefined,
      });
      setComplianceReqs(res);
    } catch (err) {
      console.warn('Failed to load compliance requirements:', err);
    } finally {
      setIsComplianceLoading(false);
    }
  }, [targetCountry, transportMode, selectedHorseNumericIds, formValues.departureDate, tripType, returnDepartureAt, setValue]);

  useEffect(() => {
    if (!complianceParamsKey) {
      setComplianceReqs(null);
      lastComplianceKeyRef.current = '';
      return;
    }
    if (lastComplianceKeyRef.current === complianceParamsKey) {
      return;
    }
    lastComplianceKeyRef.current = complianceParamsKey;
    void loadComplianceRequirements();
  }, [complianceParamsKey, loadComplianceRequirements]);

  const fetchQuoteNow = useCallback(async () => {
    if (!formValues.origin || !formValues.destination || !formValues.departureDate || selectedHorses.length === 0) {
      return;
    }

    const originLoc = selectedOriginGeo
      ? { address: formValues.origin, lat: selectedOriginGeo.coords[0], lng: selectedOriginGeo.coords[1], country: selectedOriginGeo.country }
      : (() => {
          const loc = resolveLocation(formValues.origin, 'vn-hcm-cuchi', formValues.transportType === 'Domestic');
          return { address: formValues.origin, lat: loc.coords[0], lng: loc.coords[1], country: loc.country };
        })();

    const destLoc = selectedDestGeo
      ? { address: formValues.destination, lat: selectedDestGeo.coords[0], lng: selectedDestGeo.coords[1], country: selectedDestGeo.country }
      : (() => {
          const loc = resolveLocation(formValues.destination, formValues.transportType === 'Domestic' ? 'vn-hanoi-socson' : 'intl-singapore', formValues.transportType === 'Domestic');
          return { address: formValues.destination, lat: loc.coords[0], lng: loc.coords[1], country: loc.country };
        })();

    setIsQuoteLoading(true);
    setQuoteError(null);
    try {
      const horsePayload = selectedHorses.map((h) => {
        const val = insuranceValues[h.id] ?? defaultInsurance;
        return {
          horseId: Number(h.backendId || h.id || 1),
          quantity: h.quantity || 1,
          declaredValue: Number(val.declaredValue || 0),
          declaredCurrency: val.declaredCurrency || 'VND',
          insurancePackage: val.insurancePackage || 'basic',
        };
      });

      const effectiveReturnDeparture =
        tripType === 'round_trip'
          ? returnDepartureAt
            ? new Date(returnDepartureAt).toISOString()
            : new Date(new Date(formValues.departureDate).getTime() + 72 * 3600 * 1000).toISOString()
          : undefined;

      const res = await requestQuote({
        origin: originLoc,
        destination: destLoc,
        departureDate: formValues.departureDate,
        pickupAt: `${formValues.departureDate}T${pickupTime || '08:00'}`,
        transportMode,
        seaMode: transportMode === 'sea' ? seaMode : undefined,
        tripType,
        returnDepartureAt: effectiveReturnDeparture,
        horses: horsePayload,
      });

      setQuote(res);
      setSelectedOptionCode(res.recommendedOptionCode || res.options[0]?.optionCode || 'default');
      setQuoteError(null);
    } catch (err: any) {
      console.error('Failed to request quote:', err);
      setQuoteError(err?.message || (language === 'en' ? 'Unable to calculate server quote' : 'Không thể tính toán báo giá tự động'));
    } finally {
      setIsQuoteLoading(false);
    }
  }, [
    formValues.origin,
    formValues.destination,
    formValues.departureDate,
    pickupTime,
    formValues.transportType,
    selectedOriginGeo,
    selectedDestGeo,
    transportMode,
    seaMode,
    tripType,
    returnDepartureAt,
    selectedHorses,
    insuranceValues,
    language,
  ]);

  const lastQuoteKeyRef = useRef<string>('');
  const quoteParamsKey = useMemo(() => {
    if (!formValues.origin || !formValues.destination || !formValues.departureDate || selectedHorses.length === 0) {
      return '';
    }
    const horsesKey = selectedHorses.map((h) => `${h.id}:${h.quantity}`).join(',');
    const insuranceKey = selectedHorses.map((h) => {
      const ins = insuranceValues[h.id];
      return `${ins?.declaredValue || 0}:${ins?.insurancePackage || 'basic'}`;
    }).join(',');

    return [
      formValues.origin,
      formValues.destination,
      formValues.departureDate,
      pickupTime,
      transportMode,
      seaMode,
      tripType,
      returnDepartureAt,
      horsesKey,
      insuranceKey,
    ].join('|');
  }, [
    formValues.origin,
    formValues.destination,
    formValues.departureDate,
    pickupTime,
    transportMode,
    seaMode,
    tripType,
    returnDepartureAt,
    selectedHorses,
    insuranceValues,
  ]);

  useEffect(() => {
    if (!quoteParamsKey) {
      setQuote(null);
      lastQuoteKeyRef.current = '';
      return;
    }
    if (lastQuoteKeyRef.current && lastQuoteKeyRef.current !== quoteParamsKey) {
      // Clear stale quote when user edits route, dates, horses, or insurance on earlier steps
      setQuote(null);
    }
    if (currentStep !== 4) {
      return;
    }
    if (lastQuoteKeyRef.current === quoteParamsKey) {
      return;
    }
    const timer = setTimeout(() => {
      lastQuoteKeyRef.current = quoteParamsKey;
      void fetchQuoteNow();
    }, 250);
    return () => clearTimeout(timer);
  }, [currentStep, quoteParamsKey, fetchQuoteNow]);

  const estimatedInsuranceFee = selectedHorses.reduce((sum, h) => {
    const oneWayFee = previewInsurance(insuranceValues[h.id] ?? defaultInsurance, policy ?? null).fee;
    const effectiveFee = tripType === 'round_trip' ? oneWayFee + Math.round(oneWayFee * 0.9) : oneWayFee;
    return sum + effectiveFee * h.quantity;
  }, 0);
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
      ? `Booking deadline: route requires booking at least ${minLeadDays} day(s) ahead (earliest departure: ${earliestDepartureDate}).`
      : `Sát hạn đặt đơn: tuyến này yêu cầu đặt trước tối thiểu ${minLeadDays} ngày (ngày khởi hành sớm nhất: ${earliestDepartureDate}).`;

  const validateStep = async (stepNum: number): Promise<boolean> => {
    if (stepNum === 1) {
      const isValid = await trigger(['origin', 'destination', 'departureDate']);
      if (!isValid) return false;
      if (transportMode === 'sea' && routeData?.seaUnavailableNotice) {
        toast.error(language === 'en' ? routeData.seaUnavailableNotice.en : routeData.seaUnavailableNotice.vi);
        return false;
      }
      if (isDepartureBeforeCutoff(formValues.departureDate)) {
        toast.error(cutoffViolationMessage());
        return false;
      }
      if (tripType === 'round_trip' && !returnDepartureAt) {
        toast.error(language === 'en' ? 'Please select return departure date & time' : 'Vui lòng chọn ngày giờ hẹn đón chặng về');
        return false;
      }
      return true;
    }
    if (stepNum === 2) {
      if (!validateInsurance()) return false;
      if (totalSelectedHorses === 0) {
        toast.error(language === 'en' ? 'Please select at least one horse available for transit.' : 'Vui lòng chọn ít nhất một con ngựa sẵn sàng vận chuyển.');
        return false;
      }
      const invalidSelected = selectedHorses.find((h) => getHorseRowState(h).isUnavailable);
      if (invalidSelected) {
        const activeOrder = getHorseActiveOrder(invalidSelected);
        toast.error(
          activeOrder
            ? (language === 'en' ? `Horse "${invalidSelected.name}" is in order ${activeOrder.requestCode}, cannot create new request.` : `Chiến mã "${invalidSelected.name}" đang trong đơn ${activeOrder.requestCode}, không thể tạo đơn mới.`)
            : (language === 'en' ? `Horse "${invalidSelected.name}" is not available for transit.` : `Chiến mã "${invalidSelected.name}" không khả dụng để vận chuyển.`)
        );
        return false;
      }
      return true;
    }
    if (stepNum === 3) {
      return true;
    }
    return true;
  };

  const handleContinue = async () => {
    const ok = await validateStep(currentStep);
    if (!ok) return;
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleStepClick = async (targetStep: number) => {
    if (targetStep === currentStep) return;
    if (targetStep < currentStep) {
      setCurrentStep(targetStep);
      return;
    }
    for (let s = currentStep; s < targetStep; s++) {
      const ok = await validateStep(s);
      if (!ok) return;
    }
    setCurrentStep(targetStep);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmitForm = async (data: FormData) => {
    if (isSubmitting || !validateInsurance()) return;
    if (quote && !quote.quoteId) {
      toast.error(language === 'en' ? 'No vehicle option for this date. Please pick a suggested date.' : 'Chưa đủ xe cho ngày này. Vui lòng chọn một ngày gợi ý.');
      return;
    }
    if (isDepartureBeforeCutoff(data.departureDate)) {
      toast.error(cutoffViolationMessage());
      return;
    }
    if (tripType === 'round_trip') {
      if (!returnDepartureAt) {
        toast.error(language === 'en' ? 'Please select return departure date & time' : 'Vui lòng chọn ngày giờ đón chặng về');
        return;
      }
      if (!acceptReturnPolicy) {
        toast.error(language === 'en' ? 'Please accept the return policy & no-show terms' : 'Vui lòng đọc và tích đồng ý chính sách hủy chặng về và no-show');
        return;
      }
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

      const deferredDocumentsPayload: Array<{
        horseId: number;
        documentTypeCode: string;
        documentTypeName?: string;
        submitDeadline?: string;
      }> = [];
      if (complianceReqs?.horses) {
        for (const hGroup of complianceReqs.horses) {
          for (const req of hGroup.requirements) {
            const key = `${hGroup.horseId}_${req.documentTypeCode}`;
            const isAlreadyReady =
              req.status === 'reusable' || req.status === 'pending_review' || req.status === 'expiring';
            if (!isAlreadyReady && submittedLaterKeys.has(key)) {
              deferredDocumentsPayload.push({
                horseId: Number(hGroup.horseId),
                documentTypeCode: req.documentTypeCode,
                documentTypeName: req.documentTypeName,
                submitDeadline: req.submitDeadline,
              });
            }
          }
        }
      }

      const rawDemoDigits = demoPaymentAmount.replace(/[^\d]/g, '');
      const parsedDemoPaymentAmount = rawDemoDigits ? Number(rawDemoDigits) : undefined;
      if (rawDemoDigits && (!Number.isFinite(parsedDemoPaymentAmount) || (parsedDemoPaymentAmount ?? 0) < 1000)) {
        toast.error(
          language === 'en'
            ? 'Minimum demo transfer amount is 1,000 VND.'
            : 'Số tiền demo chuyển khoản tối thiểu là 1.000 VNĐ.',
        );
        setIsSubmitting(false);
        return;
      }

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
        transportMode,
        seaMode: transportMode === 'sea' ? seaMode : undefined,
        tripType,
        returnDepartureAt: tripType === 'round_trip' && returnDepartureAt ? new Date(returnDepartureAt).toISOString() : undefined,
        acceptReturnPolicy: tripType === 'round_trip' ? acceptReturnPolicy : undefined,
        quoteId: quote?.quoteId ? Number(quote.quoteId) : undefined,
        optionCode: selectedOptionCode,
        demoPaymentAmount: parsedDemoPaymentAmount,
        specialRequirements: combinedReqs || undefined,
        horses: selectedHorsesData.length > 0 ? selectedHorsesData : undefined,
        deferredDocuments: deferredDocumentsPayload.length > 0 ? deferredDocumentsPayload : undefined,
        // Fallback for single horse if array is not preferred by backend yet
        horseName: selectedHorsesData[0]?.name,
        horseBreed: selectedHorsesData[0]?.breed,
        horseAge: selectedHorsesData[0]?.age,
      };

      const newReq = await apiClient<any>('/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // Refresh horse stock & orders in store
      try {
        await Promise.allSettled([refreshHorses(), refreshRequests()]);
        window.dispatchEvent(new CustomEvent('customer-orders-updated'));
      } catch {}

      const reqCode = newReq.customerRequestCode || newReq.requestCode || `REQ-${String(newReq.id).padStart(3, '0')}`;
      toast.success(
        language === 'en'
          ? `Order ${reqCode} created! Complete payment via VietQR or pay within 12 hours.`
          : `Đã tạo đơn ${reqCode}! Quét mã VietQR để thanh toán ngay hoặc hoàn tất trong vòng 12 giờ.`,
      );
      setIsSubmitting(false);

      if (String(newReq.status || '').toLowerCase() === 'awaiting_payment' && Number(newReq.totalCost) > 0) {
        setCreatedOrderForPayment({
          id: Number(newReq.id),
          requestCode: reqCode,
          totalCost: Number(newReq.totalCost),
          paymentDueAt: newReq.paymentDueAt,
          createdAt: newReq.createdAt,
        });
      } else {
        router.push(`/customer/requests/${newReq.id}`);
      }
    } catch (error: any) {
      console.error('Failed to create request:', error);
      if (
        error?.status === 410 ||
        error?.statusCode === 410 ||
        String(error?.message).toLowerCase().includes('expired') ||
        String(error?.message).toLowerCase().includes('hết hạn')
      ) {
        toast.error(
          language === 'en'
            ? 'Quotation expired (30m limit). A new quote has been generated.'
            : 'Báo giá đã hết hạn (quá 30 phút). Hệ thống đã tự tạo báo giá mới, vui lòng kiểm tra lại.'
        );
        void fetchQuoteNow();
        setIsSubmitting(false);
        return;
      }
      // Step 9: xe trong phương án đã bị khách khác giữ → báo giá lại
      if (error?.status === 409 && /báo giá lại|đã được đặt/i.test(String(error?.message))) {
        toast.error(
          language === 'en'
            ? 'A vehicle in this option was just booked by someone else. A new quote has been generated.'
            : 'Xe trong phương án vừa được khách khác đặt. Hệ thống đã báo giá lại, vui lòng chọn lại phương án.'
        );
        void fetchQuoteNow();
        setIsSubmitting(false);
        return;
      }
      toast.error(error?.message || t('requests.createFailed', 'Gửi yêu cầu vận chuyển thất bại. Vui lòng thử lại.'));
      setIsSubmitting(false);
    }
  };

  const progressPercent = ((currentStep - 1) / 3) * 100;

  const complianceSummary = useMemo(() => {
    if (!complianceReqs) return null;
    let total = 0;
    let ready = 0;
    let deferred = 0;
    let earliestDue: string | null = null;
    let hasPastRecommendedDue = false;
    for (const hg of complianceReqs.horses || []) {
      for (const req of hg.requirements || []) {
        total++;
        const key = `${hg.horseId}_${req.documentTypeCode}`;
        if (req.status === 'reusable' || req.status === 'pending_review' || req.status === 'expiring') {
          ready++;
        } else if (submittedLaterKeys.has(key)) {
          deferred++;
          if (req.submitDeadline && (!earliestDue || req.submitDeadline < earliestDue)) {
            earliestDue = req.submitDeadline;
          }
          if (req.canSubmitLater === false) {
            hasPastRecommendedDue = true;
          }
        }
      }
    }
    return {
      total,
      ready,
      deferred,
      satisfied: ready + deferred,
      remaining: Math.max(0, total - ready - deferred),
      earliestDue,
      hasPastRecommendedDue,
    };
  }, [complianceReqs, submittedLaterKeys]);

  const activeQuoteOption = quote?.options?.find((o) => o.optionCode === (selectedOptionCode || quote.recommendedOptionCode)) || quote?.options?.[0];
  const baseLiveQuoteTotal = quote
    ? (Array.isArray(activeQuoteOption?.vehicleIds)
        ? (activeQuoteOption?.freight?.total ?? 0) + (quote.insurance?.total || 0)
        : quote.total)
    : null;
  const parsedLiveDemoAmount = (() => {
    const digits = demoPaymentAmount.replace(/[^\d]/g, '');
    if (!digits) return null;
    const n = Number(digits);
    return Number.isFinite(n) && n >= 1000 ? n : null;
  })();
  const liveQuoteTotal = parsedLiveDemoAmount ?? baseLiveQuoteTotal;

  return (
    <div className="flex flex-col gap-5 pb-8">
      {/* Compact Editorial Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5DDD0] pb-3">
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#181A17] tracking-tight m-0">
          {language === 'en' ? 'New Transport Order' : 'Tạo Đơn Vận Chuyển Mới'}
        </h1>
        <Link
          href="/customer/requests"
          className="text-xs font-bold text-[#5F6977] hover:text-[#181A17] no-underline"
        >
          ← {language === 'en' ? 'Back to Orders' : 'Quay lại danh sách đơn'}
        </Link>
      </header>

      {/* CLICKABLE PROGRESS STEPPER */}
      <div className="bg-white rounded-2xl border border-[#E5DDD0] p-4 sm:p-5 shadow-sm">
        <div className="max-w-[820px] mx-auto relative">
          <div className="absolute top-4 left-[12.5%] right-[12.5%] h-[2px] bg-[#EFEAE0] z-0">
            <div
              className="h-full bg-[#181A17] transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="grid grid-cols-4 relative z-[1]">
            {[
              { num: 1, label: language === 'en' ? 'Route & Mode' : 'Lộ trình & Lịch' },
              { num: 2, label: language === 'en' ? 'Horses & Insurance' : 'Ngựa & Bảo hiểm' },
              { num: 3, label: language === 'en' ? 'Quarantine Docs' : 'Hồ sơ kiểm dịch' },
              { num: 4, label: language === 'en' ? 'Quotation & Pay' : 'Báo giá & Gửi đơn' },
            ].map((step) => {
              const isPast = step.num < currentStep;
              const isActive = step.num === currentStep;

              return (
                <button
                  key={step.num}
                  type="button"
                  onClick={() => void handleStepClick(step.num)}
                  className="flex flex-col items-center gap-1.5 text-center px-1 bg-transparent border-0 cursor-pointer group focus-visible:outline-none"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      isPast
                        ? 'bg-[#287653] text-white group-hover:scale-105'
                        : isActive
                          ? 'bg-[#181A17] text-[#C4B38E] ring-4 ring-[#C4B38E]/25'
                          : 'bg-white text-[#5F6977] border border-[#D8CEBE] group-hover:border-[#A67C2E]'
                    }`}
                  >
                    {isPast ? <Check size={15} strokeWidth={3} aria-hidden="true" /> : `0${step.num}`}
                  </div>
                  <span className={`text-[11px] sm:text-xs ${isActive ? 'font-bold text-[#181A17]' : 'font-medium text-[#5F6977] group-hover:text-[#181A17]'}`}>
                    {step.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* SINGLE-COLUMN FOCUSED WIZARD LAYOUT (Full width on Steps 1–3; unified summary on Step 4) */}
      <div className="w-full max-w-5xl mx-auto">
      <div className="min-w-0 w-full">
        {/* STEP 1: ROUTE, TRANSPORT MODE & SCHEDULE */}
        {currentStep === 1 && (
          <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-sm">
            <div className="px-6 py-4 bg-white border-b border-[#EFEAE0]">
              <h2 className="text-base font-extrabold text-[#181A17] m-0">
                {language === 'en' ? 'Route, Mode & Schedule' : 'Lộ trình, Phương thức & Lịch trình'}
              </h2>
            </div>

            <div className="p-5 sm:p-7 flex flex-col gap-5">
              {/* 1. Addresses & Route Map (without price) */}
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
                    domesticOnly={false}
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
                    domesticOnly={false}
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

              {/* 2. Transport Mode Selection */}
              <div className="p-4 rounded-xl border border-[#D8CEBE] bg-[#FAF8F4] flex flex-col gap-3">
                <div>
                  <span className="text-xs font-bold text-[#181A17] block mb-1.5 uppercase tracking-wide">
                    {language === 'en' ? 'Transport Mode' : 'Phương thức vận tải'}
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setTransportMode('road')}
                      className={`px-3 py-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        transportMode === 'road'
                          ? 'bg-[#181A17] text-white border-[#181A17] shadow-sm'
                          : 'bg-white text-[#5F6977] border-[#D8CEBE] hover:border-[#181A17]'
                      }`}
                    >
                      <Truck size={15} />
                      <span>{language === 'en' ? 'Road' : 'Đường bộ'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTransportMode('air')}
                      className={`px-3 py-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        transportMode === 'air'
                          ? 'bg-[#181A17] text-white border-[#181A17] shadow-sm'
                          : 'bg-white text-[#5F6977] border-[#D8CEBE] hover:border-[#181A17]'
                      }`}
                    >
                      <Plane size={15} />
                      <span>{language === 'en' ? 'Air Cargo' : 'Hàng không'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTransportMode('sea')}
                      className={`px-3 py-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        transportMode === 'sea'
                          ? 'bg-[#181A17] text-white border-[#181A17] shadow-sm'
                          : 'bg-white text-[#5F6977] border-[#D8CEBE] hover:border-[#181A17]'
                      }`}
                    >
                      <Ship size={15} />
                      <span>{language === 'en' ? 'Sea' : 'Đường thủy'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Interactive Route & Border Checkpoints Map (preview only, pricing shown at Step 4) */}
              <RoutePlanningMap
                originText={formValues.origin}
                destinationText={formValues.destination}
                mode={transportMode}
                seaMode={seaMode}
                tripType={tripType}
                horseCount={Math.max(1, totalSelectedHorses)}
                showPricing={false}
                selectedOriginGeo={selectedOriginGeo}
                selectedDestGeo={selectedDestGeo}
                onRouteCalculated={handleRouteCalculated}
                onRequestModeChange={setTransportMode}
                onApplyPreset={(preset) => {
                  setSelectedOriginGeo(null);
                  setSelectedDestGeo(null);
                  setValue('origin', preset.origin, { shouldValidate: true });
                  setValue('destination', preset.destination, { shouldValidate: true });
                }}
              />

              {/* 3. Trip Type & Schedule */}
              <div className="p-4 rounded-xl border border-[#D8CEBE] bg-[#FAF8F4] flex flex-col gap-4">
                <span className="text-xs font-bold text-[#181A17] uppercase tracking-wide">
                  {language === 'en' ? 'Trip Type & Schedule' : 'Hình thức chuyến & Lịch trình'}
                </span>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTripType('one_way');
                      setReturnDepartureAt('');
                    }}
                    className={`px-3 py-2.5 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
                      tripType === 'one_way'
                        ? 'bg-[#181A17] text-white border-[#181A17] shadow-sm'
                        : 'bg-white text-[#5F6977] border-[#D8CEBE] hover:border-[#181A17]'
                    }`}
                  >
                    {language === 'en' ? 'One-Way' : 'Một Chiều'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTripType('round_trip');
                      if (!returnDepartureAt && formValues.departureDate) {
                        const [yr, mo, dy] = formValues.departureDate.split('-').map(Number);
                        const dep = new Date(yr, (mo || 1) - 1, (dy || 1) + 3, 9, 0, 0, 0);
                        const pad = (n: number) => String(n).padStart(2, '0');
                        setReturnDepartureAt(
                          `${dep.getFullYear()}-${pad(dep.getMonth() + 1)}-${pad(dep.getDate())}T${pad(dep.getHours())}:${pad(dep.getMinutes())}`
                        );
                      }
                    }}
                    className={`px-3 py-2.5 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
                      tripType === 'round_trip'
                        ? 'bg-[#181A17] text-white border-[#181A17] shadow-sm'
                        : 'bg-white text-[#5F6977] border-[#D8CEBE] hover:border-[#181A17]'
                    }`}
                  >
                    {language === 'en' ? 'Round-Trip (-10%)' : 'Khứ Hồi (Giảm 10%)'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-[#E5DDD0]">
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
                      <span className="text-[11.5px] text-[#8C6621] flex items-center gap-1.5 mt-1.5">
                        <Clock size={12} aria-hidden="true" className="shrink-0 text-[#A67C2E]" />
                        <span>
                          {language === 'en' ? (
                            <>Book ≥ <strong>{minLeadDays} days</strong> ahead (from <strong>{earliestDepartureDate}</strong>)</>
                          ) : (
                            <>Đặt trước ≥ <strong>{minLeadDays} ngày</strong> (từ <strong>{earliestDepartureDate}</strong>)</>
                          )}
                        </span>
                      </span>
                    )}
                  </div>

                  <div>
                    <label htmlFor="req-pickup-time" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                      {language === 'en' ? 'Pickup Time' : 'Giờ đón'}
                    </label>
                    <input
                      id="req-pickup-time"
                      type="time"
                      value={pickupTime}
                      onChange={(e) => setPickupTime(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-[#D8CEBE] bg-white text-[#181A17] font-medium text-sm focus:outline-none focus:border-[#A67C2E] focus:ring-2 focus:ring-[#A67C2E]/20 transition-all"
                    />
                  </div>

                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                      {language === 'en' ? 'Estimated Arrival (Auto-calculated)' : 'Dự kiến đến nơi (ước tính tự động)'}
                    </span>
                    <div className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5DDD0] bg-white text-[#181A17] font-semibold text-sm flex items-center justify-between gap-2">
                      <span>{estimatedArrivalDisplay}</span>
                      {routeData && (
                        <span className="text-xs font-medium text-[#5F6977]">
                          (~{routeData.durationHours}{language === 'en' ? 'h' : ' giờ'})
                        </span>
                      )}
                    </div>
                  </div>

                  {tripType === 'round_trip' && (
                    <div>
                      <label htmlFor="req-return-departure-at" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', display: 'block', marginBottom: '6px' }}>
                        {language === 'en' ? 'Return Pickup Date & Time' : 'Ngày giờ hẹn đón chặng về'} <span style={{ color: '#B33E3E' }} aria-hidden="true">*</span>
                      </label>
                      <input
                        id="req-return-departure-at"
                        type="datetime-local"
                        value={returnDepartureAt}
                        min={
                          formValues.departureDate
                            ? (() => {
                                const [yr, mo, dy] = formValues.departureDate.split('-').map(Number);
                                const [hh, mm] = (pickupTime || '08:00').split(':').map(Number);
                                const d = new Date(
                                  new Date(yr, (mo || 1) - 1, dy || 1, hh || 8, mm || 0, 0, 0).getTime() +
                                    (Number(routeData?.durationHours || 6) + 12) * 3600 * 1000
                                );
                                const pad = (n: number) => String(n).padStart(2, '0');
                                return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                              })()
                            : undefined
                        }
                        onChange={(e) => setReturnDepartureAt(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-[#D8CEBE] bg-white text-[#181A17] font-medium text-sm focus:outline-none focus:border-[#A67C2E]"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 4. Special Requirements */}
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
                <table className="w-full min-w-0 border-collapse text-left">
                  <thead className="sticky top-0 z-10 bg-[#FAF8F4] shadow-[0_1px_0_#E5DDD0]">
                    <tr>
                      <th className="py-2.5 px-2 w-9" />
                      <th className="py-2.5 px-2 text-[11px] font-bold uppercase tracking-wider text-[#5F6977]">
                        {t('customer.newRequest.horse', 'Horse')}
                      </th>
                      <th className="py-2.5 px-2 text-[11px] font-bold uppercase tracking-wider text-[#5F6977]">
                        {language === 'en' ? 'Breed & Age' : 'Giống / Tuổi'}
                      </th>
                      <th className="py-2.5 px-2 text-[11px] font-bold uppercase tracking-wider text-[#5F6977]">
                        {t('customer.newRequest.medicalStatus', 'Medical Status')}
                      </th>
                      <th className="py-2.5 px-2 text-[11px] font-bold uppercase tracking-wider text-[#5F6977] text-right whitespace-nowrap">
                        {t('customer.newRequest.profile', 'Profile')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {horses.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: '40px 20px', textAlign: 'center', color: '#5F6977' }}>
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
                        <td colSpan={5} className="px-5 py-8 text-center text-[#5F6977]">
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
                            <td className="py-2 px-2 text-center">
                              <label
                                className="min-h-[32px] min-w-[32px] inline-flex items-center justify-center cursor-pointer select-none"
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
                            <td className="py-2 px-2 font-bold text-[#181A17]">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-8 h-8 rounded-full overflow-hidden bg-[#F0EEE8] border-2 border-white shadow-xs shrink-0 flex items-center justify-center"
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
                                  <div className="text-[12.5px] font-bold text-[#181A17] leading-snug">{h.name}</div>
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
                                    <div className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded bg-[#F5EFE2] text-[#8C6621] text-[10.5px] font-bold">
                                      <Truck size={10} aria-hidden="true" />
                                      <span>{t('customer.newRequest.inTransitStatus', 'In Transit ({code})').replace('{code}', orderCode || 'REQ-001')}</span>
                                    </div>
                                  ) : isScheduled ? (
                                    <div className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded bg-[#D8CEBE] text-[#242722] text-[10.5px] font-bold">
                                      <Clock size={10} aria-hidden="true" />
                                      <span>{t('customer.newRequest.scheduledStatus', 'Scheduled ({code})').replace('{code}', orderCode || 'REQ-002')}</span>
                                    </div>
                                  ) : (
                                    <div className="text-[10.5px] font-semibold text-[#287653] mt-0.5 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#287653] inline-block shrink-0" />
                                      {t('customer.newRequest.readyStatus', 'Ready for transit')}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-2 px-2 text-[12px] text-[#3F443D]">
                              <div className="font-medium text-[#181A17] leading-snug">{translateBreed(h.breed)}</div>
                              <div className="text-[11px] text-[#5F6977]">
                                {h.age} {t('horses.yearsOld', 'years old')}
                              </div>
                            </td>
                            <td className="py-2 px-2">
                              <span
                                className="inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold leading-tight"
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
                                  : (h.medicalStatus || (language === 'en' ? 'Pending Verification' : 'Chưa xác minh'))}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right whitespace-nowrap">
                              <Link href={`/customer/horses/${h.id}`} target="_blank" className="text-[11.5px] text-[#A67C2E] hover:underline font-semibold whitespace-nowrap">
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
              {selectedHorses.length > 0 && <InsuranceSelection horses={selectedHorses} values={insuranceValues}
                onChange={(id, value) => { setInsuranceValues(previous => ({ ...previous, [id]: value })); setInsuranceError(''); }}
                policy={policy ?? null} error={policyError ? (language === 'en' ? 'Unable to load insurance policy.' : 'Chưa tải được chính sách bảo hiểm.') : insuranceError} onRetry={() => void reloadPolicy()}
                isRoundTrip={tripType === 'round_trip'} />}
            </div>
          </div>
        )}

        {/* STEP 3: QUARANTINE & COUNTRY DOCUMENTS */}
        {currentStep === 3 && (
          <section
            aria-label={language === 'en' ? 'Required Documents & Quarantine Checklist' : 'Hồ sơ pháp lý & kiểm dịch theo quốc gia'}
            className="bg-white p-5 sm:p-6 rounded-2xl border border-[#E5DDD0] shadow-sm space-y-4"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[#EFEAE0] pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-extrabold text-base text-[#181A17] m-0">
                  {language === 'en' ? 'Quarantine Documents' : 'Hồ sơ kiểm dịch'}
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-[#FAF8F4] border border-[#E5DDD0] text-[11px] font-semibold text-[#5F6977]">
                  {targetCountry} · {transportMode === 'air' ? (language === 'en' ? 'Air' : 'Hàng không') : transportMode === 'sea' ? (language === 'en' ? 'Sea' : 'Đường thủy') : (language === 'en' ? 'Road' : 'Đường bộ')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void loadComplianceRequirements()}
                className="text-xs font-bold text-[#A67C2E] hover:underline cursor-pointer"
              >
                {language === 'en' ? 'Recheck' : 'Kiểm tra lại'}
              </button>
            </div>

            <RequirementChecklist
              requirements={complianceReqs}
              isLoading={isComplianceLoading}
              submittedLaterKeys={submittedLaterKeys}
              onSelectDepartureDate={(dateStr) => {
                setValue('departureDate', dateStr, { shouldValidate: true });
              }}
              onToggleSubmitLater={(hId, docCode) => {
                const key = `${hId}_${docCode}`;
                setSubmittedLaterKeys((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                });
              }}
              onUploadClick={(hId, docCode) => {
                setUploadModalState({ isOpen: true, horseId: hId, documentTypeCode: docCode });
              }}
            />
          </section>
        )}

        {/* STEP 4: QUOTATION & SUBMIT */}
        {currentStep === 4 && (
          <div className="flex flex-col gap-5">
            <div className="bg-white rounded-2xl border border-[#E5DDD0] overflow-hidden shadow-sm">
              <div className="px-6 py-4 bg-white border-b border-[#EFEAE0]">
                <h2 className="text-base font-extrabold text-[#181A17] m-0">
                  {language === 'en' ? 'Trip Summary' : 'Tóm tắt thông tin chuyến đi'}
                </h2>
              </div>

              <div className="p-5 sm:p-6 flex flex-col gap-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div className="bg-[#FAF8F4] border border-[#E5DDD0] p-3.5 rounded-xl">
                    <span className="text-[11px] text-[#5F6977] uppercase font-bold block">
                      {language === 'en' ? 'Transport Mode' : 'Phương thức'}
                    </span>
                    <div className="font-bold text-sm text-[#181A17] mt-1">
                      {transportMode === 'air'
                        ? language === 'en'
                          ? 'Air Cargo'
                          : 'Hàng không'
                        : transportMode === 'sea'
                          ? language === 'en'
                            ? 'Sea Vessel'
                            : 'Đường thủy'
                          : language === 'en'
                            ? 'Road Truck'
                            : 'Đường bộ'}
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
                    <div className="font-bold text-sm text-[#181A17] mt-1">
                      {formValues.departureDate} · {pickupTime}
                    </div>
                  </div>
                  <div className="bg-[#FAF8F4] border border-[#E5DDD0] p-3.5 rounded-xl">
                    <span className="text-[11px] text-[#5F6977] uppercase font-bold block">
                      {language === 'en' ? 'Trip Type' : 'Hình thức'}
                    </span>
                    <div className="font-bold text-sm text-[#181A17] mt-1">
                      {tripType === 'round_trip'
                        ? language === 'en'
                          ? 'Round-Trip (-10%)'
                          : 'Khứ Hồi (Giảm 10%)'
                        : language === 'en'
                          ? 'One-Way'
                          : 'Một Chiều'}
                    </div>
                  </div>
                </div>

                {routeData && !quote && (
                  <div className="bg-[#FAF8F4] p-4 rounded-xl border border-[#D8CEBE] flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-[#E5DDD0] text-[#181A17] flex items-center justify-center shrink-0">
                        <Navigation size={18} aria-hidden="true" />
                      </div>
                      <div>
                        <div className="text-[13.5px] font-bold text-[#181A17]">
                          {t('customer.newRequest.routePrefix', 'Lộ trình:')}{' '}
                          {routeData.mode === 'air'
                            ? t('customer.newRequest.routeAir', 'Đa phương thức: Xe thùng + Hàng không')
                            : routeData.mode === 'sea'
                              ? language === 'en'
                                ? 'Multimodal: Horse Truck + Sea'
                                : 'Đa phương thức: Xe thùng + Đường thủy'
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
                                    : leg.type === 'sea'
                                      ? 'bg-[#ECFEFF] text-[#0E7490] border border-[#A5F3FC]'
                                      : 'bg-[#F5EFE2] text-[#8C6621] border border-[#DFCA9A]'
                                }`}
                              >
                                {leg.type === 'air' ? (
                                  <Plane size={11} aria-hidden="true" />
                                ) : leg.type === 'sea' ? (
                                  <Ship size={11} aria-hidden="true" />
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
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#5F6977', textTransform: 'uppercase' }}>
                    {t('customer.newRequest.selectedHorsesCount', 'Selected Horses ({count} horses)').replace('{count}', String(totalSelectedHorses))}
                  </span>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                    {selectedHorses.map((h) => {
                      const insVal = insuranceValues[h.id] ?? defaultInsurance;
                      return (
                        <span
                          key={h.id}
                          style={{
                            padding: '5px 12px',
                            borderRadius: '8px',
                            backgroundColor: '#FAF8F4',
                            color: 'var(--primary)',
                            fontSize: '12.5px',
                            fontWeight: 600,
                            border: '1px solid #D8CEBE',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <span>{h.name}{h.quantity > 1 ? ` ×${h.quantity}` : ''}</span>
                          <span style={{ color: '#5F6977', fontSize: '11.5px', fontWeight: 500 }}>
                            · {insuranceNames[insVal.insurancePackage]}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <QuoteBreakdown
                quote={quote}
                isLoading={isQuoteLoading}
                onRefresh={() => void fetchQuoteNow()}
                selectedOptionCode={selectedOptionCode}
                onSelectOptionCode={(code) => setSelectedOptionCode(code)}
                onPickShortageDate={(date) => setValue('departureDate', date, { shouldValidate: true })}
                demoPaymentAmount={demoPaymentAmount}
                onDemoPaymentAmountChange={setDemoPaymentAmount}
              />
              {quoteError && (
                <div className="mt-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-2">
                  <span>{quoteError}</span>
                  <button
                    type="button"
                    onClick={() => void fetchQuoteNow()}
                    className="font-bold underline cursor-pointer"
                  >
                    {language === 'en' ? 'Retry quote' : 'Thử lại'}
                  </button>
                </div>
              )}
              {insuranceError && <p role="alert" className="mt-2 text-sm text-[#B33E3E]">{insuranceError}</p>}
            </div>

            {tripType === 'round_trip' && (
              <section
                aria-label={language === 'en' ? 'Return Policy Agreement' : 'Cam kết chính sách khứ hồi'}
                className="space-y-3 rounded-2xl border border-[#DFCA9A] bg-[#FAF8F4] p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-start gap-2.5 cursor-pointer flex-1 min-w-[240px]">
                    <input
                      type="checkbox"
                      checked={acceptReturnPolicy}
                      onChange={(e) => setAcceptReturnPolicy(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-[#D8CEBE] text-[#A67C2E] focus:ring-[#A67C2E] cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-[#181A17] leading-relaxed">
                      {language === 'en'
                        ? 'I agree to the round-trip cancellation, rescheduling & 120-minute no-show policy.'
                        : 'Tôi đồng ý chính sách hủy, đổi ngày chặng về và quy định chờ tối đa 120 phút (no-show).'}
                    </span>
                  </label>
                </div>

                <details className="text-xs text-[#5F6977]">
                  <summary className="cursor-pointer font-semibold text-[#8C6621] hover:underline select-none">
                    {language === 'en' ? 'View policy terms' : 'Xem điều khoản chi tiết'}
                  </summary>
                  <div className="mt-2.5 p-3 rounded-xl bg-white border border-[#E5DDD0] space-y-1.5 leading-relaxed">
                    <p className="m-0">
                      <strong>{language === 'en' ? 'Discount:' : 'Ưu đãi:'}</strong>{' '}
                      {language === 'en' ? '-10% return freight & return insurance.' : 'Giảm 10% cước và bảo hiểm chặng về.'}
                    </p>
                    <p className="m-0">
                      <strong>{language === 'en' ? 'Cancellation:' : 'Hủy chặng về:'}</strong>{' '}
                      {language === 'en' ? '≥168h: 80% refund · 72–168h: 50% · <72h: 0% (100% insurance refunded).' : '≥168h hoàn 80% · 72–168h hoàn 50% · <72h hoàn 0% (bảo hiểm hoàn 100%).'}
                    </p>
                    <p className="m-0">
                      <strong>{language === 'en' ? 'Reschedule & No-show:' : 'Đổi ngày & No-show:'}</strong>{' '}
                      {language === 'en' ? 'Free ≥168h, 10% fee <168h. Driver waits 120m; no-show forfeits return freight.' : 'Miễn phí ≥168h, phí 10% nếu <168h. Chờ tối đa 120 phút; quá giờ mất cước chặng về.'}
                    </p>
                  </div>
                </details>
              </section>
            )}

            {/* Deferred ("Submit Later") Compliance Commitment Notice */}
            {complianceSummary && complianceSummary.deferred > 0 && (
              <section className="rounded-xl border border-amber-300 bg-amber-50/90 px-4 py-3 flex items-start gap-2.5">
                <AlertCircle size={16} className="text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs text-amber-950 m-0 leading-relaxed">
                  <strong>
                    {language === 'en'
                      ? `${complianceSummary.deferred} document(s) marked "Submit later"`
                      : `Nộp sau ${complianceSummary.deferred} giấy tờ kiểm dịch`}
                  </strong>
                  {' — '}
                  {language === 'en'
                    ? 'upload from Order Detail before departure so Logistics Manager can verify validity and approve.'
                    : 'tải lên tại Chi tiết đơn trước khi xuất phát để Quản lý vận hành kiểm tra thời hạn và phê duyệt.'}
                </p>
              </section>
            )}
          </div>
        )}
      </div>
      </div>

      {/* BOTTOM ACTION BAR (normal flow on mobile & placed cleanly below grid without covering Live Trip Summary) */}
      <div
        className="mt-4 w-full rounded-2xl border border-[#E5DDD0] bg-white px-4 sm:px-5 py-3.5 shadow-[0_-4px_16px_rgba(24,26,23,0.05)] flex items-center justify-between gap-3 flex-wrap"
        style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom, 14px))' }}
      >
        <span className="text-xs font-semibold text-[#5F6977]">
          {language === 'en' ? `Step ${currentStep} of 4` : `Bước ${currentStep} / 4`}
        </span>
        <div className="flex items-center gap-2.5 sm:gap-3 ml-auto">
          {currentStep > 1 && (
            <button
              type="button"
              onClick={handleBack}
              className="px-4 sm:px-5 py-2.5 rounded-xl border border-[#D8CEBE] bg-white hover:border-[#B49A68] text-xs font-semibold text-[#181A17] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A67C2E]"
            >
              {t('common.back', 'Quay lại')}
            </button>
          )}

          {currentStep < 4 ? (
            <button
              type="button"
              onClick={() => void handleContinue()}
              className="px-5 py-2.5 rounded-xl bg-[#181A17] hover:bg-[#2A2D27] text-[#FBF9F5] text-xs font-bold inline-flex items-center gap-2 cursor-pointer shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C4B38E]"
            >
              {t('customer.newRequest.continueBtn', 'Tiếp tục')} <ArrowRight size={15} className="text-[#C4B38E]" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (isSubmitting) return;
                handleSubmit(onSubmitForm)();
              }}
              disabled={isSubmitting || isQuoteLoading || !quote?.quoteId || (tripType === 'round_trip' && (!returnDepartureAt || !acceptReturnPolicy))}
              className="px-5 sm:px-6 py-2.5 rounded-xl bg-[#287653] hover:bg-[#205F43] disabled:bg-[#8892A0] text-white text-xs font-bold inline-flex items-center gap-2 shadow-sm transition-colors cursor-pointer disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#287653]"
            >
              {isSubmitting ? (
                <>
                  {t('customer.newRequest.submitting', 'Đang tạo đơn...')} <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                </>
              ) : (
                <>
                  {language === 'en' ? 'Submit & Pay via VietQR' : 'Gửi đơn & Mở QR thanh toán'} <Check size={15} strokeWidth={2.5} aria-hidden="true" />
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

      <HorseDocumentUploadModal
        isOpen={uploadModalState.isOpen}
        horseId={uploadModalState.horseId}
        defaultTypeCode={uploadModalState.documentTypeCode}
        onClose={() => setUploadModalState((prev) => ({ ...prev, isOpen: false }))}
        onUploaded={() => {
          setUploadModalState((prev) => ({ ...prev, isOpen: false }));
          toast.success(language === 'en' ? 'Document uploaded successfully!' : 'Đã tải giấy tờ lên thành công!');
          void loadComplianceRequirements();
        }}
      />

      {createdOrderForPayment && (
        <SepayPaymentModal
          isOpen={Boolean(createdOrderForPayment)}
          shipmentId={createdOrderForPayment.id}
          requestCode={createdOrderForPayment.requestCode}
          amount={createdOrderForPayment.totalCost}
          paymentDueAt={createdOrderForPayment.paymentDueAt}
          createdAt={createdOrderForPayment.createdAt}
          justCreated
          onClose={() => {
            const targetId = createdOrderForPayment.id;
            setCreatedOrderForPayment(null);
            router.push(`/customer/requests/${targetId}?tab=payment`);
          }}
          onPaid={() => {
            void refreshRequests();
            window.dispatchEvent(new CustomEvent('customer-orders-updated'));
          }}
        />
      )}
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
