import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEnum, IsInt, ValidateNested } from 'class-validator';
import { ShipmentStaffRole } from '../fleet.types';

export class StaffAssignmentItemDto {
  @ApiProperty({ description: 'User ID của nhân viên (tài xế, hộ tống, điều phối)', example: 5 })
  @IsInt()
  userId!: number;

  @ApiProperty({
    description: 'Vai trò trong chuyến đi',
    enum: ShipmentStaffRole,
    example: ShipmentStaffRole.DRIVER,
  })
  @IsEnum(ShipmentStaffRole)
  roleInShipment!: ShipmentStaffRole;
}

export class AssignStaffDto {
  @ApiProperty({
    description: 'Danh sách nhân sự phân công cho chuyến đi',
    type: [StaffAssignmentItemDto],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => StaffAssignmentItemDto)
  assignments!: StaffAssignmentItemDto[];
}
