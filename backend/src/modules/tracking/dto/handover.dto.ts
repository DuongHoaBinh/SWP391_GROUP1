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

function parseBoolField(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1' || value === 1) return true;
  if (value === 'false' || value === '0' || value === 0) return false;
  return Boolean(value);
}

function parseEvidenceArray(value: unknown): string[] | undefined {
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

export class CreateHandoverDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  shipmentHorseId!: number;

  @ApiPropertyOptional({ enum: ['outbound', 'return'], default: 'outbound' })
  @IsOptional()
  @IsIn(['outbound', 'return'])
  direction?: 'outbound' | 'return';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  receivedByName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  handoverLocation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  handoverDatetime?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  deliveredQuantity?: number;

  @ApiPropertyOptional({ enum: ['healthy', 'minor_issue', 'needs_attention'], default: 'healthy' })
  @IsOptional()
  @IsIn(['healthy', 'minor_issue', 'needs_attention'])
  horseConditionAtHandover?: 'healthy' | 'minor_issue' | 'needs_attention';

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(({ value }) => parseBoolField(value))
  @IsBoolean()
  identityVerified?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(({ value }) => parseBoolField(value))
  @IsBoolean()
  documentsHandedOver?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => parseEvidenceArray(value))
  @IsArray()
  @IsString({ each: true })
  evidenceUrls?: string[];
}

export class RespondHandoverDto {
  @ApiProperty({ enum: ['confirm', 'dispute'] })
  @IsIn(['confirm', 'dispute'])
  action!: 'confirm' | 'dispute';

  @ApiPropertyOptional({ enum: ['healthy', 'minor_issue', 'needs_attention'] })
  @IsOptional()
  @IsIn(['healthy', 'minor_issue', 'needs_attention'])
  horseConditionAtHandover?: 'healthy' | 'minor_issue' | 'needs_attention';

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => parseBoolField(value))
  @IsBoolean()
  identityVerified?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => parseBoolField(value))
  @IsBoolean()
  documentsHandedOver?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  disputeReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => parseEvidenceArray(value))
  @IsArray()
  @IsString({ each: true })
  evidenceUrls?: string[];
}

export class ResolveHandoverDisputeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  resolutionNotes!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  compensationAmount?: number;
}
