import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export const CANNOT_FULFIL_REASONS = [
  'no_vehicle_available',
  'route_not_supported',
  'destination_not_accepted',
  'documents_cannot_be_ready',
  'horse_health_risk',
  'other',
] as const;

export type CannotFulfilReason = typeof CANNOT_FULFIL_REASONS[number];

export class FeasibilityReviewDto {
  @ApiProperty({ enum: ['approve', 'cannot_fulfil'], description: 'Quyết định khả thi của Quản lý vận hành' })
  @IsIn(['approve', 'cannot_fulfil'])
  decision!: 'approve' | 'cannot_fulfil';

  @ApiPropertyOptional({
    enum: CANNOT_FULFIL_REASONS,
    description: 'Mã lý do khi không thể đáp ứng (bắt buộc khi decision = cannot_fulfil)',
  })
  @IsOptional()
  @IsString()
  reasonCode?: string;

  @ApiPropertyOptional({
    description: 'Ghi chú giải trình (tối thiểu 10 ký tự khi decision = cannot_fulfil)',
  })
  @IsOptional()
  @IsString()
  note?: string;
}

export class SubmitRefundFormDto {
  @ApiProperty({ description: 'Tên ngân hàng nhận hoàn tiền', example: 'Vietcombank' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  bankName!: string;

  @ApiProperty({ description: 'Số tài khoản ngân hàng (6-20 chữ số)', example: '0123456789' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{6,20}$/, { message: 'Số tài khoản ngân hàng phải gồm từ 6 đến 20 chữ số' })
  accountNumber!: string;

  @ApiProperty({ description: 'Tên chủ tài khoản ngân hàng', example: 'NGUYEN VAN A' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  accountHolder!: string;

  @ApiProperty({ description: 'Số tiền xác nhận hoàn (phải khớp chính xác số tiền đã thanh toán)', example: 35000000 })
  @IsNumber()
  @Min(0)
  confirmAmount!: number;

  @ApiPropertyOptional({ description: 'Ghi chú thêm từ khách hàng' })
  @IsOptional()
  @IsString()
  note?: string;
}
