import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AuthorityApprovalStatus } from '../documents.types';

export class RecordAuthorityApprovalDto {
  @ApiProperty({
    example: 'Cục Thú Y Việt Nam (DAH)',
    description: 'Tên cơ quan chức năng thẩm quyền (ví dụ: Cục Thú y, Chi cục Hải quan cửa khẩu, AVS Singapore)',
  })
  @IsNotEmpty({ message: 'Tên cơ quan chức năng là bắt buộc' })
  @IsString()
  authorityName: string;

  @ApiProperty({
    example: 'approved',
    enum: [AuthorityApprovalStatus.PENDING, AuthorityApprovalStatus.APPROVED, AuthorityApprovalStatus.REJECTED],
    description: 'Trạng thái phê duyệt từ cơ quan chức năng',
  })
  @IsNotEmpty({ message: 'Trạng thái cơ quan là bắt buộc' })
  @IsIn([AuthorityApprovalStatus.PENDING, AuthorityApprovalStatus.APPROVED, AuthorityApprovalStatus.REJECTED])
  status: AuthorityApprovalStatus;

  @ApiPropertyOptional({
    example: '2026-10-10T14:30:00.000Z',
    description: 'Thời điểm cơ quan phê duyệt (ISO string)',
  })
  @IsOptional()
  @IsString()
  approvalDate?: string;

  @ApiPropertyOptional({
    example: 'HQ-SG-2026-9812',
    description: 'Số công văn / Mã phê duyệt Hải quan (sẽ được lưu vào số hiệu văn bản doc_number)',
  })
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @ApiPropertyOptional({
    example: 'Đã cấp Giấy phép kiểm dịch số KD-2026/8991.',
    description: 'Ghi chú hoặc số quyết định của cơ quan',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
