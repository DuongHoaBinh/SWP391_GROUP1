import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BookingType } from '../booking-policy';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';

export class HorseInfoDto {
  @ApiPropertyOptional({ example: 100000000, minimum: 0, description: 'Giá trị mỗi ngựa theo declaredCurrency, tối đa hai chữ số thập phân' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999999.99)
  declaredValue?: number;

  @ApiPropertyOptional({ enum: ['VND', 'USD'], default: 'VND' })
  @IsOptional()
  @IsIn(['VND', 'USD'])
  declaredCurrency?: 'VND' | 'USD';

  @ApiPropertyOptional({ enum: ['basic', 'standard', 'premium'], default: 'basic' })
  @IsOptional()
  @IsIn(['basic', 'standard', 'premium'])
  insurancePackage?: 'basic' | 'standard' | 'premium';

  @ApiProperty({ example: 'Xích Thố', description: 'Tên con ngựa' })
  @IsNotEmpty({ message: 'Tên con ngựa là bắt buộc' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Thoroughbred', description: 'Giống ngựa' })
  @IsOptional()
  @IsString()
  breed?: string;

  @ApiPropertyOptional({
    example: 'male',
    enum: ['male', 'female', 'gelding'],
    description: 'Giới tính (male: đực, female: cái, gelding: thiến)',
  })
  @IsOptional()
  @IsIn(['male', 'female', 'gelding'], { message: 'Giới tính phải là male, female hoặc gelding' })
  gender?: 'male' | 'female' | 'gelding';

  @ApiPropertyOptional({ example: 4, minimum: 0, description: 'Tuổi của con ngựa (năm)' })
  @IsOptional()
  @IsInt({ message: 'Tuổi phải là số nguyên' })
  @Min(0, { message: 'Tuổi không được âm' })
  age?: number;

  @ApiPropertyOptional({ example: '985141000123456', description: 'Số microchip của con ngựa (để kiểm tra trùng lặp)' })
  @IsOptional()
  @IsString()
  microchipNumber?: string;

  @ApiPropertyOptional({ example: 1, description: 'ID con ngựa đã có trong My Horses' })
  @IsOptional()
  @IsInt()
  horseId?: number;

  @ApiPropertyOptional({ example: 1, minimum: 1, description: 'Số lượng con ngựa cần vận chuyển' })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}

export class CreateOrderDto {
  @ApiPropertyOptional({ example: 501, description: 'ID báo giá hợp lệ từ POST /quotes' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  quoteId?: number;

  @ApiPropertyOptional({ enum: ['one_way', 'round_trip'], default: 'one_way', description: 'Loại chuyến đi' })
  @IsOptional()
  @IsIn(['one_way', 'round_trip'])
  tripType?: 'one_way' | 'round_trip';

  @ApiPropertyOptional({ example: '2026-12-15T08:00:00.000Z', description: 'Thời điểm hẹn đón chặng về (bắt buộc khi khứ hồi)' })
  @IsOptional()
  @IsString()
  returnDepartureAt?: string;

  @ApiPropertyOptional({ description: 'Đồng ý chính sách no-show và hủy chặng về (bắt buộc khi khứ hồi)' })
  @IsOptional()
  acceptReturnPolicy?: boolean;

  @ApiPropertyOptional({ example: 'default', description: 'Mã phương án xe trong báo giá' })
  @IsOptional()
  @IsString()
  optionCode?: string;

  @ApiPropertyOptional({ example: 45000000, minimum: 0, description: 'Giá tiền / ngân sách đề xuất của khách hàng cho chuyến đi (VNĐ)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(999999999999)
  customerProposedPrice?: number;

  @ApiPropertyOptional({ enum: ['road', 'air', 'sea'], description: 'Phương thức vận tải' })
  @IsOptional()
  @IsIn(['road', 'air', 'sea'])
  transportMode?: 'road' | 'air' | 'sea';

  @ApiPropertyOptional({ enum: ['ferry', 'vessel'], description: 'Hình thức đường thủy' })
  @IsOptional()
  @IsIn(['ferry', 'vessel'])
  seaMode?: 'ferry' | 'vessel';

  @ApiPropertyOptional({ example: 10.734, description: 'Vĩ độ điểm đón' })
  @IsOptional()
  @IsNumber()
  originLat?: number;

  @ApiPropertyOptional({ example: 106.7216, description: 'Kinh độ điểm đón' })
  @IsOptional()
  @IsNumber()
  originLng?: number;

  @ApiPropertyOptional({ example: 11.9404, description: 'Vĩ độ điểm giao' })
  @IsOptional()
  @IsNumber()
  destinationLat?: number;

  @ApiPropertyOptional({ example: 108.4583, description: 'Kinh độ điểm giao' })
  @IsOptional()
  @IsNumber()
  destinationLng?: number;

  @ApiPropertyOptional({ enum: ['dedicated_charter'], default: 'dedicated_charter', description: 'Luôn bao chuyến. shared_stall đã ngừng sau review 11/2026 và trả 400' })
  @IsOptional()
  @IsIn(['shared_stall', 'dedicated_charter'])
  bookingType?: BookingType;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A', description: 'Contact person name' })
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiPropertyOptional({ example: '123 Đường Trần Phú, Quận 5, TP.HCM', description: 'Contact address' })
  @IsOptional()
  @IsString()
  contactAddress?: string;

  @ApiProperty({ example: '0901234567', description: 'Contact phone number (required)' })
  @IsNotEmpty({ message: 'Số điện thoại liên hệ là bắt buộc' })
  @IsString()
  contactPhone: string;

  @ApiProperty({ example: 'owner@example.com', description: 'Contact email (required)' })
  @IsNotEmpty({ message: 'Email liên hệ là bắt buộc' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  contactEmail: string;

  @ApiProperty({ example: 1, minimum: 1, default: 1, description: 'Number of horses to transport' })
  @IsInt({ message: 'Số lượng ngựa phải là số nguyên' })
  @Min(1, { message: 'Số lượng ngựa tối thiểu là 1' })
  requestedHorseCount: number;

  @ApiProperty({ example: 'Trang trại ngựa Củ Chi, TP.HCM', description: 'Origin pickup location' })
  @IsNotEmpty({ message: 'Địa điểm rước ngựa là bắt buộc' })
  @IsString()
  originLocation: string;

  @ApiProperty({ example: 'Trường đua ngựa Singapore Turf Club, Singapore', description: 'Final destination location' })
  @IsNotEmpty({ message: 'Điểm đến cuối cùng là bắt buộc' })
  @IsString()
  destinationLocation: string;

  @ApiPropertyOptional({ example: '2026-10-15T08:00:00.000Z', description: 'Requested transport date (ISO string)' })
  @IsOptional()
  @IsDateString({}, { message: 'Ngày khởi hành yêu cầu phải đúng định dạng ISO-8601 (YYYY-MM-DD)' })
  requestedDate?: string;

  @ApiPropertyOptional({
    example: 'International',
    enum: ['International', 'Domestic'],
    description: 'Loại hình vận chuyển: International (quốc tế) hoặc Domestic (nội địa)',
  })
  @IsOptional()
  @IsIn(['International', 'Domestic'])
  transportationType?: 'International' | 'Domestic';

  @ApiPropertyOptional({ example: 'Cần xe có hệ thống điều hòa đặc biệt cho ngựa thi đấu', description: 'Special requirements' })
  @IsOptional()
  @IsString()
  specialRequirements?: string;

  @ApiPropertyOptional({
    example: 'https://storage.example.com/documents/medical-regulations-2026.pdf',
    description: 'Imported/uploaded medical regulation or horse health certificate URL',
  })
  @IsOptional()
  @IsString()
  medicalDocumentUrl?: string;

  // --- Thông tin chi tiết con ngựa (đơn lẻ hoặc danh sách) ---
  @ApiPropertyOptional({ example: 'Xích Thố', description: 'Tên con ngựa (khi gửi 1 con)' })
  @IsOptional()
  @IsString()
  horseName?: string;

  @ApiPropertyOptional({ example: 'Thoroughbred', description: 'Giống ngựa (khi gửi 1 con)' })
  @IsOptional()
  @IsString()
  horseBreed?: string;

  @ApiPropertyOptional({
    example: 'male',
    enum: ['male', 'female', 'gelding'],
    description: 'Giới tính con ngựa (male, female, gelding)',
  })
  @IsOptional()
  @IsIn(['male', 'female', 'gelding'])
  horseGender?: 'male' | 'female' | 'gelding';

  @ApiPropertyOptional({ example: 4, minimum: 0, description: 'Tuổi của con ngựa (khi gửi 1 con)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  horseAge?: number;

  @ApiPropertyOptional({
    type: [HorseInfoDto],
    description: 'Danh sách nhiều con ngựa (nếu gửi nhiều con cùng lúc)',
    example: [
      {
        name: 'Xích Thố',
        breed: 'Thoroughbred',
        gender: 'male',
        age: 4,
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HorseInfoDto)
  horses?: HorseInfoDto[];
}
