export enum LegStatus {
  PENDING = 'pending',
  DEPARTED = 'departed',
  IN_TRANSIT = 'in_transit',
  ARRIVED = 'arrived',
  COMPLETED = 'completed',
}

export enum StopStatus {
  PENDING = 'pending',
  ARRIVED = 'arrived',
  DEPARTED = 'departed',
  CUSTOMS_CLEARED = 'customs_cleared',
}

export enum HorseConditionStatus {
  STABLE = 'stable',
  NOT_EATING = 'not_eating',
  STRESSED = 'stressed',
  CLIMATE_CHANGE = 'climate_change',
  OTHER = 'other',
}

export enum MilestoneAction {
  LEG_DEPART = 'leg_depart',
  STOP_ARRIVE = 'stop_arrive',
  STOP_DEPART = 'stop_depart',
  STOP_CUSTOMS_CLEAR = 'stop_customs_clear',
  LEG_ARRIVE = 'leg_arrive',
}

export interface CheckInLegDto {
  actualTime?: string;
  notes?: string;
}

export interface CheckInStopDto {
  action: 'arrived' | 'departed' | 'customs_cleared';
  actualTime?: string;
  notes?: string;
}

export interface CoordinatorOverrideDto {
  milestoneId: string;
  action: string;
  actualTime?: string;
  notes?: string;
}

export interface CreateHealthLogDto {
  horseId?: number;
  horseName: string;
  conditionStatus: HorseConditionStatus;
  temperatureC?: number;
  heartRateBpm?: number;
  notes?: string;
  attachments?: string[];
}

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

export interface HorseHealthLogEntity {
  id: number;
  shipmentId: number;
  horseId: number | null;
  horseName: string;
  recordedBy: number;
  recordedByName?: string;
  recordedByRole?: string;
  conditionStatus: HorseConditionStatus;
  conditionStatusVi?: string;
  temperatureC: number | null;
  heartRateBpm: number | null;
  notes: string | null;
  attachments: string[];
  recordedAt: string;
}

export interface TripStatusLogEntity {
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
  healthLogs: HorseHealthLogEntity[];
  statusLogs: TripStatusLogEntity[];
  lastUpdated: string;
}
