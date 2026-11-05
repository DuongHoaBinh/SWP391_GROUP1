import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type SandboxPaymentStatus = 'creating' | 'pending' | 'succeeded' | 'failed' | 'unknown';

export class ConfirmAtmSandboxDto {
  @IsOptional() @IsString() @MaxLength(50) @ApiPropertyOptional() cardNumber?: string;
  @IsOptional() @IsString() @MaxLength(100) @ApiPropertyOptional() cardHolder?: string;
  @IsOptional() @IsString() @MaxLength(20) @ApiPropertyOptional() issueDate?: string;
  @IsOptional() @IsString() @MaxLength(20) @ApiPropertyOptional() otp?: string;
}

export interface SandboxPayment {
  payment_id: number;
  shipment_id: number;
  customer_id: number;
  partner_code: string;
  request_type: 'captureWallet' | 'payWithATM';
  order_id: string;
  request_id: string;
  order_info: string;
  amount: number | string;
  status: SandboxPaymentStatus;
  pay_url: string | null;
  qr_content: string | null;
  result_code: number | null;
  result_message: string | null;
  trans_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export class MomoIpnDto {
  @IsString() @MaxLength(50) @ApiProperty() partnerCode: string;
  @IsString() @MaxLength(100) @ApiProperty() orderId: string;
  @IsString() @MaxLength(100) @ApiProperty() requestId: string;
  @IsInt() @Min(1) @ApiProperty() amount: number;
  @IsString() @MaxLength(255) @ApiProperty() orderInfo: string;
  @IsString() @MaxLength(100) @ApiProperty() orderType: string;
  @Transform(({ value }) => typeof value === 'number' ? String(value) : value)
  @IsString() @Matches(/^\d+$/) @MaxLength(30) @ApiProperty() transId: string;
  @IsInt() @ApiProperty() resultCode: number;
  @IsString() @MaxLength(1000) @ApiProperty() message: string;
  @IsString() @MaxLength(100) @ApiProperty() payType: string;
  @IsInt() @Min(0) @ApiProperty() responseTime: number;
  @IsString() @MaxLength(1000) @ApiProperty() extraData: string;
  @IsString() @Matches(/^[a-fA-F0-9]{64}$/) @ApiProperty() signature: string;
}
