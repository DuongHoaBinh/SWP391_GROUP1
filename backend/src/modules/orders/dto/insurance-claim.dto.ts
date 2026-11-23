import { IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { Severity } from '../insurance-policy';

export class CreateInsuranceClaimDto {
  @IsEnum(['M1', 'M2', 'M3', 'M4'], { message: 'Mức độ sự cố phải là M1, M2, M3 hoặc M4' })
  severity: Severity;

  @IsString()
  @IsNotEmpty({ message: 'Mô tả sự cố không được để trống' })
  @MinLength(20, { message: 'Mô tả sự cố phải có ít nhất 20 ký tự để làm căn cứ thẩm định' })
  description: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Chi phí thú y không được là số âm' })
  vetCostVnd?: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive({ message: 'Số tiền yêu cầu bồi thường phải lớn hơn 0' })
  requestedAmount: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  vetReportDocumentId?: number;
}

export class ReviewInsuranceClaimDto {
  @IsEnum(['start_review', 'approve', 'reject'], {
    message: 'Hành động duyệt phải là start_review, approve hoặc reject',
  })
  decision: 'start_review' | 'approve' | 'reject';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive({ message: 'Số tiền duyệt phải lớn hơn 0' })
  approvedAmount?: number;

  @IsOptional()
  @IsString()
  rejectionReasonCode?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
