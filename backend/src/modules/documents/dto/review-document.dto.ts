import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DocumentStatus } from '../documents.types';

export class DocumentChecklistFieldsDto {
  @ApiPropertyOptional({ example: true, description: 'Microchip trên giấy khớp với hồ sơ ngựa' })
  @IsOptional()
  microchipMatches?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Số hộ chiếu / nhận dạng khớp với hồ sơ ngựa' })
  @IsOptional()
  passportMatches?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Ngày cấp hợp lệ theo quy định (không quá sớm/muộn)' })
  @IsOptional()
  issueDateOk?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Hạn sử dụng còn đủ cho chuyến đi + biên an toàn' })
  @IsOptional()
  expiryOk?: boolean;
}

export class ReviewDocumentDto {
  @ApiProperty({
    example: 'approved',
    enum: [DocumentStatus.APPROVED, DocumentStatus.REJECTED, DocumentStatus.EXPIRED],
    description: 'Trạng thái thẩm định của chuyên viên (approved, rejected, expired)',
  })
  @IsNotEmpty({ message: 'Trạng thái thẩm định là bắt buộc' })
  @IsIn([DocumentStatus.APPROVED, DocumentStatus.REJECTED, DocumentStatus.EXPIRED], {
    message: 'Trạng thái phải là approved, rejected hoặc expired',
  })
  status: DocumentStatus.APPROVED | DocumentStatus.REJECTED | DocumentStatus.EXPIRED;

  @ApiPropertyOptional({
    example: 'Hồ sơ tiêm phòng cúm ngựa đầy đủ 2 mũi và còn hạn 6 tháng, chấp thuận.',
    description: 'Ghi chú đánh giá của chuyên viên (bắt buộc nếu từ chối)',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    example: '2027-01-10',
    description: 'Cập nhật ngày hết hạn hiệu lực nếu phát hiện sai lệch (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  expiryDate?: string;

  @ApiPropertyOptional({
    example: 'HQ-SG-2026-9812',
    description: 'Số công văn / Mã phê duyệt Hải quan cập nhật vào số hiệu văn bản',
  })
  @IsOptional()
  @IsString()
  docNumber?: string;

  @ApiPropertyOptional({
    description: '4 tiêu chí đối chiếu kiểm tra thực tế hồ sơ (bắt buộc đạt cả 4 khi approved)',
    type: DocumentChecklistFieldsDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DocumentChecklistFieldsDto)
  checkedFields?: DocumentChecklistFieldsDto;
}
