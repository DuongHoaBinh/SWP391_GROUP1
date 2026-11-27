import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class PlanEndpointDto {
  @ApiProperty({ example: 10.8494 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: 106.7537 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiPropertyOptional({ description: 'Tên hiển thị của điểm', example: 'Trang trại Củ Chi, TP.HCM' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;

  @ApiPropertyOptional({ description: 'Tên quốc gia (VI/EN) hoặc mã ISO2', example: 'Việt Nam' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ description: 'Mã quốc gia ISO 3166-1 alpha-2', example: 'VN' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  countryCode?: string;
}

export class PlanNetworkRouteDto {
  @ApiProperty({ enum: ['road', 'air', 'sea'] })
  @IsIn(['road', 'air', 'sea'])
  mode!: 'road' | 'air' | 'sea';

  @ApiPropertyOptional({ enum: ['vessel'], description: 'Hình thức đường thủy khi mode = sea (chỉ hỗ trợ tàu biển chuyên dụng vessel)' })
  @IsOptional()
  @IsIn(['vessel'])
  seaMode?: 'vessel';

  @ApiProperty({ type: PlanEndpointDto })
  @ValidateNested()
  @Type(() => PlanEndpointDto)
  origin!: PlanEndpointDto;

  @ApiProperty({ type: PlanEndpointDto })
  @ValidateNested()
  @Type(() => PlanEndpointDto)
  destination!: PlanEndpointDto;
}
