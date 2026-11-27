export enum LegStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
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

export interface LocationInput {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  source?: 'gps' | 'simulated' | 'manual' | 'override';
}

export interface CheckInLegDto {
  actualTime?: string;
  notes?: string;
  location?: LocationInput;
  manualReason?: string | null;
  evidenceUrl?: string | null;
}

export interface CheckInStopDto {
  action: 'arrived' | 'departed' | 'customs_cleared';
  actualTime?: string;
  notes?: string;
  location?: LocationInput;
  manualReason?: string | null;
  evidenceUrl?: string | null;
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
  legName?: string;
  conditionStatus: HorseConditionStatus;
  temperatureC?: number;
  heartRateBpm?: number;
  respiratoryRate?: number;
  routeStopId?: number;
  notes?: string;
  attachments?: string[];
  recordedAt?: string;
  location?: LocationInput;
}

export interface PositionPingItem {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  speedKmh?: number | null;
  headingDeg?: number | null;
  source: 'gps' | 'simulated';
  recordedAt: string;
}

export interface PositionPingBatchDto {
  pings: PositionPingItem[];
}

export interface PositionPingResult {
  accepted: number;
  skipped: number;
  dropped?: number;
  shipmentId?: number;
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
  legType: 'road' | 'flight' | 'sea';
  responsibleRole: 'driver' | 'escort';
  notes: string | null;
  updatedBy: string | null;
  allowedActions: string[];
  lat?: number | null;
  lng?: number | null;
  locationSource?: string | null;
  distanceToStopM?: number | null;
  geofencePassed?: boolean | null;
  flagged?: boolean;
  manualReason?: string | null;
  evidenceUrl?: string | null;
}

export interface HorseHealthLogEntity {
  id: number;
  shipmentId: number;
  horseId: number | null;
  horseName: string;
  legName?: string | null;
  recordedBy: number;
  recordedByName?: string;
  recordedByRole?: string;
  conditionStatus: HorseConditionStatus;
  conditionStatusVi?: string;
  temperatureC: number | null;
  heartRateBpm: number | null;
  respiratoryRateBpm?: number | null;
  routeStopId?: number | null;
  lat?: number | null;
  lng?: number | null;
  locationSource?: string | null;
  alertTier?: 'green' | 'amber_observational' | 'amber_escalatable' | 'red';
  alertReason?: string | null;
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
  isBackdated?: boolean;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  locationSource?: string | null;
  distanceToStopM?: number | null;
  geofencePassed?: boolean | null;
  manualReason?: string | null;
  evidenceUrl?: string | null;
  flagged?: boolean;
  eventTime?: string;
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
  healthLogs: HorseHealthLogEntity[];
  statusLogs: TripStatusLogEntity[];
  tripType?: string;
  returnStatus?: string | null;
  returnDepartureAt?: string | null;
  returnWaitMinutes?: number;
  returnNoShow?: boolean;
  lastUpdated: string;
}

export interface LiveVehiclePosition {
  lat: number;
  lng: number;
  recordedAt: string;
  source: 'gps' | 'simulated';
  speedKmh?: number | null;
  headingDeg?: number | null;
  accuracyM?: number | null;
  isBackdated?: boolean;
}

export interface LivePathPoint {
  lat: number;
  lng: number;
  t?: string;
  recordedAt?: string;
  source?: string;
}

export interface LiveTrackingLeg {
  legId: number;
  sequenceNo?: number;
  direction?: 'outbound' | 'return';
  type?: 'road' | 'flight' | 'sea';
  legType?: string;
  originLocation?: string;
  destinationLocation?: string;
  status: string;
  polyline?: Array<[number, number]>;
  polylineJson?: string | null;
  actualDeparture?: string | null;
  actualArrival?: string | null;
}

export interface LiveTrackingStop {
  stopId?: number;
  routeStopId?: number;
  sequenceNo?: number;
  name?: string;
  locationName?: string;
  type?: string;
  stopType?: string;
  lat: number | null;
  lng: number | null;
  status: string;
  plannedArrival?: string | null;
  actualArrival?: string | null;
  actualDeparture?: string | null;
  etaAt?: string | null;
  geofenceRadiusM?: number | null;
}

