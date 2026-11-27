import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
  Min,
} from 'class-validator';

export class CreateTariffDto {
  @ApiProperty({ enum: ['road', 'air', 'sea'], example: 'road', description: 'Phương thức vận tải' })
  @IsIn(['road', 'air', 'sea'], { message: 'mode phải là road, air hoặc sea' })
  mode: 'road' | 'air' | 'sea';

  @ApiPropertyOptional({ example: 'VN', default: 'VN', description: 'Khu vực áp dụng bảng giá' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiProperty({ description: 'Cấu hình tham số giá JSON theo định dạng mode' })
  @IsNotEmpty({ message: 'params không được để trống' })
  @IsObject({ message: 'params phải là object' })
  params: Record<string, any>;

  @ApiPropertyOptional({ example: 'Cập nhật giá nhiên liệu quý 4/2026', description: 'Ghi chú cho phiên bản' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class GeoLocationDto {
  @ApiProperty({ example: 'Quận 7, TP.HCM' })
  @IsNotEmpty()
  @IsString()
  address: string;

  @ApiProperty({ example: 10.734 })
  @IsNumber()
  lat: number;

  @ApiProperty({ example: 106.7216 })
  @IsNumber()
  lng: number;

  @ApiPropertyOptional({ example: 'Vietnam' })
  @IsOptional()
  @IsString()
  country?: string;
}

export class SampleHorseDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  requiresPrivateStall?: boolean;
}

export class SampleRouteDto {
  @ApiProperty({ type: GeoLocationDto })
  @ValidateNested()
  @Type(() => GeoLocationDto)
  origin: GeoLocationDto;

  @ApiProperty({ type: GeoLocationDto })
  @ValidateNested()
  @Type(() => GeoLocationDto)
  destination: GeoLocationDto;

  @ApiProperty({ type: [SampleHorseDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SampleHorseDto)
  horses: SampleHorseDto[];
}

export class PreviewPricingDto {
  @ApiProperty({ enum: ['road', 'air', 'sea'], example: 'road' })
  @IsIn(['road', 'air', 'sea'])
  mode: 'road' | 'air' | 'sea';

  @ApiPropertyOptional({ enum: ['vessel'], example: 'vessel' })
  @IsOptional()
  @IsIn(['vessel'])
  seaMode?: 'vessel';

  @ApiPropertyOptional({ description: 'Tham số bảng giá muốn thử nghiệm trước khi lưu' })
  @IsOptional()
  @IsObject()
  params?: Record<string, any>;

  @ApiProperty({ type: SampleRouteDto })
  @ValidateNested()
  @Type(() => SampleRouteDto)
  sample: SampleRouteDto;
}
