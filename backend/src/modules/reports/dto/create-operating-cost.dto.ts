import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { OperatingCostCategory } from '../reports.types';

export class CreateOperatingCostDto {
  @ApiProperty({ enum: OperatingCostCategory, example: OperatingCostCategory.FUEL })
  @IsEnum(OperatingCostCategory)
  costCategory!: OperatingCostCategory;

  @ApiProperty({ example: 3500000, description: 'Số tiền chi phí thực tế (VND)' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount!: number;

  @ApiPropertyOptional({ description: 'ID chặng lộ trình phát sinh chi phí (nếu có)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  routeLegId?: number;

  @ApiPropertyOptional({ description: 'Đường dẫn ảnh/biên lai chi phí' })
  @IsOptional()
  @IsString()
  receiptUrl?: string;

  @ApiPropertyOptional({ description: 'Ghi chú chi tiết khoản chi' })
  @IsOptional()
  @IsString()
  notes?: string;
}
