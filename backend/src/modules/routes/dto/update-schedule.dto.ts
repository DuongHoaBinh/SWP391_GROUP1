import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

export class StopScheduleUpdateItemDto {
  @ApiProperty({ description: 'ID của điểm dừng (route_stop_id)', example: 1 })
  @IsInt()
  stopId!: number;

  @ApiPropertyOptional({ description: 'Thời gian dự kiến đến mới (ISO)', example: '2026-10-15T13:30:00Z' })
  @IsString()
  @IsOptional()
  plannedArrival?: string;

  @ApiPropertyOptional({ description: 'Thời gian dự kiến xuất phát mới (ISO)', example: '2026-10-15T15:00:00Z' })
  @IsString()
  @IsOptional()
  plannedDeparture?: string;
}

export class UpdateScheduleDto {
  @ApiProperty({
    description: 'Lý do thay đổi lịch trình (Bắt buộc theo nghiệp vụ Flow 3)',
    example: 'Ùn tắc tại cửa khẩu do thủ tục kiểm dịch bổ sung',
  })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiProperty({
    description: 'Danh sách các điểm dừng cần cập nhật lịch trình',
    type: [StopScheduleUpdateItemDto],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => StopScheduleUpdateItemDto)
  stops!: StopScheduleUpdateItemDto[];
}
