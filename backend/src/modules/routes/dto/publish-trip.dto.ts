import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class PublishTripDto {
  @ApiPropertyOptional({
    description: 'Chỉ đạo vận hành hoặc ghi chú bổ sung khi xuất bản lịch trình',
    example: 'Xe đã được khử trùng, bình oxy và thuốc dự phòng sẵn sàng.',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
