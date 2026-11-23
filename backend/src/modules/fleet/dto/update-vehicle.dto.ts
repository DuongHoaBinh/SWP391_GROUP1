import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { VehicleStatus, VehicleType } from '../fleet.types';

export class UpdateVehicleDto {
  @ApiPropertyOptional({ example: 'truck_4', description: 'Đổi loại phương tiện; capacity cập nhật theo loại' })
  @IsOptional()
  @IsString()
  vehicleClassCode?: string;

  @ApiPropertyOptional({ example: 1, description: 'Chuyển xe sang trạm khác' })
  @IsOptional()
  @IsInt()
  @Min(1)
  depotId?: number;

  @ApiPropertyOptional({ enum: VehicleType })
  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  @ApiPropertyOptional({ example: '51C-888.99' })
  @IsOptional()
  @IsString()
  plateOrCode?: string;

  @ApiPropertyOptional({ example: 4, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({ enum: VehicleStatus })
  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  @ApiPropertyOptional({ example: 'Tan Son Nhat Airport Hub' })
  @IsOptional()
  @IsString()
  currentLocation?: string;
}
