import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DocumentStatus } from '../documents.types';

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
}
