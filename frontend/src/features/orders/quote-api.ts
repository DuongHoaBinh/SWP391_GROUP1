import { apiClient } from '@/lib/api-client';

export interface QuoteLeg {
  key: string;
  type?: string;
  direction?: 'outbound' | 'return';
  from: string;
  to: string;
  distanceKm: number;
  durationHours: number;
  source: 'ors' | 'osrm' | 'air' | 'table' | 'estimated';
}

export interface FreightLine {
  code: string;
  label: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  meta?: Record<string, unknown>;
}

export interface ReturnPolicyConfig {
  version: string;
  returnDiscountPercent: number;
  returnInsuranceDiscountPercent: number;
  maxWaitMinutes: number;
  cancellationTiers: Array<{
    minHoursBeforeDeparture: number;
    maxHoursBeforeDeparture: number | null;
    refundPercent: number;
    description: string;
  }>;
  rescheduleFreeHours: number;
  rescheduleLateFeePercent: number;
  disclaimer: string;
}

export interface QuoteOption {
  optionCode: string;
  label: string;
  vehicles: Array<{
    classCode: string;
    className?: string;
    count: number;
    deadheadKm?: number;
    // Step 9: phân bổ xe thật
    capacity?: number;
    depotId?: number;
    depotName?: string;
    isHeavyTruck?: boolean;
    trips?: number;
    plates?: string[];
  }>;
  freight: {
    lines: FreightLine[];
    subtotal: number;
    rounding: number;
    total: number;
  };
  // Step 9 (có khi báo giá phân bổ xe thật)
  labelVi?: string;
  recommended?: boolean;
  vehicleIds?: number[];
  extraDays?: number;
  requestedPickupAt?: string;
  pickupAt?: string;
  pickupShifted?: boolean;
  shiftReasonVi?: string | null;
  nightSurcharge?: boolean;
  deliveryAt?: string;
  etaHours?: number;
  restStops?: number;
  mandatoryRests?: number;
  outboundFreightTotal?: number;
  warnings?: string[];
}

export interface QuoteShortage {
  slots: number;
  suggestedDates: string[];
}

export interface QuoteHorseDetail {
  horseId: number;
  name: string;
  quantity: number;
  declaredValue: number;
  declaredCurrency: string;
  insurancePackage: string;
  insuranceFee: number;
  maxCompensation: number;
}

export interface QuoteResult {
  /** null khi không có phương án xe (Step 9: shortage) */
  quoteId: number | null;
  expiresAt: string;
  transportMode: 'road' | 'air' | 'sea';
  seaMode?: 'vessel' | null;
  tripType?: 'one_way' | 'round_trip';
  returnDepartureAt?: string | null;
  legs: QuoteLeg[];
  requiredStallSlots: number;
  options: QuoteOption[];
  recommendedOptionCode: string | null;
  // Step 9
  requestedPickupAt?: string;
  pickupAt?: string;
  shortage?: QuoteShortage | null;
  jetStallsRequired?: number | null;
  vesselPens?: number | null;
  partnerDepot?: { depotId: number; name: string; country: string; deadheadKm: number } | null;
  outbound?: {
    legs: QuoteLeg[];
    freight: {
      lines: FreightLine[];
      subtotal: number;
      rounding: number;
      total: number;
    };
  };
  return?: {
    legs: QuoteLeg[];
    freight: {
      lines: FreightLine[];
      subtotal: number;
      rounding: number;
      total: number;
    };
  } | null;
  returnFreight?: number;
  returnInsuranceFee?: number;
  insurance: {
    total: number;
    outboundTotal?: number;
    returnTotal?: number;
    horses: QuoteHorseDetail[];
  };
  returnPolicy?: ReturnPolicyConfig | null;
  total: number;
  tariffVersions: Record<string, number>;
  warnings: string[];
}

export interface CreateQuoteRequest {
  origin: { address: string; lat: number; lng: number; country?: string };
  destination: { address: string; lat: number; lng: number; country?: string };
  departureDate: string;
  /** Step 9: 'YYYY-MM-DDTHH:mm' giờ Việt Nam */
  pickupAt?: string;
  transportMode: 'road' | 'air' | 'sea';
  seaMode?: 'vessel' | null;
  tripType?: 'one_way' | 'round_trip';
  returnDepartureAt?: string;
  horses: Array<{
    horseId: number;
    quantity?: number;
    declaredValue?: number;
    declaredCurrency?: 'VND' | 'USD';
    insurancePackage?: 'basic' | 'standard' | 'premium';
  }>;
}

export async function requestQuote(payload: CreateQuoteRequest): Promise<QuoteResult> {
  return apiClient<QuoteResult>('/quotes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
