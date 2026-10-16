import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { LegType, RouteStopType } from '../routes.types';

export class RouteLegDto {
  @ApiProperty({ description: 'Thứ tự chặng (1, 2, 3...)' })
  @IsInt()
  @Min(1)
  sequenceNo!: number;

  @ApiProperty({ enum: LegType, description: 'Loại chặng: road (đường bộ) hoặc flight (hàng không)' })
  @IsEnum(LegType)
  legType!: LegType;

  @ApiProperty({ description: 'Điểm khởi hành của chặng' })
  @IsString()
  originLocation!: string;

  @ApiProperty({ description: 'Điểm đến của chặng' })
  @IsString()
  destinationLocation!: string;

  @ApiPropertyOptional({ description: 'Khoảng cách chặng (km)' })
  @IsOptional()
  @IsNumber()
  distanceKm?: number;

  @ApiPropertyOptional({ description: 'Thời gian di chuyển dự kiến (giờ)' })
  @IsOptional()
  @IsNumber()
  durationHours?: number;

  @ApiPropertyOptional({ description: 'Thời gian xuất phát dự kiến (ISO)' })
  @IsOptional()
  @IsString()
  plannedDeparture?: string;

  @ApiPropertyOptional({ description: 'Thời gian đến dự kiến (ISO)' })
  @IsOptional()
  @IsString()
  plannedArrival?: string;

  // Dành cho chặng đường bộ:
  @ApiPropertyOptional({ description: 'ID phương tiện cụ thể được gán' })
  @IsOptional()
  @IsInt()
  vehicleId?: number;

  // Dành cho chặng bay:
  @ApiPropertyOptional({ description: 'ID hãng hàng không' })
  @IsOptional()
  @IsInt()
  airlineId?: number;

  @ApiPropertyOptional({ description: 'Tên hãng hàng không' })
  @IsOptional()
  @IsString()
  airlineName?: string;

  @ApiPropertyOptional({ description: 'Số hiệu chuyến bay' })
  @IsOptional()
  @IsString()
  flightNumber?: string;

  @ApiPropertyOptional({ description: 'ID sân bay cất cánh' })
  @IsOptional()
  @IsInt()
  departureAirportId?: number;

  @ApiPropertyOptional({ description: 'Mã IATA sân bay cất cánh (VD: SGN, SIN)' })
  @IsOptional()
  @IsString()
  departureAirportCode?: string;

  @ApiPropertyOptional({ description: 'ID sân bay hạ cánh' })
  @IsOptional()
  @IsInt()
  arrivalAirportId?: number;

  @ApiPropertyOptional({ description: 'Mã IATA sân bay hạ cánh (VD: SYD)' })
  @IsOptional()
  @IsString()
  arrivalAirportCode?: string;

  @ApiPropertyOptional({ description: 'Mã đặt chỗ / Booking reference' })
  @IsOptional()
  @IsString()
  bookingReference?: string;

  @ApiPropertyOptional({ description: 'Số lượng stall đã đặt trên máy bay' })
  @IsOptional()
  @IsInt()
  stallsBooked?: number;
}

export class RouteStopItemDto {
  @ApiProperty({ description: 'Thứ tự điểm dừng trên toàn bộ tuyến' })
  @IsInt()
  @Min(1)
  sequenceNo!: number;

  @ApiPropertyOptional({ description: 'Thứ tự chặng chứa điểm dừng này' })
  @IsOptional()
  @IsInt()
  legSequenceNo?: number;

  @ApiProperty({ enum: RouteStopType, description: 'Loại điểm dừng (rest, quarantine, refuel, border_check)' })
  @IsEnum(RouteStopType)
  stopType!: RouteStopType;

  @ApiProperty({ description: 'Tên vị trí điểm dừng' })
  @IsString()
  locationName!: string;

  @ApiPropertyOptional({ description: 'Quốc gia của điểm dừng' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Thời gian đến dự kiến' })
  @IsOptional()
  @IsString()
  plannedArrival?: string;

  @ApiPropertyOptional({ description: 'Thời gian rời đi dự kiến' })
  @IsOptional()
  @IsString()
  plannedDeparture?: string;
}

export class BuildDetailedPlanDto {
  @ApiProperty({ description: 'Tên lộ trình tổng thể' })
  @IsString()
  routeName!: string;

  @ApiPropertyOptional({ description: 'Tổng quãng đường dự kiến (km)' })
  @IsOptional()
  @IsNumber()
  totalDistanceKm?: number;

  @ApiProperty({ type: [RouteLegDto], description: 'Danh sách các chặng vận chuyển' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteLegDto)
  legs!: RouteLegDto[];

  @ApiProperty({ type: [RouteStopItemDto], description: 'Danh sách các điểm dừng' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteStopItemDto)
  stops!: RouteStopItemDto[];
}
