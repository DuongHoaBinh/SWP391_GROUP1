import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { HorseConditionStatus } from '../tracking.types';

/**
 * DTO đầu vào của Flow 4 (check-in mốc, nhật ký sức khỏe, ping GPS, override).
 * Trước đây là `interface` nên ValidationPipe bỏ qua hoàn toàn: giá trị sai (action lạ, nhiệt độ "abc",
 * condition không thuộc ENUM) xuống tới DB và gây lỗi 500. ValidationPipe toàn cục bật `whitelist: true`,
 * vì vậy mọi field client gửi và service đọc đều phải được khai báo ở đây, nếu không sẽ bị xóa.
 */

export const CHECKIN_LOCATION_SOURCES = ['gps', 'simulated', 'manual', 'override'] as const;
export const STOP_CHECKIN_ACTIONS = ['arrived', 'departed', 'customs_cleared'] as const;
export const PING_SOURCES = ['gps', 'simulated'] as const;

export class LocationInputDto {
  @ApiProperty({ example: 10.8231 })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Vĩ độ (lat) phải là số' })
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: 106.6297 })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Kinh độ (lng) phải là số' })
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiPropertyOptional({ example: 12, description: 'Độ chính xác GPS (mét)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100000)
  accuracyM?: number | null;

  @ApiPropertyOptional({ enum: CHECKIN_LOCATION_SOURCES, default: 'gps' })
  @IsOptional()
  @IsIn(CHECKIN_LOCATION_SOURCES as unknown as string[], { message: 'Nguồn vị trí phải là gps, simulated, manual hoặc override' })
  source?: (typeof CHECKIN_LOCATION_SOURCES)[number];
}

class CheckInBaseDto {
  @ApiPropertyOptional({ description: 'Thời điểm thực tế (ISO-8601). Lệch > 30 phút bắt buộc có ghi chú; không được ở tương lai' })
  @IsOptional()
  @IsDateString({}, { message: 'actualTime phải đúng định dạng ISO-8601' })
  actualTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ type: LocationInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationInputDto)
  location?: LocationInputDto;

  @ApiPropertyOptional({ description: 'Lý do check-in thủ công (tối thiểu 10 ký tự khi source = manual)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  manualReason?: string | null;

  @ApiPropertyOptional({ description: 'Ảnh bằng chứng khi check-in thủ công' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  evidenceUrl?: string | null;
}

export class CheckInLegDto extends CheckInBaseDto {}

export class CheckInStopDto extends CheckInBaseDto {
  @ApiProperty({ enum: STOP_CHECKIN_ACTIONS })
  @IsIn(STOP_CHECKIN_ACTIONS as unknown as string[], { message: 'action phải là arrived, departed hoặc customs_cleared' })
  action!: (typeof STOP_CHECKIN_ACTIONS)[number];
}

export class CoordinatorOverrideDto {
  @ApiProperty({ example: 'stop-12', description: 'leg-<id>-start | leg-<id>-end | stop-<id>' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  milestoneId!: string;

  @ApiPropertyOptional({ enum: STOP_CHECKIN_ACTIONS, description: 'Bắt buộc hợp lệ khi milestoneId là stop-<id>' })
  @IsOptional()
  @IsIn(STOP_CHECKIN_ACTIONS as unknown as string[], { message: 'action phải là arrived, departed hoặc customs_cleared' })
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({}, { message: 'actualTime phải đúng định dạng ISO-8601' })
  actualTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Lý do override (UI gửi kèm)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CreateHealthLogDto {
  @ApiPropertyOptional({ example: 1, description: 'ID ngựa; phải thuộc chuyến đi' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'horseId phải là số nguyên' })
  @Min(1)
  horseId?: number;

  @ApiProperty({ example: 'Xích Thố' })
  @IsString()
  @IsNotEmpty({ message: 'Tên ngựa là bắt buộc' })
  @MaxLength(150)
  horseName!: string;

  @ApiPropertyOptional({ description: 'Bị server ghi đè theo mốc hiện tại' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  legName?: string;

  @ApiProperty({ enum: HorseConditionStatus })
  @IsIn(Object.values(HorseConditionStatus), {
    message: 'Tình trạng phải là stable, not_eating, stressed, climate_change hoặc other',
  })
  conditionStatus!: HorseConditionStatus;

  @ApiPropertyOptional({ example: 38.1, description: 'Thân nhiệt °C (30 – 45)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Thân nhiệt phải là số' })
  @Min(30, { message: 'Thân nhiệt phải trong khoảng 30 – 45 °C' })
  @Max(45, { message: 'Thân nhiệt phải trong khoảng 30 – 45 °C' })
  temperatureC?: number;

  @ApiPropertyOptional({ example: 36, description: 'Nhịp tim bpm (10 – 250)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Nhịp tim phải là số' })
  @Min(10, { message: 'Nhịp tim phải trong khoảng 10 – 250 bpm' })
  @Max(250, { message: 'Nhịp tim phải trong khoảng 10 – 250 bpm' })
  heartRateBpm?: number;

  @ApiPropertyOptional({ example: 12, description: 'Nhịp thở / phút (1 – 150)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Nhịp thở phải là số' })
  @Min(1)
  @Max(150)
  respiratoryRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  routeStopId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ type: [String], description: 'Tối đa 5 ảnh, chỉ URL trả về từ /health-logs/upload' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5, { message: 'Tối đa 5 ảnh đính kèm cho mỗi bản ghi sức khỏe ngựa.' })
  @IsString({ each: true })
  @MaxLength(4096, { each: true })
  attachments?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString({}, { message: 'recordedAt phải đúng định dạng ISO-8601' })
  recordedAt?: string;

  @ApiPropertyOptional({ type: LocationInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationInputDto)
  location?: LocationInputDto;
}

export class PositionPingItemDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(100000)
  accuracyM?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(400)
  speedKmh?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(360)
  headingDeg?: number | null;

  @ApiProperty({ enum: PING_SOURCES })
  @IsIn(PING_SOURCES as unknown as string[], { message: 'source của ping phải là gps hoặc simulated' })
  source!: (typeof PING_SOURCES)[number];

  @ApiPropertyOptional({ description: 'Ping tương lai (> 2 phút) hoặc quá cũ (> 24h) sẽ bị bỏ qua, không lỗi cả đợt' })
  @IsOptional()
  @IsDateString()
  recordedAt?: string;
}

export class PositionPingBatchDto {
  @ApiProperty({ type: [PositionPingItemDto] })
  @IsArray()
  @ArrayMaxSize(100, { message: 'Mỗi đợt gửi pings tối đa 100 điểm.' })
  @ValidateNested({ each: true })
  @Type(() => PositionPingItemDto)
  pings!: PositionPingItemDto[];
}
