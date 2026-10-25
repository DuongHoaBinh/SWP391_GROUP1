import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class NotifyMissingDocumentsDto {
  @ApiPropertyOptional({
    example: 'Vui lòng bổ sung Giấy xét nghiệm máu âm tính trước ngày 10/10 để kịp nộp Cục Thú Y.',
    description: 'Tin nhắn bổ sung từ chuyên viên gửi tới khách hàng',
  })
  @IsOptional()
  @IsString()
  customMessage?: string;
}
