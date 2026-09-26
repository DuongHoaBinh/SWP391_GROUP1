import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ApproveOrderDto {
  @ApiPropertyOptional({ example: 15000000, description: 'Estimated initial transport cost in VND' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalCost?: number;

  @ApiPropertyOptional({ example: 'Đơn hàng đủ điều kiện, chuyển sang bộ phận lập kế hoạch tuyến đường.', description: 'Approval note' })
  @IsOptional()
  @IsString()
  note?: string;
}
