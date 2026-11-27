import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { HorseGender, HorseStatus, HorseTemperament } from '../horses.types';

export class CreateHorseDto {
  @ApiProperty({ description: 'Tên con ngựa', example: 'Thunder Bolt' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Giống loài', example: 'Thoroughbred' })
  @IsString()
  @IsOptional()
  breed?: string;

  @ApiPropertyOptional({
    description: 'Giới tính (male: đực giống, female: cái, gelding: ngựa thiến)',
    enum: HorseGender,
    example: HorseGender.MALE,
  })
  @IsEnum(HorseGender, { message: 'Giới tính phải là male, female hoặc gelding' })
  @IsOptional()
  gender?: HorseGender;

  @ApiPropertyOptional({ description: 'Tuổi của ngựa', example: 5 })
  @IsInt()
  @Min(1)
  @Max(35)
  @IsOptional()
  age?: number;

  @ApiProperty({ description: 'Số vi mạch microchip', example: '985141001248999' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập Microchip Number (Số vi mạch).' })
  microchipNo!: string;

  @ApiProperty({ description: 'Số hộ chiếu FEI', example: 'FEI-VN-2026-888' })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập FEI Passport Number (Số hộ chiếu FEI).' })
  passportNo!: string;

  @ApiPropertyOptional({ description: 'Trạng thái', enum: HorseStatus, example: HorseStatus.ACTIVE })
  @IsEnum(HorseStatus)
  @IsOptional()
  status?: HorseStatus;

  @ApiPropertyOptional({ description: 'Số lượng con ngựa (luôn là 1 cho mỗi hồ sơ Microchip cá thể)', example: 1, default: 1 })
  @IsInt()
  @Min(1)
  @Max(1, { message: 'Mỗi hồ sơ cá thể ngựa gắn với 1 mã Microchip duy nhất, số lượng tối đa là 1.' })
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

  @ApiPropertyOptional({ description: 'Tính khí', enum: HorseTemperament, example: HorseTemperament.NORMAL, default: HorseTemperament.NORMAL })
  @IsEnum(HorseTemperament)
  @IsOptional()
  temperament?: HorseTemperament;
}
