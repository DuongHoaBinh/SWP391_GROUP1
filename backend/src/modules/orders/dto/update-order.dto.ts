import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { HorseInfoDto } from './create-order.dto';
import { BookingType } from '../booking-policy';

export class UpdateOrderDto {
  @ApiPropertyOptional({ enum: ['shared_stall', 'dedicated_charter'], description: 'Chỉ thay đổi khi Manager yêu cầu chỉnh sửa' })
  @IsOptional()
  @IsIn(['shared_stall', 'dedicated_charter'])
  bookingType?: BookingType;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A', description: 'Contact person name' })
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiPropertyOptional({
    example: '123 Đường Trần Phú, Quận 5, TP.HCM',
    description: 'Contact address',
  })
  @IsOptional()
  @IsString()
  contactAddress?: string;

  @ApiPropertyOptional({ example: '0901234567', description: 'Contact phone number' })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({ example: 'owner@example.com', description: 'Contact email' })
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  contactEmail?: string;

  @ApiPropertyOptional({
    example: 1,
    minimum: 1,
    description: 'Number of horses to transport',
  })
  @IsOptional()
  @IsInt({ message: 'Số lượng ngựa phải là số nguyên' })
  @Min(1, { message: 'Số lượng ngựa tối thiểu là 1' })
  requestedHorseCount?: number;

  @ApiPropertyOptional({
    example: 'Trang trại ngựa Củ Chi, Ấp Bến Cỏ, TP.HCM',
    description: 'Origin pickup location',
  })
  @IsOptional()
  @IsString()
  originLocation?: string;

  @ApiPropertyOptional({
    example: 'Trường đua ngựa Singapore Turf Club, Singapore',
    description: 'Final destination location',
  })
  @IsOptional()
  @IsString()
  destinationLocation?: string;

  @ApiPropertyOptional({
    example: '2026-10-16T08:00:00.000Z',
    description: 'Requested transport date (ISO string)',
  })
  @IsOptional()
  @IsString()
  requestedDate?: string;

  @ApiPropertyOptional({
    example: 'Cần xe có hệ thống điều hòa đặc biệt cho ngựa thi đấu',
    description: 'Special requirements',
  })
  @IsOptional()
  @IsString()
  specialRequirements?: string;

  @ApiPropertyOptional({
    example: 'https://storage.example.com/documents/medical-regulations-2026.pdf',
    description: 'Medical document or horse health certificate URL',
  })
  @IsOptional()
  @IsString()
  medicalDocumentUrl?: string;

  @ApiPropertyOptional({ example: 'Xích Thố', description: 'Tên con ngựa (khi gửi 1 con)' })
  @IsOptional()
  @IsString()
  horseName?: string;

  @ApiPropertyOptional({ example: 'Thoroughbred', description: 'Giống ngựa' })
  @IsOptional()
  @IsString()
  horseBreed?: string;

  @ApiPropertyOptional({
    example: 'male',
    enum: ['male', 'female', 'gelding'],
    description: 'Giới tính',
  })
  @IsOptional()
  @IsIn(['male', 'female', 'gelding'], {
    message: 'Giới tính phải là male, female hoặc gelding',
  })
  horseGender?: 'male' | 'female' | 'gelding';

  @ApiPropertyOptional({ example: 4, minimum: 0, description: 'Tuổi của con ngựa' })
  @IsOptional()
  @IsInt({ message: 'Tuổi phải là số nguyên' })
  @Min(0, { message: 'Tuổi không được âm' })
  horseAge?: number;

  @ApiPropertyOptional({ type: [HorseInfoDto], description: 'Danh sách ngựa' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HorseInfoDto)
  horses?: HorseInfoDto[];
}
