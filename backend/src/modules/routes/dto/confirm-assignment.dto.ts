import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ConfirmAssignmentDto {
  @ApiPropertyOptional({ description: 'Ghi chú hoặc lời nhắn xác nhận của tài xế/hộ tống khi nhận chuyến' })
  @IsOptional()
  @IsString()
  confirmationNotes?: string;

  @ApiPropertyOptional({ description: 'ID tài xế cần xác nhận (cho phép Admin xác nhận thay hoặc gán chỉ định)' })
  @IsOptional()
  driverUserId?: number;
}
