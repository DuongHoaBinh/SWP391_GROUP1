import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

export class AssignVehiclesDto {
  @ApiProperty({
    description: 'Danh sách ID các phương tiện cần phân công cho chuyến đi',
    example: [1],
    type: [Number],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  vehicleIds!: number[];
}
