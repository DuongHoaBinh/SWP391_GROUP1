import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  HORSE_MAX_WEIGHT_KG,
  HORSE_MIN_WEIGHT_KG,
  HorseGender,
  HorseStatus,
  parseAndNormalizeHorseWeight,
} from '../horses.types';

@ValidatorConstraint({ name: 'isValidHorseWeight', async: false })
export class IsValidHorseWeightConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return parseAndNormalizeHorseWeight(value) !== null;
  }

  defaultMessage(): string {
    return `Cân nặng ngựa phải là số hợp lệ từ ${HORSE_MIN_WEIGHT_KG} đến ${HORSE_MAX_WEIGHT_KG} kg (ví dụ: 480 kg).`;
  }
}

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
    description: 'Giới tính (male: đực, female: cái)',
    enum: HorseGender,
    example: HorseGender.MALE,
  })
  @IsEnum(HorseGender, { message: 'Giới tính chỉ chấp nhận male (đực) hoặc female (cái).' })
  @IsOptional()
  gender?: HorseGender;

  @ApiPropertyOptional({ description: 'Tuổi của ngựa (1–35)', example: 5 })
  @IsInt({ message: 'Tuổi ngựa phải là số nguyên.' })
  @Min(1, { message: 'Tuổi ngựa phải từ 1 đến 35.' })
  @Max(35, { message: 'Tuổi ngựa phải từ 1 đến 35.' })
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

  @ApiPropertyOptional({ description: 'Cân nặng ngựa (150–1200 kg)', example: '480 kg' })
  @IsString({ message: 'Cân nặng ngựa phải là chuỗi số hợp lệ (ví dụ: 480 kg).' })
  @Validate(IsValidHorseWeightConstraint)
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