export interface LiveTrackingProgress {
  completedKm?: number;
  totalKm?: number;
  percent: number;
}

export interface LiveTrackingVitalsItem {
  horseId: number;
  horseName: string;
  conditionStatus?: HorseConditionStatus;
  temperatureC?: number | null;
  heartRateBpm?: number | null;
  respiratoryRate?: number | null;
  respiratoryRateBpm?: number | null;
  alertTier: 'green' | 'amber_observational' | 'amber_escalatable' | 'red';
  alertReason?: string | null;
  recordedAt: string | null;
  message?: string;
}

export interface LiveTrackingDetails {
  shipmentId: number;
  requestCode?: string;
  status: string;
  simulation?: boolean;
  isSimulated?: boolean;
  simulationEnabled?: boolean;
  vehicle?: LiveVehiclePosition | null;
  vehiclePosition?: LiveVehiclePosition | null;
  path: LivePathPoint[];
  legs: LiveTrackingLeg[];
  stops: LiveTrackingStop[];
  progress?: LiveTrackingProgress;
  progressPct?: number;
  currentLegId?: number | null;
  currentStopId?: number | null;
  etaFinalAt?: string | null;
  estimatedArrival?: string | null;
  vitalsSummary?: LiveTrackingVitalsItem[];
  latestVitals?: LiveTrackingVitalsItem[];
}

export interface LiveOverviewItem {
  shipmentId: number;
  requestCode: string;
  status: string;
  customerName?: string;
  driverName?: string | null;
  vehiclePlate?: string | null;
  origin?: string;
  originLocation?: string;
  destination?: string;
  destinationLocation?: string;
  assignedDriver?: string | null;
  assignedVehicle?: string | null;
  horsesCount?: number;
  currentMilestone?: string | null;
  latestPosition?: LiveVehiclePosition | null;
  latestAlertTier?: 'green' | 'amber' | 'red' | null;
  alertTier?: 'green' | 'amber' | 'red';
  alertCount?: number;
  hasFlaggedCheckIn?: boolean;
  isSimulated: boolean;
  lastPingAgoSeconds?: number | null;
  etaFinalAt?: string | null;
}

export interface TrackingSystemSettings {
  geofence?: {
    defaultRadiusM: number;
    largeSiteRadiusM: number;
    bufferAccuracyM: number;
    maxAccuracyM: number;
  };
  geofenceRadiusDefaultM?: number;
  geofenceRadiusLargeSiteM?: number;
  simulationEnabled: boolean;
  customerVitalsDetail: boolean;
}

export type TimelineStatus = 'done' | 'current' | 'upcoming' | 'skipped' | 'failed';
export type TimelineKind =
  | 'payment'
  | 'approval'
  | 'documents'
  | 'pickup'
  | 'depot'
  | 'rest'
  | 'border'
  | 'quarantine'
  | 'airport'
  | 'seaport'
  | 'transfer'
  | 'delivery'
  | 'handover'
  | 'return_start'
  | 'no_show'
  | 'refund'
  | 'other';

export interface TimelineVitalBadge {
  horseName: string;
  tier: 'green' | 'amber_observational' | 'amber_escalatable' | 'red';
  text: string;
}

export interface TimelinePhoto {
  url: string;
  alt: string;
}

export interface TimelineItemDto {
  id: string;
  milestoneId?: string | null;
  legId?: number | null;
  stopId?: number | null;
  group: 'pre_trip' | 'outbound' | 'return' | 'post_trip';
  kind: TimelineKind;
  title: string;
  subtitle?: string;
  status: TimelineStatus;
  plannedAt?: string | null;
  actualAt?: string | null;
  delayMinutes?: number | null;
  progressPercent?: number;
  locationSource?: 'gps' | 'simulated' | 'manual' | 'override' | null;
  flagged?: boolean;
  vitals?: TimelineVitalBadge[];
  photos?: TimelinePhoto[];
  actorLabel?: string;
  note?: string;
}

export interface ShipmentTimelineResponse {
  shipmentId: number;
  requestCode: string;
  status: string;
  tripType: 'one_way' | 'round_trip';
  returnStatus?: string;
  progressPercent: number;
  etaFinalAt?: string | null;
  items: TimelineItemDto[];
}
