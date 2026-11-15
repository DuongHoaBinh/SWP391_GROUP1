import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({
    description: 'Google OAuth token (ID token credential or access token)',
    example: 'eyJhbGciOiJSUzI1NiIs...',
  })
  @IsNotEmpty({ message: 'Token Google không được để trống' })
  @IsString({ message: 'Token Google phải là chuỗi ký tự' })
  token: string;

  @ApiProperty({
    description: 'Loại token (id_token hoặc access_token)',
    required: false,
    example: 'id_token',
  })
  @IsOptional()
  @IsString()
  type?: string;
}
