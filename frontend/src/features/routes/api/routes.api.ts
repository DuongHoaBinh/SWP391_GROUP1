import { apiClient } from '@/lib/api-client';

export type PlanStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'confirmed'
  | 'ready_to_depart'
  | 'in_transit'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export interface AirlineItem {
  id: number;
  code: string;
  name: string;
  cargoServiceName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  isActive: boolean;
}

export interface AirportItem {
  id: number;
  iataCode: string;
  icaoCode: string | null;
  name: string;
  city: string;
  country: string;
  hasQuarantineFacility: boolean;
  hasEquineCargoRamp: boolean;
  lat: number | null;
  lng: number | null;
}

export interface MasterStopItem {
  id: number;
  name: string;
  stopType: 'rest' | 'quarantine' | 'refuel' | 'border_check';
  address: string | null;
  city: string | null;
  country: string;
  hasVeterinarian: boolean;
  hasStalls: boolean;
  lat: number | null;
  lng: number | null;
}

export interface RouteLegItem {
  id?: number;
  sequenceNo: number;
  legType: 'road' | 'flight';
  originLocation: string;
  destinationLocation: string;
  distanceKm?: number | null;
  durationHours?: number | null;
  plannedDeparture?: string | null;
  plannedArrival?: string | null;
  vehicleId?: number | null;
  vehiclePlate?: string | null;
  airlineId?: number | null;
  airlineName?: string | null;
  flightNumber?: string | null;
  departureAirportId?: number | null;
  departureAirportCode?: string | null;
  arrivalAirportId?: number | null;
  arrivalAirportCode?: string | null;
  bookingReference?: string | null;
  stallsBooked?: number;
  status?: string;
}

export interface RouteStopItem {
  id?: number;
  sequenceNo: number;
  legSequenceNo?: number;
  stopType: 'rest' | 'quarantine' | 'refuel' | 'border_check';
  locationName: string;
  country?: string | null;
  plannedArrival?: string | null;
  plannedDeparture?: string | null;
  status?: string;
}

export interface RouteDetail {
  id: number;
  shipmentId: number;
  routeName: string | null;
  totalDistanceKm: number | null;
  status: string;
  planStatus: PlanStatus;
  assignedCoordinatorId?: number | null;
  assignedCoordinatorName?: string | null;
  managerVehicleType?: string | null;
  managerAirlineId?: number | null;
  managerAirlineName?: string | null;
  managerDepartureAirportId?: number | null;
  managerDepartureAirportCode?: string | null;
  managerArrivalAirportId?: number | null;
  managerArrivalAirportCode?: string | null;
  managerMainCorridor?: string | null;
  strategicNotes?: string | null;
  rejectionReason?: string | null;
  approvedBy?: number | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  legs?: RouteLegItem[];
  stops?: RouteStopItem[];
}

export interface TripPlanReadiness {
  shipmentId: number;
  orderCode: string;
  isPlanConfirmed: boolean;
  isLegalCompliant: boolean;
  isReadyToDepart: boolean;
  currentShipmentStatus: string;
  currentPlanStatus: PlanStatus | string;
  pendingConditions: string[];
}

export const routesApi = {
  getMasterData: async (): Promise<{
    airlines: AirlineItem[];
    airports: AirportItem[];
    masterStops: MasterStopItem[];
  }> => {
    return apiClient('/routes/master-data');
  },

  getRouteByShipmentId: async (shipmentId: number): Promise<RouteDetail> => {
    return apiClient(`/routes/shipment/${shipmentId}`);
  },

  getFullTripPlan: async (shipmentId: number): Promise<any> => {
    return apiClient(`/routes/shipment/${shipmentId}/plan`);
  },

  // Step 1a: Manager sets strategic framework
  setStrategicFramework: async (
    shipmentId: number,
    data: {
      assignedCoordinatorId?: number;
      managerVehicleType: string;
      managerAirlineId?: number;
      managerDepartureAirportId?: number;
      managerArrivalAirportId?: number;
      managerMainCorridor?: string;
      strategicNotes?: string;
    }
  ): Promise<RouteDetail> => {
    return apiClient(`/routes/plan/${shipmentId}/strategic-framework`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Step 1b: Coordinator builds detailed plan
  buildDetailedPlan: async (
    shipmentId: number,
    data: {
      routeName: string;
      totalDistanceKm?: number;
      legs: RouteLegItem[];
      stops: RouteStopItem[];
    }
  ): Promise<RouteDetail> => {
    return apiClient(`/routes/plan/${shipmentId}/build-detail`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Coordinator submits plan for approval
  submitPlanForApproval: async (shipmentId: number): Promise<RouteDetail> => {
    return apiClient(`/routes/plan/${shipmentId}/submit`, {
      method: 'POST',
    });
  },

  // Step 2: Manager reviews plan
  reviewTripPlan: async (
    shipmentId: number,
    data: {
      status: 'approved' | 'rejected';
      rejectionReason?: string;
    }
  ): Promise<RouteDetail> => {
    return apiClient(`/routes/plan/${shipmentId}/review`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Step 3: Driver confirms assignment
  confirmTripAssignment: async (
    shipmentId: number,
    data: { confirmationNotes?: string } = {}
  ): Promise<{ success: boolean; message: string; isFullyConfirmed: boolean }> => {
    return apiClient(`/routes/plan/${shipmentId}/driver-confirm`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Step 3 (Decline): Driver / Escort declines assignment with reason
  declineTripAssignment: async (
    shipmentId: number,
    data: { reason: string }
  ): Promise<{ success: boolean; message: string }> => {
    return apiClient(`/routes/plan/${shipmentId}/driver-decline`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Step 4: Ready to Depart Gate
  getTripPlanReadiness: async (shipmentId: number): Promise<TripPlanReadiness> => {
    return apiClient(`/routes/plan/${shipmentId}/readiness`);
  },
};
