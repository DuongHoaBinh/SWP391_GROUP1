import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

function parseStringArrayInput(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [trimmed];
      } catch {
        return [trimmed];
      }
    }
    return [trimmed];
  }
  return undefined;
}

function parseBooleanInput(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1' || value === 1) return true;
  if (value === 'false' || value === '0' || value === 0) return false;
  return Boolean(value);
}

export class CreateIncidentDto {
  @ApiProperty({
    enum: ['vehicle_breakdown', 'traffic_delay', 'horse_medical', 'weather', 'border_issue', 'other'],
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['vehicle_breakdown', 'traffic_delay', 'horse_medical', 'weather', 'border_issue', 'other'])
  incidentType!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional({ enum: ['low', 'medium', 'high', 'critical'], default: 'high' })
  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  severity?: 'low' | 'medium' | 'high' | 'critical';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  affectedBorderGate?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => parseStringArrayInput(value))
  @IsArray()
  @IsString({ each: true })
  evidenceUrls?: string[];
}

export class AssessIncidentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  immediateActions!: string;

  @ApiPropertyOptional({ enum: ['low', 'medium', 'high', 'critical'] })
  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export class CreateChangeRequestDto {
  @ApiProperty({ enum: ['route', 'cost', 'schedule', 'vehicle', 'other'] })
  @IsIn(['route', 'cost', 'schedule', 'vehicle', 'other'])
  changeType!: 'route' | 'cost' | 'schedule' | 'vehicle' | 'other';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  oldValue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  newValue?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedExtraCost?: number;

  @ApiPropertyOptional({
    enum: ['none', 'operating_cost', 'emergency_vet_covered', 'customer_addendum'],
    default: 'none',
  })
  @IsOptional()
  @IsIn(['none', 'operating_cost', 'emergency_vet_covered', 'customer_addendum'])
  costAllocation?: 'none' | 'operating_cost' | 'emergency_vet_covered' | 'customer_addendum';

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean()
  crossesNewBorder?: boolean;
}

export class ReviewChangeRequestDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsIn(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  decisionNotes?: string;
}

export class ResolveIncidentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  resolutionNotes!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => parseBooleanInput(value))
  @IsBoolean()
  close?: boolean;
}
