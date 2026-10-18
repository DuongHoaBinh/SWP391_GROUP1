import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DeclineAssignmentDto {
  @ApiProperty({ description: 'Lý do từ chối nhận chuyến của tài xế/hộ tống', example: 'Sốt cao đột xuất / Sức khỏe không đảm bảo' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng cung cấp lý do từ chối chuyến đi' })
  reason!: string;

  @ApiPropertyOptional({ description: 'ID nhân sự từ chối (dành cho Admin thao tác thay)' })
  @IsOptional()
  driverUserId?: number;
}
