import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ReportIncidentDto {
  @ApiProperty({
    example: 'traffic_delay',
    enum: ['vehicle_breakdown', 'traffic_delay', 'horse_medical', 'weather', 'border_issue', 'other'],
  })
  @IsString()
  @IsNotEmpty({ message: 'Loại sự cố không được để trống' })
  @IsIn(['vehicle_breakdown', 'traffic_delay', 'horse_medical', 'weather', 'border_issue', 'other'])
  incidentType!: string;

  @ApiProperty({ example: 'Tắc đường nghiêm trọng trên cao tốc' })
  @IsString()
  @IsNotEmpty({ message: 'Mô tả sự cố không được để trống' })
  description!: string;

  @ApiPropertyOptional({ enum: ['low', 'medium', 'high', 'critical'], default: 'high' })
  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  severity?: 'low' | 'medium' | 'high' | 'critical';
}
