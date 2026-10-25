import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { RouteStopUpdateStatus } from '../routes.types';

export class RecordStopProgressDto {
  @ApiProperty({
    description: 'Trạng thái chặng thực tế',
    enum: RouteStopUpdateStatus,
    example: RouteStopUpdateStatus.ARRIVED,
  })
  @IsEnum(RouteStopUpdateStatus)
  @IsNotEmpty()
  status!: RouteStopUpdateStatus;

  @ApiPropertyOptional({ description: 'Thời gian thực tế đến (ISO)', example: '2026-10-15T12:15:00Z' })
  @IsString()
  @IsOptional()
  actualArrival?: string;

  @ApiPropertyOptional({ description: 'Thời gian thực tế rời đi (ISO)', example: '2026-10-15T14:10:00Z' })
  @IsString()
  @IsOptional()
  actualDeparture?: string;

  @ApiPropertyOptional({ description: 'Ghi chú tình trạng / lý do chậm trễ / hải quan', example: 'Đã hoàn tất kiểm tra hồ sơ FEI và thông quan thành công' })
  @IsString()
  @IsOptional()
  notes?: string;
}
