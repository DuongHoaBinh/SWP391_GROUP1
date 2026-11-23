import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const emptyToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export class UploadHorseDocumentDto {
  @ApiProperty({ example: 'horse_passport', description: 'Mã loại giấy tờ trong danh mục document_type' })
  @IsString()
  @IsNotEmpty({ message: 'documentTypeCode là bắt buộc' })
  @MaxLength(50)
  documentTypeCode!: string;

  @ApiPropertyOptional({ example: 'VN-FEI-2026-9812', description: 'Số giấy tờ' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  docNumber?: string;

  @ApiPropertyOptional({ example: '', description: 'URL tệp nếu không tải file từ máy tính' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @ApiPropertyOptional({ example: '2026-01-10', description: 'Ngày cấp (YYYY-MM-DD)' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'issueDate phải có dạng YYYY-MM-DD' })
  issueDate?: string;

  @ApiPropertyOptional({ example: '2027-01-10', description: 'Ngày hết hạn (YYYY-MM-DD). Bỏ trống thì tính theo hiệu lực mặc định của loại giấy tờ' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'expiryDate phải có dạng YYYY-MM-DD' })
  expiryDate?: string;
}
