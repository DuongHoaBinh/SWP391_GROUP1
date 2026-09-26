import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

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

  @ApiProperty({ example: 2, minimum: 1, default: 1, description: 'Number of horses to transport' })
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
}
