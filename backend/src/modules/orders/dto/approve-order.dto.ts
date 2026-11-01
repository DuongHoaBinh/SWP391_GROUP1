import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ApproveOrderDto {
  @ApiPropertyOptional({ example: 15000000, description: 'Estimated initial transport cost in VND' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999999999999)
  totalCost?: number;

  @ApiPropertyOptional({ example: 'Đơn hàng đủ điều kiện, chuyển sang bộ phận lập kế hoạch tuyến đường.', description: 'Approval note' })
  @IsOptional()
  @IsString()
  note?: string;
}
