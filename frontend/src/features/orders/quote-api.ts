import { apiClient } from '@/lib/api-client';

export interface QuoteLeg {
  key: string;
  type?: string;
  direction?: 'outbound' | 'return';
  from: string;
  to: string;
  distanceKm: number;
  durationHours: number;
  source: 'ors' | 'estimated' | 'table';
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
  }>;
  freight: {
    lines: FreightLine[];
    subtotal: number;
    rounding: number;
    total: number;
  };
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
  quoteId: number;
  expiresAt: string;
  transportMode: 'road' | 'air' | 'sea';
  seaMode?: 'ferry' | 'vessel' | null;
  tripType?: 'one_way' | 'round_trip';
  returnDepartureAt?: string | null;
  legs: QuoteLeg[];
  requiredStallSlots: number;
  options: QuoteOption[];
  recommendedOptionCode: string;
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
  transportMode: 'road' | 'air' | 'sea';
  seaMode?: 'ferry' | 'vessel' | null;
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
