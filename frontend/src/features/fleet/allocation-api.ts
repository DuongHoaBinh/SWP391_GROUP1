import { apiClient } from '@/lib/api-client';

/** Step 9: giờ cấm xe tải nội đô, tham số nghỉ dọc đường, xe đã giữ chỗ của đơn. */

export interface TimeWindow {
  from: string;
  to: string;
}

export interface CityRestrictionRule {
  id: number;
  city: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  appliesToHeavyTruck: boolean;
  bannedFrom: string;
  bannedTo: string;
  daysOfWeek: number[];
  legalReference: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  isDemoData: boolean;
  isActive: boolean;
}

export interface CityRestrictionException {
  id: number;
  city: string;
  exceptionDate: string;
  bannedFrom: string;
  bannedTo: string;
  note?: string | null;
}

export interface CityRestrictionList {
  rules: CityRestrictionRule[];
  exceptions: CityRestrictionException[];
  disclaimerVi: string;
}

export interface CityRestrictionCheck {
  date: string;
  timezone: string;
  heavy: boolean;
  restricted: boolean;
  cities: string[];
  allowedWindows: TimeWindow[];
  holidayExceptions: CityRestrictionException[];
  legalReferences: string[];
  isDemoData: boolean;
  messageVi: string | null;
}

export interface JourneyRules {
  maxDriveHoursBeforeRest: number;
  restMinutes: number;
  maxJourneyHours: number;
  mandatoryRestHours: number;
  nightWindow: TimeWindow;
}

export type CityRestrictionInput = Omit<CityRestrictionRule, 'id' | 'effectiveFrom' | 'effectiveTo'> & {
  effectiveFrom: string;
  effectiveTo?: string | null;
};

export interface ShipmentReservation {
  reservationId: number;
  vehicleId: number;
  plate: string | null;
  capacity: number;
  classCode: string | null;
  depotName: string | null;
  direction: 'outbound' | 'return';
  startAt: string;
  endAt: string;
  status: 'active' | 'released' | 'consumed';
  releasedReason: string | null;
}

export interface ShipmentAllocation {
  shipmentId: number;
  optionCode: string | null;
  pickupAt: string | null;
  nightSurchargeApplied: boolean;
  snapshot: {
    label?: string;
    extraDays?: number;
    pickupShifted?: boolean;
    etaHours?: number;
    restStops?: number;
    vehicles?: Array<{ classCode: string; className?: string; count: number; depotName: string; deadheadKm: number }>;
    overrides?: Array<{ fromVehicleId: number; toVehicleId: number; reason: string; by: number; at: string }>;
  } | null;
  reservations: ShipmentReservation[];
}

export const checkCityRestriction = (lat: number, lng: number, date: string, heavy = true) =>
  apiClient<CityRestrictionCheck>(
    `/fleet/city-restrictions/check?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&date=${encodeURIComponent(date)}&heavy=${heavy}`,
  );

export const listCityRestrictions = () => apiClient<CityRestrictionList>('/fleet/city-restrictions');

export const createCityRestriction = (body: CityRestrictionInput) =>
  apiClient<CityRestrictionRule>('/fleet/city-restrictions', { method: 'POST', body: JSON.stringify(body) });

export const updateCityRestriction = (id: number, body: CityRestrictionInput) =>
  apiClient<CityRestrictionRule>(`/fleet/city-restrictions/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const createCityException = (body: Omit<CityRestrictionException, 'id'>) =>
  apiClient<CityRestrictionException>('/fleet/city-restrictions/exceptions', { method: 'POST', body: JSON.stringify(body) });

export const deleteCityException = (id: number) =>
  apiClient<{ success: boolean }>(`/fleet/city-restrictions/exceptions/${id}`, { method: 'DELETE' });

export const getJourneyRules = () => apiClient<JourneyRules>('/system-settings/journey-rules');

export const updateJourneyRules = (body: JourneyRules) =>
  apiClient<JourneyRules>('/system-settings/journey-rules', { method: 'PATCH', body: JSON.stringify(body) });

export const getShipmentAllocation = (shipmentId: number) =>
  apiClient<ShipmentAllocation>(`/fleet/shipments/${shipmentId}/reservations`);

export const swapReservedVehicle = (shipmentId: number, body: { fromVehicleId: number; toVehicleId: number; reason: string }) =>
  apiClient<ShipmentAllocation>(`/fleet/shipments/${shipmentId}/reservations/swap`, { method: 'POST', body: JSON.stringify(body) });
