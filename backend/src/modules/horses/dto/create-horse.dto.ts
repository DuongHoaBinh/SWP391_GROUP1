import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { HorseGender, HorseStatus } from '../horses.types';

export class CreateHorseDto {
  @ApiProperty({ description: 'Tên con ngựa', example: 'Thunder Bolt' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Giống loài', example: 'Thoroughbred' })
  @IsString()
  @IsOptional()
  breed?: string;

  @ApiPropertyOptional({ description: 'Giới tính', enum: HorseGender, example: HorseGender.MALE })
  @IsEnum(HorseGender)
  @IsOptional()
  gender?: HorseGender;

  @ApiPropertyOptional({ description: 'Tuổi của ngựa', example: 5 })
  @IsInt()
  @Min(1)
  @Max(35)
  @IsOptional()
  age?: number;

  @ApiPropertyOptional({ description: 'Ngày sinh (YYYY-MM-DD)', example: '2021-04-15' })
  @IsString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'Số vi mạch microchip', example: '985141001248999' })
  @IsString()
  @IsOptional()
  microchipNo?: string;

  @ApiPropertyOptional({ description: 'Số hộ chiếu FEI', example: 'FEI-VN-2026-888' })
  @IsString()
  @IsOptional()
  passportNo?: string;

  @ApiPropertyOptional({ description: 'Trạng thái', enum: HorseStatus, example: HorseStatus.ACTIVE })
  @IsEnum(HorseStatus)
  @IsOptional()
  status?: HorseStatus;

  @ApiPropertyOptional({ description: 'Số lượng con ngựa', example: 5, default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  quantity?: number;

  @ApiPropertyOptional({ description: 'Đường dẫn ảnh đại diện của ngựa', example: '/uploads/horses/123456.jpg' })
  @IsString()
  @IsOptional()
  photoUrl?: string;

  @ApiPropertyOptional({ description: 'Màu lông', example: 'Bay' })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiPropertyOptional({ description: 'Cân nặng', example: '480 kg' })
  @IsString()
  @IsOptional()
  weight?: string;

  @ApiPropertyOptional({ description: 'Tình trạng sức khỏe', example: 'Healthy' })
  @IsString()
  @IsOptional()
  medicalStatus?: string;

  @ApiPropertyOptional({ description: 'Yêu cầu y tế / chăm sóc đặc biệt', example: 'Kiểm tra nhiệt độ định kỳ' })
  @IsString()
  @IsOptional()
  specialRequirements?: string;
}
