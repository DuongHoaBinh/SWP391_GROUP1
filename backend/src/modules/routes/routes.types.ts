export enum RouteStatus {
  PLANNED = 'planned',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
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

export interface RouteStopEntity {
  id: number;
  routeId: number;
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

export interface RouteEntity {
  id: number;
  shipmentId: number;
  routeName: string | null;
  totalDistanceKm: number | null;
  status: RouteStatus;
  createdAt: string;
  stops?: RouteStopEntity[];
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
