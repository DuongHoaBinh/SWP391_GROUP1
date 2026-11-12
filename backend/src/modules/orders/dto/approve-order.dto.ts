import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min, Max } from 'class-validator';

export class ApproveOrderDto {
  @ApiPropertyOptional({ example: 15000000, description: 'Cước vận chuyển cơ bản VNĐ, chưa cộng bảo hiểm; ưu tiên hơn trường totalCost cũ' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999999999999)
  transportCost?: number;

  @ApiPropertyOptional({ example: 15000000, description: 'Cước cơ bản VNĐ (tên trường cũ); server cộng phí bảo hiểm một lần' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999999999999)
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
