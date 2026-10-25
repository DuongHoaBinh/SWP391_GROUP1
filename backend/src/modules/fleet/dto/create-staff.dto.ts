import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

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
    description: 'ID vai trò (2: Logistics Manager, 3: Transport Specialist, 4: Fleet & Route Coordinator, 5: Vehicle Driver / Escort)',
    example: 5,
  })
  @IsInt()
  roleId!: number;

  @ApiPropertyOptional({
    description: 'Mật khẩu khởi tạo (Mặc định: Password123)',
    example: 'Password123',
  })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Mật khẩu phải tối thiểu 6 ký tự' })
  password?: string;

  @ApiPropertyOptional({
    description: 'Chuyên môn đối với Driver / Escort: "driver" (Tài xế chuyên dụng) hoặc "escort" (Bác sĩ thú y / Hộ tống)',
    example: 'driver',
  })
  @IsOptional()
  @IsString()
  specialization?: string;
}
