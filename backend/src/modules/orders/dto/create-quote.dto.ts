import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { DeclaredCurrency, InsurancePackage } from '../insurance-policy';

export class QuoteLocationDto {
  @ApiProperty({ example: 'Quận 7, TP.HCM', description: 'Địa chỉ đón hoặc giao' })
  @IsNotEmpty({ message: 'Địa chỉ không được để trống' })
  @IsString()
  address: string;

  @ApiProperty({ example: 10.734, description: 'Vĩ độ (-90 đến 90)' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: 106.7216, description: 'Kinh độ (-180 đến 180)' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @ApiPropertyOptional({ example: 'Vietnam', description: 'Quốc gia' })
  @IsOptional()
  @IsString()
  country?: string;
}

export class QuoteHorseItemDto {
  @ApiProperty({ example: 12, description: 'ID con ngựa thuộc tài khoản hiện tại' })
  @IsInt()
  horseId: number;

  @ApiPropertyOptional({ example: 1, default: 1, description: 'Số lượng' })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ example: 2000000000, description: 'Giá trị khai báo bảo hiểm' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  declaredValue?: number;

  @ApiPropertyOptional({ enum: ['VND', 'USD'], default: 'VND', description: 'Loại tiền khai báo' })
  @IsOptional()
  @IsIn(['VND', 'USD'])
  declaredCurrency?: DeclaredCurrency;

  @ApiPropertyOptional({ enum: ['basic', 'standard', 'premium'], default: 'basic', description: 'Gói bảo hiểm' })
  @IsOptional()
  @IsIn(['basic', 'standard', 'premium'])
  insurancePackage?: InsurancePackage;
}

export class CreateQuoteDto {
  @ApiProperty({ type: QuoteLocationDto, description: 'Điểm đón' })
  @ValidateNested()
  @Type(() => QuoteLocationDto)
  origin: QuoteLocationDto;

  @ApiProperty({ type: QuoteLocationDto, description: 'Điểm giao' })
  @ValidateNested()
  @Type(() => QuoteLocationDto)
  destination: QuoteLocationDto;

  @ApiProperty({ example: '2026-12-10', description: 'Ngày dự kiến khởi hành (YYYY-MM-DD)' })
  @IsNotEmpty({ message: 'Ngày khởi hành không được để trống' })
  @IsString()
  departureDate: string;

  @ApiProperty({ enum: ['road', 'air', 'sea'], example: 'road', description: 'Phương thức vận tải' })
  @IsIn(['road', 'air', 'sea'], { message: 'Phương thức vận tải phải là road, air hoặc sea' })
  transportMode: 'road' | 'air' | 'sea';

  @ApiPropertyOptional({ enum: ['vessel'], description: 'Hình thức đường thủy (tàu biển chuyên dụng)' })
  @IsOptional()
  @IsIn(['vessel'])
  seaMode?: 'vessel';

  @ApiPropertyOptional({ enum: ['one_way', 'round_trip'], default: 'one_way', description: 'Loại chuyến đi' })
  @IsOptional()
  @IsIn(['one_way', 'round_trip'])
  tripType?: 'one_way' | 'round_trip';

  @ApiPropertyOptional({ example: '2026-12-15T08:00:00.000Z', description: 'Thời điểm hẹn đón chặng về (bắt buộc khi tripType = round_trip)' })
  @IsOptional()
  @IsString()
  returnDepartureAt?: string;

  @ApiPropertyOptional({ example: '2026-12-10T09:00', description: 'Step 9: ngày + giờ đón mong muốn. "YYYY-MM-DDTHH:mm" hiểu là giờ Việt Nam; hoặc ISO có múi giờ. Thiếu thì mặc định 08:00 của departureDate' })
  @IsOptional()
  @IsString()
  pickupAt?: string;

  @ApiProperty({ type: [QuoteHorseItemDto], description: 'Danh sách ngựa cần vận chuyển' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteHorseItemDto)
  horses: QuoteHorseItemDto[];
}
