import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { VehicleStatus, VehicleType } from '../fleet.types';

export class CreateVehicleDto {
  @ApiPropertyOptional({
    description: 'Mã loại phương tiện (vehicle_class). Khi có, vehicleType và capacity được lấy theo loại (Step 3)',
    example: 'truck_4',
  })
  @IsString()
  @IsOptional()
  vehicleClassCode?: string;

  @ApiPropertyOptional({ description: 'Trạm xe quản lý phương tiện (bắt buộc với xe đường bộ)', example: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  depotId?: number;

  @ApiPropertyOptional({
    description: 'Loại phương tiện cũ (chỉ dùng khi không gửi vehicleClassCode)',
    enum: VehicleType,
    example: VehicleType.TRUCK,
  })
  @IsEnum(VehicleType)
  @IsOptional()
  vehicleType?: VehicleType;

  @ApiProperty({
    description: 'Biển số xe hoặc mã chuồng máy bay/container',
    example: '51C-888.99',
  })
  @IsString()
  @IsNotEmpty()
  plateOrCode!: string;

  @ApiPropertyOptional({
    description: 'Sức chứa (số ngựa). Bỏ qua nếu loại phương tiện có sức chứa cố định; bắt buộc với ferry_slot hoặc khi không gửi loại',
    example: 4,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  capacity?: number;

  @ApiPropertyOptional({
    description: 'Trạng thái hoạt động',
    enum: VehicleStatus,
    default: VehicleStatus.AVAILABLE,
  })
  @IsEnum(VehicleStatus)
  @IsOptional()
  status?: VehicleStatus;

  @ApiPropertyOptional({
    description: 'Vị trí hiện tại hoặc căn cứ đỗ của phương tiện',
    example: 'Tan Son Nhat Airport Hub',
  })
  @IsString()
  @IsOptional()
  currentLocation?: string;
}
