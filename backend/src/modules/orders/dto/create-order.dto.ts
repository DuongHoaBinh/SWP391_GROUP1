import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class HorseInfoDto {
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
}

export class CreateOrderDto {
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
  @IsString()
  requestedDate?: string;

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
