import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateExcusedDelayDto {
  @ApiProperty({ example: true, description: 'Bật/tắt cờ miễn trừ trễ khách quan khỏi Adjusted OTD' })
  @IsBoolean()
  excusedDelay!: boolean;

  @ApiPropertyOptional({ example: 'Tắc cửa khẩu bất khả kháng theo thông báo hải quan' })
  @IsOptional()
  @IsString()
  reason?: string;
}
