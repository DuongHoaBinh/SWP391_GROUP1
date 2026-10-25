import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEnum, IsISO8601, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

export class CheckInLegDto {
  @IsOptional() @IsISO8601() @ApiPropertyOptional()
  actualTime?: string;
  @IsOptional() @IsString() @MaxLength(2000) @ApiPropertyOptional()
  notes?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(-30) @Max(70) @ApiPropertyOptional()
  vehicleTemperatureC?: number;
}

export class CheckInStopDto extends CheckInLegDto {
  @IsIn(['arrived', 'departed', 'customs_cleared']) @ApiProperty({ enum: ['arrived', 'departed', 'customs_cleared'] })
  action: 'arrived' | 'departed' | 'customs_cleared';
}

export class ShipmentCheckInDto extends CheckInStopDto {
  @IsInt() @Min(1) @ApiProperty()
  routeStopId: number;
}

export class CoordinatorOverrideDto extends CheckInLegDto {
  @IsString() @Matches(/^(leg-\d+-(start|end)|stop-\d+)$/) @ApiProperty()
  milestoneId: string;
  @IsIn(['start_leg', 'complete_leg', 'arrive_leg', 'arrive_stop', 'depart_stop', 'clear_customs', 'arrived', 'departed', 'customs_cleared']) @ApiProperty()
  action: string;
  @IsString() @MaxLength(1000) @Matches(/\S/) @ApiProperty()
  reason: string;
}

export class CreateHealthLogDto {
  @IsInt() @Min(1) @ApiProperty()
  horseId: number;
  @IsOptional() @IsString() @MaxLength(150) @ApiPropertyOptional()
  horseName?: string;
  @IsEnum(HorseConditionStatus) @ApiProperty({ enum: HorseConditionStatus })
  conditionStatus: HorseConditionStatus;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(20) @Max(50) @ApiPropertyOptional()
  temperatureC?: number;
  @IsOptional() @IsInt() @Min(1) @Max(300) @ApiPropertyOptional()
  heartRateBpm?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(-30) @Max(70) @ApiPropertyOptional()
  vehicleTemperatureC?: number;
  @IsOptional() @IsString() @MaxLength(2000) @ApiPropertyOptional()
  notes?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) @MaxLength(500, { each: true })
  @Matches(/^(https?:\/\/[^\s]+|\/uploads\/[^\s]+)$/, { each: true }) @ApiPropertyOptional({ type: [String] })
  attachments?: string[];
}

export class HealthLogQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) @ApiPropertyOptional({ default: 1 })
  page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) @ApiPropertyOptional({ default: 10 })
  pageSize: number = 10;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @ApiPropertyOptional()
  horseId?: number;
}

export interface HealthLogPage {
  items: HorseHealthLogEntity[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TrackingAlert {
  type: 'vehicle_temperature' | 'horse_fever';
  message: string;
  value: number;
  recordedAt: string;
  horseId?: number;
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
  vehicleTemperatureC: number | null;
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
  healthLogs: HorseHealthLogEntity[];
  latestHorseHealth: HorseHealthLogEntity[];
  healthLogsPagination: Omit<HealthLogPage, 'items'>;
  alerts: TrackingAlert[];
  telemetry: { vehicleTemperatureC: number | null; recordedAt: string | null };
  checkIns: Array<{ id: number; routeStopId: number; status: string; actualTime: string; createdAt: string; updatedBy: number; notes: string | null }>;
  statusLogs: TripStatusLogEntity[];
  lastUpdated: string;
}
