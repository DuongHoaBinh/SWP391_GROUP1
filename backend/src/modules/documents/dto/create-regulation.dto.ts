import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRegulationDto {
  @ApiProperty({ example: 'Singapore', description: 'Tên quốc gia áp dụng quy định' })
  @IsNotEmpty({ message: 'Quốc gia là bắt buộc' })
  @IsString()
  country: string;

  @ApiProperty({
    example: 'horse_passport',
    description: 'Mã loại chứng từ (ví dụ: horse_passport, vaccination_certificate, import_permit, blood_test)',
  })
  @IsNotEmpty({ message: 'Loại tài liệu là bắt buộc' })
  @IsString()
  documentType: string;

  @ApiPropertyOptional({
    example: 'Hộ chiếu ngựa do FEI cấp hoặc Liên đoàn đua ngựa quốc gia cấp có gắn mã microchip.',
    description: 'Mô tả chi tiết và yêu cầu bắt buộc của chứng từ',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Ngày bắt đầu có hiệu lực (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  effectiveDate?: string;
}
