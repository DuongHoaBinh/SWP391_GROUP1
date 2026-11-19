import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateRegulationDto {
  @ApiProperty({ example: 'Singapore', description: 'Tên quốc gia áp dụng quy định' })
  @IsNotEmpty({ message: 'Quốc gia là bắt buộc' })
  @IsString()
  country: string;

  @ApiPropertyOptional({ example: 'SIN', description: 'Cửa khẩu / sân bay / trạm kiểm dịch áp dụng (VD: SIN, Mộc Bài)' })
  @IsOptional()
  @IsString()
  borderGate?: string;

  @ApiPropertyOptional({ enum: ['road', 'air', 'both'], default: 'both' })
  @IsOptional()
  @IsEnum(['road', 'air', 'both'])
  transportMode?: 'road' | 'air' | 'both';

  @ApiPropertyOptional({ enum: ['A', 'B'], default: 'A', description: 'Tầng hồ sơ (A: dài hạn trước D-3; B: kiểm dịch ngắn hạn từ D-1)' })
  @IsOptional()
  @IsEnum(['A', 'B'])
  docTier?: 'A' | 'B';

  @ApiPropertyOptional({ example: 14, description: 'Số ngày lead time chuẩn bị hồ sơ trước ngày khởi hành' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(180)
  leadTimeDays?: number;

  @ApiPropertyOptional({ example: true, description: 'Bắt buộc phê duyệt Tầng 2 từ cơ quan chức năng (AVS, Cục Thú y, Hải quan)' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requiresAuthorityApproval?: boolean;

  @ApiPropertyOptional({ example: 48, description: 'Biên an toàn hiệu lực tối thiểu (giờ) tính sau thời điểm dự kiến đến' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(720)
  minValidityBufferHours?: number;

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
