export enum RouteStatus {
  PLANNED = 'planned',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum PlanStatus {
  DRAFT = 'draft',
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  CONFIRMED = 'confirmed',
  READY_TO_DEPART = 'ready_to_depart',
  IN_TRANSIT = 'in_transit',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum LegType {
  ROAD = 'road',
  FLIGHT = 'flight',
}

export enum RouteStopType {
  REST = 'rest',
  QUARANTINE = 'quarantine',
  REFUEL = 'refuel',
  BORDER_CHECK = 'border_check',
  OTHER = 'other',
}

export enum RouteStopStatus {
  PENDING = 'pending',
  ARRIVED = 'arrived',
  CLEARED = 'cleared',
  DEPARTED = 'departed',
}

export enum RouteStopUpdateStatus {
  DEPARTED = 'departed',
  ARRIVED = 'arrived',
  CUSTOMS_CLEARED = 'customs_cleared',
  DELIVERED = 'delivered',
}

export interface AirlineEntity {
  id: number;
  code: string;
  name: string;
  cargoServiceName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  isActive: boolean;
}

export interface AirportEntity {
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

export interface MasterStopEntity {
  id: number;
  name: string;
  stopType: RouteStopType;
  address: string | null;
  city: string | null;
  country: string;
  hasVeterinarian: boolean;
  hasStalls: boolean;
  lat: number | null;
  lng: number | null;
}

export interface RouteStopEntity {
  id: number;
  routeId: number;
  legId?: number | null;
  sequenceNo: number;
  stopType: RouteStopType;
  locationName: string;
  country: string | null;
  plannedArrival: string | null;
  plannedDeparture: string | null;
  status: RouteStopStatus;
}

export interface RouteStopUpdateEntity {
  id: number;
  routeStopId: number;
  updatedBy: number;
  actualArrival: string | null;
  actualDeparture: string | null;
  status: RouteStopUpdateStatus;
  notes: string | null;
  createdAt: string;
}

export interface RouteLegEntity {
  id: number;
  routeId: number;
  sequenceNo: number;
  legType: LegType;
  originLocation: string;
  destinationLocation: string;
  distanceKm: number | null;
  durationHours: number | null;
  plannedDeparture: string | null;
  plannedArrival: string | null;
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
  status: 'pending' | 'active' | 'completed';
  stops?: RouteStopEntity[];
}

export interface RouteEntity {
  id: number;
  shipmentId: number;
  routeName: string | null;
  totalDistanceKm: number | null;
  status: RouteStatus;
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
  stops?: RouteStopEntity[];
  legs?: RouteLegEntity[];
  activeIncident?: {
    id: number;
    incidentType: string;
    description: string;
    severity: string;
    status: string;
    reportedAt: string;
  } | null;
}

export interface FullTripPlan {
  order: any;
  route: RouteEntity | null;
  assignedVehicles: any[];
  assignedStaff: any[];
  totalCapacity: number;
  isReadyToPublish: boolean;
  missingRequirements: string[];
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
