import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class UpdateStaffShiftDto {
  @ApiProperty({ example: 'Ca Ngày (06:00 - 14:00)' })
  @IsString()
  @IsNotEmpty()
  currentShift!: string;

  @ApiProperty({ enum: ['ON_DUTY', 'STANDBY', 'ON_ROUTE', 'RESTING', 'OFF_DUTY'] })
  @IsIn(['ON_DUTY', 'STANDBY', 'ON_ROUTE', 'RESTING', 'OFF_DUTY'])
  dutyStatus!: 'ON_DUTY' | 'STANDBY' | 'ON_ROUTE' | 'RESTING' | 'OFF_DUTY';
}
