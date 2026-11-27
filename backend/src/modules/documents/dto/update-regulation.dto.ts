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

  @ApiPropertyOptional({ enum: ['road', 'air', 'sea', 'both'] })
  @IsOptional()
  @IsEnum(['road', 'air', 'sea', 'both'])
  transportMode?: 'road' | 'air' | 'sea' | 'both';

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

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  maxIssueAgeDays?: number;

  @ApiPropertyOptional({ example: 'horse_passport' })
  @IsOptional()
  @IsString()
  documentTypeCode?: string;

  @ApiPropertyOptional({ example: 'Dữ liệu demo — cần đối chiếu cơ quan thú y' })
  @IsOptional()
  @IsString()
  legalReference?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isDemoData?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}
