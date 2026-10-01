import { IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldPassword123' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'NewPassword123', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu mới phải có tối thiểu 8 ký tự' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Mật khẩu mới phải bao gồm ít nhất một chữ cái và một chữ số',
  })
  newPassword: string;

  @ApiProperty({ example: 'NewPassword123' })
  @IsString()
  confirmPassword: string;
}
