import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RejectOrderDto {
  @ApiProperty({
    example: 'Tuyến đường biên giới hiện đang tạm ngưng tiếp nhận ngựa sống theo quy định thú y mới.',
    description: 'Detailed reason for rejecting the transport request',
  })
  @IsNotEmpty({ message: 'Lý do từ chối không được để trống' })
  @IsString()
  @MinLength(5, { message: 'Lý do từ chối phải có ít nhất 5 ký tự' })
  reason: string;
}
