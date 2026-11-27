import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import { AllocationService } from './allocation.service';
import { CityRestrictionDto, CityRestrictionExceptionDto, JourneyRulesDto, SwapReservedVehicleDto } from './dto/city-restriction.dto';

@ApiTags('Fleet — City restrictions (Step 9)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('fleet')
export class CityRestrictionsController {
  constructor(private readonly allocation: AllocationService) {}

  @Get('city-restrictions')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách quy tắc giờ cấm xe tải nội đô và ngoại lệ ngày lễ (dữ liệu demo)' })
  list() {
    return this.allocation.listCityRestrictions();
  }

  // Route tĩnh khai báo trước route động ':id'
  @Get('city-restrictions/check')
  @ApiOperation({ summary: 'Khung giờ xe được phép vào một điểm trong ngày (mọi user đã đăng nhập)' })
  @ApiQuery({ name: 'lat', required: true })
  @ApiQuery({ name: 'lng', required: true })
  @ApiQuery({ name: 'date', required: true, description: 'YYYY-MM-DD (giờ Việt Nam)' })
  @ApiQuery({ name: 'heavy', required: false, description: 'Xe tải nặng (mặc định true)' })
  check(@Query('lat') lat: string, @Query('lng') lng: string, @Query('date') date: string, @Query('heavy') heavy?: string) {
    return this.allocation.checkPoint(Number(lat), Number(lng), date, heavy !== 'false');
  }

  @Post('city-restrictions/exceptions')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Thêm ngoại lệ giờ cấm theo ngày (lễ, Tết) — thay thế khung cấm thường của thành phố ngày đó' })
  createException(@Body() dto: CityRestrictionExceptionDto) {
    return this.allocation.createException(dto);
  }

  @Delete('city-restrictions/exceptions/:id')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Xóa ngoại lệ giờ cấm' })
  deleteException(@Param('id', ParseIntPipe) id: number) {
    return this.allocation.deleteException(id);
  }

  @Post('city-restrictions')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo quy tắc giờ cấm (HH:mm, bán kính 1–50 km, bắt buộc căn cứ pháp lý)' })
  create(@Body() dto: CityRestrictionDto) {
    return this.allocation.createCityRestriction(dto);
  }

  @Patch('city-restrictions/:id')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Sửa quy tắc giờ cấm (tắt bằng isActive = false)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: CityRestrictionDto) {
    return this.allocation.updateCityRestriction(id, dto);
  }

  @Get('shipments/:id/reservations')
  @Roles(UserRole.CUSTOMER, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Phương án xe và các xe đang giữ chỗ của đơn (khách chỉ xem đơn của mình)' })
  reservations(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    return this.allocation.getShipmentReservations(user, id);
  }

  @Post('shipments/:id/reservations/swap')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Manager đổi một xe đã giữ sang xe khác (bắt buộc lý do)' })
  swap(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number, @Body() dto: SwapReservedVehicleDto) {
    return this.allocation.swapReservedVehicle(user, id, dto);
  }
}

@ApiTags('System settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('system-settings')
export class SystemSettingsController {
  constructor(private readonly allocation: AllocationService) {}

  @Get('journey-rules')
  @ApiOperation({ summary: 'Tham số nghỉ dọc đường cho ngựa (B4, tham chiếu EU 1/2005)' })
  getJourneyRules() {
    return this.allocation.getJourneyRules();
  }

  @Patch('journey-rules')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Cập nhật tham số nghỉ dọc đường' })
  updateJourneyRules(@CurrentUser() user: AuthenticatedUser, @Body() dto: JourneyRulesDto) {
    return this.allocation.updateJourneyRules(user, dto);
  }
}
