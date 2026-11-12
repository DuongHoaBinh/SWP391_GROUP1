import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min, Max } from 'class-validator';
import { BookingType } from '../booking-policy';

export class ApproveOrderDto {
  @ApiPropertyOptional({ minimum: 1, description: 'Đơn giá VNĐ mỗi ô/ngựa cho shared_stall. Server nhân số ngựa, rồi cộng bảo hiểm.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9999999999999)
  stallUnitPrice?: number;

  @ApiPropertyOptional({ enum: ['shared_stall', 'dedicated_charter'], description: 'Hình thức Manager đang báo giá; kiểm tra dữ liệu cũ, không đổi lựa chọn Customer' })
  @IsOptional()
  @IsIn(['shared_stall', 'dedicated_charter'])
  bookingType?: BookingType;

  @ApiPropertyOptional({ minimum: 1, description: 'Số ngựa Manager nhìn thấy, bắt buộc với stallUnitPrice' })
  @IsOptional()
  @IsInt()
  @Min(1)
  quotedHorseCount?: number;

  @ApiPropertyOptional({ example: 15000000, description: 'Cước vận chuyển cơ bản VNĐ, chưa cộng bảo hiểm; ưu tiên hơn trường totalCost cũ' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9999999999999)
  transportCost?: number;

  @ApiPropertyOptional({ example: 15000000, description: 'Cước cơ bản VNĐ (tên trường cũ); server cộng phí bảo hiểm một lần' })
  @IsOptional()
  @IsInt()
  @Min(1)
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
