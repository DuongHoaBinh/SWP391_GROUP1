import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateRegulationDto {
  @ApiPropertyOptional({ example: 'Singapore' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'SIN' })
  @IsOptional()
  @IsString()
  borderGate?: string | null;

  @ApiPropertyOptional({ enum: ['road', 'air', 'both'] })
  @IsOptional()
  @IsEnum(['road', 'air', 'both'])
  transportMode?: 'road' | 'air' | 'both';

  @ApiPropertyOptional({ enum: ['A', 'B'] })
  @IsOptional()
  @IsEnum(['A', 'B'])
  docTier?: 'A' | 'B';

  @ApiPropertyOptional({ example: 14 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(180)
  leadTimeDays?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requiresAuthorityApproval?: boolean;

  @ApiPropertyOptional({ example: 48 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(720)
  minValidityBufferHours?: number;

  @ApiPropertyOptional({ example: 'horse_passport' })
  @IsOptional()
  @IsString()
  documentType?: string;

  @ApiPropertyOptional({ example: 'Mô tả quy định kiểm dịch cập nhật' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsString()
  effectiveDate?: string;
}
