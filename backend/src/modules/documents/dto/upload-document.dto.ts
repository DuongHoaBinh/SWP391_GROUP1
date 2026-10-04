import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class UploadDocumentDto {
  @ApiProperty({ example: 1, description: 'ID con ngựa được đính kèm tài liệu' })
  @Type(() => Number)
  @IsInt({ message: 'horseId phải là số nguyên' })
  @Min(1)
  horseId: number;

  @ApiProperty({ example: 1, description: 'ID quy định áp dụng trong bảng regulation' })
  @Type(() => Number)
  @IsInt({ message: 'regulationId phải là số nguyên' })
  @Min(1)
  regulationId: number;

  @ApiProperty({
    example: 'horse_passport',
    description: 'Tên loại chứng từ (ví dụ: horse_passport, vaccination_certificate, import_permit)',
  })
  @IsNotEmpty({ message: 'docType là bắt buộc' })
  @IsString()
  docType: string;

  @ApiPropertyOptional({ example: 'VN-FEI-2026-9812', description: 'Mã số văn bản / số hộ chiếu / số giấy phép' })
  @IsOptional()
  @IsString()
  docNumber?: string;

  @ApiPropertyOptional({
    example: 'https://storage.example.com/documents/horses/xich-tho-passport.pdf',
    description: 'Đường dẫn URL file tài liệu (tùy chọn nếu đã đính kèm file từ máy tính)',
  })
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @ApiPropertyOptional({ example: '2026-01-10', description: 'Ngày cấp văn bản (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  issueDate?: string;

  @ApiPropertyOptional({ example: '2027-01-10', description: 'Ngày hết hạn hiệu lực văn bản (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  expiryDate?: string;
}
