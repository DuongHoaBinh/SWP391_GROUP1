import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';
import { BookingType } from '../../orders/booking-policy';

export class CreateRoadTripDto {
  @ApiProperty() @IsInt() @Min(1) vehicleId!: number;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) originLocation!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255) destinationLocation!: string;
  @ApiProperty() @IsDateString() plannedDeparture!: string;
  @ApiProperty() @IsDateString() plannedArrival!: string;
  @ApiProperty({ enum: ['shared_stall', 'dedicated_charter'] })
  @IsIn(['shared_stall', 'dedicated_charter']) bookingType!: BookingType;
}
