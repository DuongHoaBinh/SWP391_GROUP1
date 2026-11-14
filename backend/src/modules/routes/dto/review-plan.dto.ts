import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class ReviewPlanDto {
  @ApiProperty({ enum: ['approved', 'rejected'], description: 'Quyết định phê duyệt hoặc từ chối kế hoạch' })
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected';

  @ApiPropertyOptional({ description: 'Lý do trả về nếu từ chối kế hoạch để Coordinator sửa lại' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiPropertyOptional({ description: 'Cước vận chuyển chính thức được Manager chốt sau khi biết lộ trình và khoảng cách thực tế' })
  @IsOptional()
  @IsNumber()
  transportCost?: number;
}
