import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import { RoadTripsStore } from './road-trips.store';
import { CreateRoadTripDto } from './dto/create-road-trip.dto';

@ApiTags('Fleet - Road trips') @ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.FLEET_ROUTE_COORDINATOR, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
@Controller('fleet/road-trips')
export class RoadTripsController {
  constructor(private readonly store: RoadTripsStore) {}
  @Get() list() { return this.store.list(); }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRoadTripDto) { return this.store.create(dto, Number(user.id)); }
}
