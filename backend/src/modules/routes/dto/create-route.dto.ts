import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { RouteStopType } from '../routes.types';

export class RouteStopItemDto {
  @ApiProperty({ description: 'Thứ tự chặng/điểm dừng (bắt đầu từ 1)', example: 1 })
  @IsInt()
  @Min(1)
  sequenceNo!: number;

  @ApiProperty({
    description: 'Loại điểm dừng',
    enum: RouteStopType,
    example: RouteStopType.REST,
  })
  @IsEnum(RouteStopType)
  stopType!: RouteStopType;

  @ApiProperty({ description: 'Tên địa điểm / cửa khẩu / trạm kiểm dịch', example: 'Mộc Bài Border Gate' })
  @IsString()
  @IsNotEmpty()
  locationName!: string;

  @ApiPropertyOptional({ description: 'Quốc gia', example: 'Vietnam' })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiPropertyOptional({ description: 'Thời gian dự kiến đến (ISO format)', example: '2026-10-15T12:00:00Z' })
  @IsString()
  @IsOptional()
  plannedArrival?: string;

  @ApiPropertyOptional({ description: 'Thời gian dự kiến rời đi (ISO format)', example: '2026-10-15T14:00:00Z' })
  @IsString()
  @IsOptional()
  plannedDeparture?: string;
}

export class CreateRouteDto {
  @ApiPropertyOptional({ description: 'Tên tuyến đường vận chuyển', example: 'Tuyến TP.HCM - Mộc Bài - Phnom Penh - Singapore' })
  @IsString()
  @IsOptional()
  routeName?: string;

  @ApiPropertyOptional({ description: 'Tổng quãng đường dự kiến (km)', example: 1250.5 })
  @IsNumber()
  @IsOptional()
  totalDistanceKm?: number;

  @ApiProperty({
    description: 'Danh sách các điểm dừng theo thứ tự di chuyển (tối thiểu 2 điểm: xuất phát và đích)',
    type: [RouteStopItemDto],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => RouteStopItemDto)
  stops!: RouteStopItemDto[];
}
