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
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  recipientBankAccount!: string;

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

export class UpgradeCharterDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  charterTransportCost!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RescheduleSharedDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  newDepartureDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class GrantPaymentGraceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class SlaFallbackDto {
  @ApiProperty({
    enum: ['internal_reassignment', 'external_contractor', 'reschedule_free', 'cancel_refund'],
  })
  @IsEnum(['internal_reassignment', 'external_contractor', 'reschedule_free', 'cancel_refund'])
  option!: 'internal_reassignment' | 'external_contractor' | 'reschedule_free' | 'cancel_refund';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  newDepartureDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
