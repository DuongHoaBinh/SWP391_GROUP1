import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateStaffDto {
  @ApiProperty({ description: 'Họ và tên nhân sự', example: 'Nguyễn Văn A' })
  @IsString()
  @IsNotEmpty({ message: 'Họ và tên không được để trống' })
  fullName!: string;

  @ApiProperty({ description: 'Email đăng nhập', example: 'staff.nguyen@example.com' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email!: string;

  @ApiPropertyOptional({ description: 'Số điện thoại', example: '0901234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    description: 'ID vai trò (2: Logistics Manager, 5: Vehicle Driver / Escort)',
    example: 5,
  })
  @IsInt()
  @IsIn([2, 5], { message: 'Vai trò không hợp lệ (chỉ chấp nhận 2: Logistics Manager hoặc 5: Vehicle Driver / Escort)' })
  roleId!: number;

  @ApiPropertyOptional({
    description: 'Mật khẩu khởi tạo (tối thiểu 8 ký tự; nếu bỏ trống hệ thống tự sinh mật khẩu ngẫu nhiên an toàn)',
  })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Mật khẩu phải tối thiểu 8 ký tự' })
  password?: string;

  @ApiPropertyOptional({
    description: 'Chuyên môn đối với Driver / Escort: "driver" (Tài xế chuyên dụng) hoặc "escort" (Bác sĩ thú y / Hộ tống)',
    example: 'driver',
  })
  @IsOptional()
  @IsString()
  @IsIn(['driver', 'escort'], { message: 'Chuyên môn chỉ chấp nhận driver hoặc escort' })
  specialization?: string;
}
