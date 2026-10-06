import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoutesService } from './routes.service';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { RecordStopProgressDto } from './dto/record-stop-progress.dto';
import { PublishTripDto } from './dto/publish-trip.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';

@ApiTags('Routes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Get('shipment/:shipmentId')
  @ApiOperation({ summary: 'Lấy thông tin lộ trình và danh sách điểm dừng của đơn vận chuyển' })
  getRouteByShipmentId(@Param('shipmentId', ParseIntPipe) shipmentId: number) {
    return this.routesService.getRouteByShipmentId(shipmentId);
  }

  @Get('shipment/:shipmentId/plan')
  @ApiOperation({
    summary:
      'Lấy toàn bộ kế hoạch chuyến đi (lộ trình, xe, tài xế/hộ tống) và đánh giá tính hợp lệ để xuất bản (isReadyToPublish)',
  })
  getFullTripPlan(@Param('shipmentId', ParseIntPipe) shipmentId: number) {
    return this.routesService.getFullTripPlan(shipmentId);
  }

  @Post('shipment/:shipmentId')
  @Roles(UserRole.FLEET_ROUTE_COORDINATOR, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Fleet Coordinator lập/cập nhật lộ trình di chuyển gồm các chặng/điểm dừng (nghỉ ngơi, cửa khẩu, kiểm dịch)',
  })
  createOrUpdateRoute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: CreateRouteDto,
  ) {
    return this.routesService.createOrUpdateRoute(user, shipmentId, dto);
  }

  @Patch(':routeId/schedule')
  @Roles(UserRole.FLEET_ROUTE_COORDINATOR, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Điều chỉnh lịch trình các chặng (Bắt buộc phải có lý do điều chỉnh reason để bảo toàn audit trail)',
  })
  updateSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('routeId', ParseIntPipe) routeId: number,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.routesService.updateSchedule(user, routeId, dto);
  }

  @Post('shipment/:shipmentId/publish')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.FLEET_ROUTE_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Logistics Manager / Coordinator phê duyệt và xuất bản kế hoạch chuyến đi (Bắt buộc kiểm tra đủ xe, tài xế và lộ trình)',
  })
  publishTripPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: PublishTripDto,
  ) {
    return this.routesService.publishTripPlan(user, shipmentId, dto);
  }

  @Post('stops/:stopId/progress')
  @Roles(
    UserRole.DRIVER_ESCORT,
    UserRole.FLEET_ROUTE_COORDINATOR,
    UserRole.LOGISTICS_MANAGER,
    UserRole.ADMIN,
  )
  @ApiOperation({
    summary:
      'Tài xế (Driver) / Hộ tống (Escort) cập nhật mốc thực tế tại điểm dừng (Đã đến, Đã thông quan, Đã rời trạm, Đã bàn giao)',
  })
  recordStopProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('stopId', ParseIntPipe) stopId: number,
    @Body() dto: RecordStopProgressDto,
  ) {
    return this.routesService.recordStopProgress(user, stopId, dto);
  }
}
