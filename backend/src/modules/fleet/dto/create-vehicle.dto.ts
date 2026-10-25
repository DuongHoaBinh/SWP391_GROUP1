import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { VehicleStatus, VehicleType } from '../fleet.types';

export class CreateVehicleDto {
  @ApiProperty({
    description: 'Loại phương tiện vận chuyển ngựa',
    enum: VehicleType,
    example: VehicleType.TRUCK,
  })
  @IsEnum(VehicleType)
  @IsNotEmpty()
  vehicleType!: VehicleType;

  @ApiProperty({
    description: 'Biển số xe hoặc mã chuồng máy bay/container',
    example: '51C-888.99',
  })
  @IsString()
  @IsNotEmpty()
  plateOrCode!: string;

  @ApiProperty({
    description: 'Sức chứa tối đa (số lượng ngựa)',
    example: 4,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  capacity!: number;

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
