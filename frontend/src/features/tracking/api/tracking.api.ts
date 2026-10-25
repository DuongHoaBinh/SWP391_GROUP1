import { apiClient } from '@/lib/api-client';

export interface TrackingMilestoneItem {
  id: string;
  itemType: 'leg_start' | 'stop' | 'leg_end';
  legId: number;
  stopId?: number | null;
  seq: number;
  title: string;
  location: string;
  status: 'PENDING' | 'CURRENT' | 'COMPLETED';
  plannedTime: string | null;
  actualTime: string | null;
  isCustomsBorder: boolean;
  legType: 'road' | 'flight';
  responsibleRole: 'driver' | 'escort';
  notes: string | null;
  updatedBy: string | null;
  allowedActions: string[];
}

export interface HorseHealthLogItem {
  id: number;
  shipmentId: number;
  horseId: number | null;
  horseName: string;
  recordedBy: number;
  recordedByName?: string;
  recordedByRole?: string;
  conditionStatus: 'stable' | 'not_eating' | 'stressed' | 'climate_change' | 'other';
  conditionStatusVi?: string;
  temperatureC: number | null;
  heartRateBpm: number | null;
  vehicleTemperatureC: number | null;
  notes: string | null;
  attachments: string[];
  recordedAt: string;
}

export interface TripStatusLogItem {
  id: number;
  shipmentId: number;
  routeId: number;
  legId: number | null;
  routeStopId: number | null;
  previousStatus: string | null;
  newStatus: string;
  milestoneType: string;
  milestoneName: string;
  notes: string | null;
  updatedBy: number;
  updatedByName?: string;
  updatedByRole: string;
  createdAt: string;
  occurredAt: string;
}

export interface TripTrackingDetails {
  shipmentId: number;
  requestCode: string;
  requestTitle?: string;
  customerName: string;
  origin: string;
  destination: string;
  shipmentStatus: string;
  routePlanStatus: string;
  currentMilestone: string;
  eta: string | null;
  totalDistanceKm: number | null;
  assignedVehicle: string | null;
  assignedDriver: string | null;
  assignedEscort: string | null;
  assignedHorses: Array<{ id: number; name: string; breed?: string; microchipNo?: string }>;
  milestones: TrackingMilestoneItem[];
  healthLogs: HorseHealthLogItem[];
  latestHorseHealth: HorseHealthLogItem[];
  healthLogsPagination: { page: number; pageSize: number; total: number; totalPages: number };
  telemetry: { vehicleTemperatureC: number | null; recordedAt: string | null };
  alerts: Array<{ type: 'horse_fever' | 'vehicle_temperature'; message: string; value: number; recordedAt: string; horseId?: number }>;
  checkIns: Array<{ id: number; routeStopId: number; status: string; actualTime: string; createdAt: string; updatedBy: number; notes: string | null }>;
  statusLogs: TripStatusLogItem[];
  lastUpdated: string;
}

export interface AssignedTripSummary {
  shipment_id: number;
  request_code: string;
  request_title?: string;
  contact_name: string;
  origin_location: string;
  destination_location: string;
  shipment_status: string;
  requested_date: string;
  requested_horse_count: number;
  route_id: number;
  route_name: string;
  route_plan_status: string;
  total_distance_km: number | null;
  role_in_shipment?: string;
  is_confirmed?: boolean | number;
}

export const trackingApi = {
  startShipment: (shipmentId: number, data: { notes?: string } = {}): Promise<TripTrackingDetails> =>
    apiClient(`/tracking/shipments/${shipmentId}/start`, { method: 'POST', body: JSON.stringify(data) }),

  getHealthLogs: (shipmentId: number, page = 1, pageSize = 10, horseId?: number): Promise<HealthLogPage> =>
    apiClient(`/tracking/shipments/${shipmentId}/health-logs?page=${page}&pageSize=${pageSize}${horseId ? `&horseId=${horseId}` : ''}`),
  getMyTrips: async (): Promise<AssignedTripSummary[]> => {
    return apiClient<AssignedTripSummary[]>('/tracking/my-trips');
  },

  getTrackingDetails: async (shipmentId: number): Promise<TripTrackingDetails> => {
    return apiClient<TripTrackingDetails>(`/tracking/shipments/${shipmentId}`);
  },

  checkInLegStart: async (
    shipmentId: number,
    legId: number,
    data: { actualTime?: string; notes?: string } = {},
  ): Promise<TripTrackingDetails> => {
    return apiClient<TripTrackingDetails>(`/tracking/shipments/${shipmentId}/legs/${legId}/start`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  checkInStop: async (
    shipmentId: number,
    stopId: number,
    data: { action: 'arrived' | 'departed' | 'customs_cleared'; actualTime?: string; notes?: string; vehicleTemperatureC?: number },
  ): Promise<TripTrackingDetails> => {
    return apiClient<TripTrackingDetails>(`/tracking/shipments/${shipmentId}/checkin`, {
      method: 'POST',
      body: JSON.stringify({ ...data, routeStopId: stopId }),
    });
  },

  checkInLegArrival: async (
    shipmentId: number,
    legId: number,
    data: { actualTime?: string; notes?: string } = {},
  ): Promise<TripTrackingDetails> => {
    return apiClient<TripTrackingDetails>(`/tracking/shipments/${shipmentId}/legs/${legId}/complete`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  coordinatorOverride: async (
    shipmentId: number,
    data: { milestoneId: string; action: string; actualTime?: string; notes?: string; reason?: string },
  ): Promise<TripTrackingDetails> => {
    return apiClient<TripTrackingDetails>(`/tracking/shipments/${shipmentId}/coordinator-override`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  createHealthLog: async (
    shipmentId: number,
    data: {
      horseId: number;
      horseName?: string;
      conditionStatus: 'stable' | 'not_eating' | 'stressed' | 'climate_change' | 'other';
      temperatureC?: number;
      heartRateBpm?: number;
      vehicleTemperatureC?: number;
      notes?: string;
      attachments?: string[];
    },
  ): Promise<HorseHealthLogItem> => {
    return apiClient<HorseHealthLogItem>(`/tracking/shipments/${shipmentId}/health-logs`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  completeShipment: async (
    shipmentId: number,
    data?: { notes?: string },
  ): Promise<{ success: boolean; message: string }> => {
    return apiClient<{ success: boolean; message: string }>(`/tracking/shipments/${shipmentId}/complete`, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  },
};

export interface HealthLogPage {
  items: HorseHealthLogItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
