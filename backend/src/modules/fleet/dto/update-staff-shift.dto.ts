import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateStaffShiftDto {
  @ApiProperty({ example: 'Ca Ngày (06:00 - 14:00)' })
  @IsString()
  @IsNotEmpty()
  currentShift!: string;

  @ApiProperty({ enum: ['ON_DUTY', 'STANDBY', 'ON_ROUTE', 'RESTING', 'OFF_DUTY'] })
  @IsIn(['ON_DUTY', 'STANDBY', 'ON_ROUTE', 'RESTING', 'OFF_DUTY'])
  dutyStatus!: 'ON_DUTY' | 'STANDBY' | 'ON_ROUTE' | 'RESTING' | 'OFF_DUTY';

  @ApiPropertyOptional({ description: 'Giải phóng các chuyến đi đang gán để đưa nhân sự về trạng thái rảnh (0 chuyến)' })
  @IsOptional()
  @IsBoolean()
  releaseActiveTrips?: boolean;
}
