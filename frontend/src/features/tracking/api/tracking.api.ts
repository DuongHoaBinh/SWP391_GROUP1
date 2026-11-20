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
  legName?: string | null;
  recordedBy: number;
  recordedByName?: string;
  recordedByRole?: string;
  conditionStatus: 'stable' | 'not_eating' | 'stressed' | 'climate_change' | 'other';
  conditionStatusVi?: string;
  temperatureC: number | null;
  heartRateBpm: number | null;
  alertTier?: 'green' | 'amber_observational' | 'amber_escalatable' | 'red';
  alertReason?: string | null;
  notes: string | null;
  attachments: string[];
  recordedAt: string;
}

export interface EquineVitalConfigItem {
  configId?: number;
  configName: string;
  tempGreenMin: number;
  tempGreenMax: number;
  tempAmberLowMin: number;
  tempAmberHighMax: number;
  hrGreenMin: number;
  hrGreenMax: number;
  hrAmberLowMin: number;
  hrAmberHighMax: number;
  consecutiveAlertWindowHours: number;
  escalatableConditions: string[];
  observationalConditions: string[];
  calibratedBy?: string | null;
  updatedAt?: string;
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
}

export interface TripTrackingDetails {
  shipmentId: number;
  requestCode: string;
  customerRequestCode?: string;
  requestTitle?: string;
  customerName: string;
  origin: string;
  destination: string;
  shipmentStatus: string;
  routePlanStatus: string;
  currentMilestone: string;
  consolidatedRouteSummary?: string | null;
  eta: string | null;
  totalDistanceKm: number | null;
  assignedVehicle: string | null;
  assignedDriver: string | null;
  assignedEscort: string | null;
  assignedHorses: Array<{
    id: number;
    shipmentHorseId?: number;
    name: string;
    breed?: string;
    microchipNo?: string;
    passportNo?: string;
  }>;
  milestones: TrackingMilestoneItem[];
  healthLogs: HorseHealthLogItem[];
  statusLogs: TripStatusLogItem[];
  lastUpdated: string;
}

export interface DeliveryHandoverItem {
  id: number;
  shipmentId: number;
  requestCode: string;
  shipmentHorseId: number;
  horseId: number | null;
  horseName: string;
  microchipNo: string | null;
  passportNo: string | null;
  insurancePackage: string;
  maxCompensation: number;
  emergencyVetCovered: boolean;
  handedOverBy: number;
  handedOverByName?: string;
  receivedByName: string;
  handoverLocation: string | null;
  handoverDatetime: string;
  deliveredQuantity: number;
  horseConditionAtHandover: 'healthy' | 'minor_issue' | 'needs_attention';
  identityVerified: boolean;
  documentsHandedOver: boolean;
  customerSignatureUrl: string | null;
  evidenceUrls: string[];
  notes: string | null;
  disputeReason: string | null;
  status: 'pending' | 'confirmed' | 'disputed';
  confirmedBy: number | null;
  confirmedAt: string | null;
  resolutionNotes: string | null;
  compensationAmount: number;
  resolvedBy: number | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface AssignedTripSummary {
  shipment_id: number;
  request_code: string;
  customer_request_code?: string;
  system_request_code?: string;
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
    data: { action: 'arrived' | 'departed' | 'customs_cleared'; actualTime?: string; notes?: string },
  ): Promise<TripTrackingDetails> => {
    return apiClient<TripTrackingDetails>(`/tracking/shipments/${shipmentId}/stops/${stopId}/status`, {
      method: 'POST',
      body: JSON.stringify(data),
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

  getVitalConfig: async (): Promise<EquineVitalConfigItem> => {
    return apiClient<EquineVitalConfigItem>('/tracking/vital-config');
  },

  updateVitalConfig: async (data: Partial<EquineVitalConfigItem>): Promise<EquineVitalConfigItem> => {
    return apiClient<EquineVitalConfigItem>('/tracking/vital-config', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  uploadHealthPhotos: async (shipmentId: number, files: File[]): Promise<{ files: string[] }> => {
    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }
    return apiClient<{ files: string[] }>(`/tracking/shipments/${shipmentId}/health-logs/upload`, {
      method: 'POST',
      body: formData,
    });
  },

  createHealthLog: async (
    shipmentId: number,
    data: {
      horseId?: number;
      horseName: string;
      legName?: string;
      conditionStatus: 'stable' | 'not_eating' | 'stressed' | 'climate_change' | 'other';
      temperatureC?: number;
      heartRateBpm?: number;
      notes?: string;
      attachments?: string[];
      recordedAt?: string;
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

  getShipmentHandovers: async (shipmentId: number): Promise<DeliveryHandoverItem[]> => {
    return apiClient<DeliveryHandoverItem[]>(`/tracking/shipments/${shipmentId}/handovers`);
  },

  listHandovers: async (status?: string): Promise<DeliveryHandoverItem[]> => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return apiClient<DeliveryHandoverItem[]>(`/tracking/handovers${qs}`);
  },

  createHandover: async (
    shipmentId: number,
    payload: {
      shipmentHorseId: number;
      receivedByName: string;
      handoverLocation?: string;
      deliveredQuantity?: number;
      horseConditionAtHandover?: 'healthy' | 'minor_issue' | 'needs_attention';
      identityVerified?: boolean;
      documentsHandedOver?: boolean;
      notes?: string;
      files?: File[];
    },
  ): Promise<DeliveryHandoverItem> => {
    const fd = new FormData();
    fd.append('shipmentHorseId', String(payload.shipmentHorseId));
    fd.append('receivedByName', payload.receivedByName);
    if (payload.handoverLocation) fd.append('handoverLocation', payload.handoverLocation);
    if (payload.deliveredQuantity) fd.append('deliveredQuantity', String(payload.deliveredQuantity));
    if (payload.horseConditionAtHandover) fd.append('horseConditionAtHandover', payload.horseConditionAtHandover);
    if (payload.identityVerified !== undefined) fd.append('identityVerified', String(payload.identityVerified));
    if (payload.documentsHandedOver !== undefined) fd.append('documentsHandedOver', String(payload.documentsHandedOver));
    if (payload.notes) fd.append('notes', payload.notes);
    for (const file of payload.files || []) {
      fd.append('files', file);
    }
    return apiClient<DeliveryHandoverItem>(`/tracking/shipments/${shipmentId}/handovers`, {
      method: 'POST',
      body: fd,
    });
  },

  respondHandover: async (
    handoverId: number,
    payload: {
      action: 'confirm' | 'dispute';
      disputeReason?: string;
      notes?: string;
      files?: File[];
    },
  ): Promise<DeliveryHandoverItem> => {
    const fd = new FormData();
    fd.append('action', payload.action);
    if (payload.disputeReason) fd.append('disputeReason', payload.disputeReason);
    if (payload.notes) fd.append('notes', payload.notes);
    for (const file of payload.files || []) {
      fd.append('files', file);
    }
    return apiClient<DeliveryHandoverItem>(`/tracking/handovers/${handoverId}/respond`, {
      method: 'POST',
      body: fd,
    });
  },

  resolveHandoverDispute: async (
    handoverId: number,
    data: { resolutionNotes: string; compensationAmount?: number },
  ): Promise<DeliveryHandoverItem> => {
    return apiClient<DeliveryHandoverItem>(`/tracking/handovers/${handoverId}/resolve-dispute`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};
