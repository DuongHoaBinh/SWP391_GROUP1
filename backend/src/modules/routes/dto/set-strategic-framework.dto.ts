import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class SetStrategicFrameworkDto {
  @ApiPropertyOptional({ description: 'ID của Fleet & Route Coordinator được chỉ định phụ trách' })
  @IsOptional()
  @IsInt()
  assignedCoordinatorId?: number;

  @ApiProperty({ description: 'Loại phương tiện đường bộ yêu cầu (ví dụ: Xe thùng chuyên dụng điều hòa nhiệt độ)' })
  @IsString()
  managerVehicleType!: string;

  @ApiPropertyOptional({ description: 'ID hãng hàng không chỉ định cho chuyến bay quốc tế' })
  @IsOptional()
  @IsInt()
  managerAirlineId?: number;

  @ApiPropertyOptional({ description: 'ID sân bay xuất phát cargo' })
  @IsOptional()
  @IsInt()
  managerDepartureAirportId?: number;

  @ApiPropertyOptional({ description: 'ID sân bay đến cargo' })
  @IsOptional()
  @IsInt()
  managerArrivalAirportId?: number;

  @ApiPropertyOptional({ description: 'Tuyến đường/hành lang chính (ví dụ: Tuyến qua Sân bay Cần Thơ / Tuyến qua Tân Sơn Nhất)' })
  @IsOptional()
  @IsString()
  managerMainCorridor?: string;

  @ApiPropertyOptional({ description: 'Ghi chú chỉ đạo chiến lược từ Manager' })
  @IsOptional()
  @IsString()
  strategicNotes?: string;
}
