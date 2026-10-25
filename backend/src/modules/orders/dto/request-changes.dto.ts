import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RequestChangesDto {
  @ApiProperty({
    example:
      'Vui lòng đổi ngày vận chuyển sang 16/10 do chuyến bay không khả dụng ngày 15/10 và cập nhật địa chỉ đón chi tiết.',
    description: 'Nội dung và lý do yêu cầu khách hàng chỉnh sửa đơn vận chuyển',
  })
  @IsNotEmpty({ message: 'Nội dung yêu cầu chỉnh sửa không được để trống' })
  @IsString()
  @MinLength(5, { message: 'Nội dung yêu cầu chỉnh sửa phải có ít nhất 5 ký tự' })
  reason: string;
}
