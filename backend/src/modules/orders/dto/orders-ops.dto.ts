import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CancellationCategory, RefundMode } from '../refund-policy';

export class OperationalCancelDto {
  @ApiProperty({ enum: CancellationCategory })
  @IsEnum(CancellationCategory)
  category!: CancellationCategory;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({ enum: RefundMode })
  @IsOptional()
  @IsEnum(RefundMode)
  refundMode?: RefundMode;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  nonRefundableAirCost?: number;
}

export class CreateDisbursementDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  authorityName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  feeType!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  authorityReceiptUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ApproveRefundDto {
  @ApiPropertyOptional({ enum: ['approve', 'reject'] })
  @IsOptional()
  @IsEnum(['approve', 'reject'])
  decision?: 'approve' | 'reject';

  @ApiPropertyOptional({ enum: RefundMode })
  @IsOptional()
  @IsEnum(RefundMode)
  refundMode?: RefundMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class TransferRefundDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recipientBankAccount?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bankTransactionRef!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transferReceiptUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SubmitRefundBankInfoDto {
  @ApiProperty({ description: 'Tên ngân hàng thụ hưởng' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên ngân hàng' })
  bankName!: string;

  @ApiProperty({ description: 'Số tài khoản ngân hàng thụ hưởng' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập số tài khoản ngân hàng' })
  accountNumber!: string;

  @ApiProperty({ description: 'Tên chủ tài khoản (không dấu / viết hoa)' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên chủ tài khoản' })
  accountHolder!: string;

  @ApiPropertyOptional({ description: 'Ghi chú bổ sung từ chủ ngựa' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class GrantPaymentGraceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
