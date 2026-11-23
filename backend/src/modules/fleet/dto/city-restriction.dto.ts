import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class CityRestrictionDto {
  @ApiProperty({ example: 'Hồ Chí Minh' })
  @IsString() @IsNotEmpty() @MaxLength(100)
  city!: string;

  @ApiProperty({ example: 10.7769 })
  @IsNumber() @Min(-90) @Max(90)
  centerLat!: number;

  @ApiProperty({ example: 106.7009 })
  @IsNumber() @Min(-180) @Max(180)
  centerLng!: number;

  @ApiProperty({ example: 12, description: 'Bán kính vùng cấm 1–50 km' })
  @IsNumber() @Min(1, { message: 'Bán kính vùng cấm tối thiểu 1 km' }) @Max(50, { message: 'Bán kính vùng cấm tối đa 50 km' })
  radiusKm!: number;

  @ApiPropertyOptional({ default: true, description: 'Chỉ áp dụng cho xe tải nặng' })
  @IsOptional() @IsBoolean()
  appliesToHeavyTruck?: boolean;

  @ApiProperty({ example: '06:00', description: 'Giờ bắt đầu cấm (HH:mm, giờ Việt Nam)' })
  @Matches(HHMM, { message: 'bannedFrom phải theo định dạng HH:mm' })
  bannedFrom!: string;

  @ApiProperty({ example: '22:00', description: 'Giờ hết cấm (HH:mm). Nhỏ hơn bannedFrom nghĩa là qua nửa đêm' })
  @Matches(HHMM, { message: 'bannedTo phải theo định dạng HH:mm' })
  bannedTo!: string;

  @ApiPropertyOptional({ example: [1, 2, 3, 4, 5, 6, 7], description: 'Ngày áp dụng (ISO: 1 = Thứ 2 ... 7 = Chủ nhật)' })
  @IsOptional() @IsArray() @ArrayNotEmpty() @IsInt({ each: true }) @Min(1, { each: true }) @Max(7, { each: true })
  daysOfWeek?: number[];

  @ApiProperty({ example: 'QĐ 01/2026/QĐ-UBND — cần đối chiếu văn bản gốc' })
  @IsString() @IsNotEmpty({ message: 'Căn cứ pháp lý (legalReference) là bắt buộc' }) @MaxLength(255)
  legalReference!: string;

  @ApiProperty({ example: '2026-01-15' })
  @Matches(YMD, { message: 'effectiveFrom phải theo định dạng YYYY-MM-DD' })
  effectiveFrom!: string;

  @ApiPropertyOptional({ example: null })
  @IsOptional() @Matches(YMD, { message: 'effectiveTo phải theo định dạng YYYY-MM-DD' })
  effectiveTo?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isDemoData?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class CityRestrictionExceptionDto {
  @ApiProperty({ example: 'Hồ Chí Minh' })
  @IsString() @IsNotEmpty() @MaxLength(100)
  city!: string;

  @ApiProperty({ example: '2026-04-30' })
  @Matches(YMD, { message: 'exceptionDate phải theo định dạng YYYY-MM-DD' })
  exceptionDate!: string;

  @ApiProperty({ example: '04:00' })
  @Matches(HHMM, { message: 'bannedFrom phải theo định dạng HH:mm' })
  bannedFrom!: string;

  @ApiProperty({ example: '11:30' })
  @Matches(HHMM, { message: 'bannedTo phải theo định dạng HH:mm' })
  bannedTo!: string;

  @ApiPropertyOptional({ example: 'Lịch cấm dịp lễ 30/4' })
  @IsOptional() @IsString() @MaxLength(255)
  note?: string;
}

class NightWindowDto {
  @ApiProperty({ example: '22:00' })
  @Matches(HHMM, { message: 'nightWindow.from phải theo định dạng HH:mm' })
  from!: string;

  @ApiProperty({ example: '06:00' })
  @Matches(HHMM, { message: 'nightWindow.to phải theo định dạng HH:mm' })
  to!: string;
}

export class JourneyRulesDto {
  @ApiProperty({ example: 8 })
  @IsNumber() @Min(1) @Max(24)
  maxDriveHoursBeforeRest!: number;

  @ApiProperty({ example: 60 })
  @IsNumber() @Min(0) @Max(600)
  restMinutes!: number;

  @ApiProperty({ example: 24 })
  @IsNumber() @Min(1) @Max(72)
  maxJourneyHours!: number;

  @ApiProperty({ example: 24 })
  @IsNumber() @Min(0) @Max(72)
  mandatoryRestHours!: number;

  @ApiProperty({ type: NightWindowDto })
  @IsObject() @ValidateNested() @Type(() => NightWindowDto)
  nightWindow!: NightWindowDto;
}

export class SwapReservedVehicleDto {
  @ApiProperty({ description: 'Xe đang giữ cần đổi' })
  @IsInt() @Min(1)
  fromVehicleId!: number;

  @ApiProperty({ description: 'Xe thay thế' })
  @IsInt() @Min(1)
  toVehicleId!: number;

  @ApiProperty({ description: 'Lý do đổi xe (bắt buộc, tối thiểu 5 ký tự)' })
  @IsString() @IsNotEmpty({ message: 'Phải nhập lý do đổi xe' }) @MaxLength(255)
  reason!: string;
}
