import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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

  @ApiPropertyOptional({
    example: 'air',
    enum: ['road', 'air'],
    description: 'Phương thức vận tải: road (đường bộ) hoặc air (hàng không)',
  })
  @IsOptional()
  @IsIn(['road', 'air'])
  transportMode?: 'road' | 'air';
}
