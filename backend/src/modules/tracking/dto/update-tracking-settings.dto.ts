import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, Max, Min, ValidateNested } from 'class-validator';

export class GeofenceSettingsDto {
  @ApiPropertyOptional({ minimum: 50, maximum: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(50)
  @Max(5000)
  defaultRadiusM?: number;

  @ApiPropertyOptional({ minimum: 100, maximum: 10000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(100)
  @Max(10000)
  largeSiteRadiusM?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1000)
  bufferAccuracyM?: number;

  @ApiPropertyOptional({ minimum: 20, maximum: 2000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(20)
  @Max(2000)
  maxAccuracyM?: number;
}

export class UpdateTrackingSettingsDto {
  @ApiPropertyOptional({ type: GeofenceSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeofenceSettingsDto)
  geofence?: GeofenceSettingsDto;

  @ApiPropertyOptional({ minimum: 50, maximum: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(50)
  @Max(5000)
  geofenceRadiusDefaultM?: number;

  @ApiPropertyOptional({ minimum: 100, maximum: 10000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(100)
  @Max(10000)
  geofenceRadiusLargeSiteM?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  simulationEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  customerVitalsDetail?: boolean;
}
