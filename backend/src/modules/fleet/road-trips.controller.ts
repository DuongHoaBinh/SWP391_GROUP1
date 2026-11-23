import { Body, Controller, Get, GoneException, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
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
@Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
@Controller('fleet/road-trips')
export class RoadTripsController {
  constructor(private readonly store: RoadTripsStore) {}
  // Giữ lại để xem chuyến của đơn cũ.
  @Get() @ApiOperation({ summary: 'Danh sách chuyến đường bộ (chỉ để xem lại đơn cũ)' })
  list() { return this.store.list(); }

  // Bỏ gom chuyến sau review 11/2026: không tạo chuyến ghép thủ công nữa. Chặng đường bộ của đơn mới
  // vẫn tự tạo road_trip riêng khi lưu kế hoạch (RoadTripsStore.prepareLegs).
  @Post() @ApiExcludeEndpoint()
  create(@CurrentUser() _user: AuthenticatedUser, @Body() _dto: CreateRoadTripDto): never {
    throw new GoneException('Tính năng ghép chuyến đã ngừng. Mỗi đơn đi xe riêng; chuyến được tạo tự động khi lưu kế hoạch.');
  }
}
