import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ApplyRegulationTemplateDto {
  @ApiProperty({
    example: 'Qatar',
    description: 'Tên quốc gia áp dụng mẫu quy định',
  })
  @IsString()
  @IsNotEmpty()
  country: string;

  @ApiProperty({
    example: 'middle_east',
    description:
      'Mã bộ mẫu khu vực: asean | east_asia | middle_east | eu_standard | woah_global | vietnam_domestic',
  })
  @IsString()
  @IsNotEmpty()
  templateKey: string;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Ngày có hiệu lực (YYYY-MM-DD), mặc định là ngày hôm nay',
  })
  @IsOptional()
  @IsString()
  effectiveDate?: string;
}
