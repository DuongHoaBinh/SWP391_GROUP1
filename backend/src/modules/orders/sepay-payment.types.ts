import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export type PaymentRecordStatus =
  | 'PENDING'
  | 'AWAITING_CONFIRMATION'
  | 'PAID'
  | 'NEEDS_REVIEW'
  | 'EXPIRED'
  | 'CANCELLED';

export interface PaymentConfigEntity {
  configId: number;
  bankCode: string;
  bankAccountNo: string;
  bankAccountName: string;
  paymentCodePrefix: string;
  expireHours: number;
  updatedBy: number | null;
  updatedAt: string;
}

export interface ShipmentPaymentEntity {
  paymentId: number;
  shipmentId: number;
  customerId: number;
  paymentCode: string;
  amount: number;
  status: PaymentRecordStatus;
  expiresAt: string;
  paidAt: string | null;
  confirmedBy: string | null;
  sepayTransactionId: string | null;
  referenceCode: string | null;
  gateway: string | null;
  paidAmount: number | null;
  rawWebhookPayload: any | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentInvoiceEntity {
  invoiceId: number;
  invoiceNumber: string;
  paymentId: number;
  shipmentId: number;
  orderCode: string;
  payerName: string;
  payerEmail: string | null;
  paidAt: string;
  amount: number;
  transferContent: string;
  bankCode: string;
  bankAccountNo: string;
  bankAccountName: string;
  confirmedBy: string;
  createdAt: string;
}

export interface PaymentHistoryEntity {
  historyId: number;
  paymentId: number;
  shipmentId: number;
  oldStatus: string | null;
  newStatus: string;
  actor: string;
  notes: string | null;
  createdAt: string;
}

export class UpdatePaymentConfigDto {
  @IsString()
  @MaxLength(50)
  @ApiProperty({ example: 'MBBank' })
  bankCode!: string;

  @IsString()
  @MaxLength(50)
  @ApiProperty({ example: '0000123456789' })
  bankAccountNo!: string;

  @IsString()
  @MaxLength(150)
  @ApiProperty({ example: 'CONG TY VAN CHUYEN NGUA EQUITRANSIT' })
  bankAccountName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @ApiPropertyOptional({ example: 'EQT' })
  paymentCodePrefix?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  @ApiPropertyOptional({ example: 48 })
  expireHours?: number;
}

export class SepayWebhookPayloadDto {
  @IsOptional()
  @ApiPropertyOptional({ example: 92704 })
  id?: number | string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'MBBank' })
  gateway?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: '2026-10-29 10:30:00' })
  transactionDate?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: '0000123456789' })
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'EQT039' })
  code?: string | null;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'EQT039 chuyen khoan van chuyen ngua' })
  content?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'in' })
  transferType?: string;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ example: 1000000 })
  transferAmount?: number;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ example: 19077000 })
  accumulated?: number;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  subAccount?: string | null;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'FT26302987654' })
  referenceCode?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  description?: string;
}

export class SimulateSepayWebhookDto {
  @IsInt()
  @ApiProperty({ example: 41 })
  shipmentId!: number;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional({ description: 'Số tiền chuyển giả lập (để trống = đúng bằng số tiền báo giá)' })
  transferAmount?: number;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Nội dung chuyển khoản giả lập' })
  content?: string;
}

export class ManualConfirmPaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @ApiPropertyOptional()
  notes?: string;
}

