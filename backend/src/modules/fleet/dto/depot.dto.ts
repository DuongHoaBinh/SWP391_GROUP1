import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

/** Trạm xe (Step 3, review 11/2026). type = partner: trạm đối tác ở nước ngoài. */
export class CreateDepotDto {
  @ApiProperty({ example: 'VN-HCM-TD', description: 'Mã trạm duy nhất (chữ in hoa, số, dấu gạch)' })
  @IsString()
  @Matches(/^[A-Za-z0-9-]{2,30}$/, { message: 'Mã trạm chỉ gồm chữ, số, dấu gạch ngang (2–30 ký tự)' })
  code!: string;

  @ApiProperty({ example: 'Trạm Thủ Đức' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: 'Vietnam' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  country!: string;

  @ApiProperty({ example: 'Hồ Chí Minh' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @ApiPropertyOptional({ example: 'Xa lộ Hà Nội, TP. Thủ Đức' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiProperty({ example: 10.8494 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: 106.7537 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiPropertyOptional({ enum: ['own', 'partner'], default: 'own' })
  @IsOptional()
  @IsIn(['own', 'partner'])
  type?: 'own' | 'partner';

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDepotDto extends PartialType(CreateDepotDto) {}
