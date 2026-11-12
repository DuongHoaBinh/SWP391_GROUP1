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
import { SetStrategicFrameworkDto } from './dto/set-strategic-framework.dto';
import { BuildDetailedPlanDto } from './dto/build-detailed-plan.dto';
import { ReviewPlanDto } from './dto/review-plan.dto';
import { ConfirmAssignmentDto } from './dto/confirm-assignment.dto';
import { DeclineAssignmentDto } from './dto/decline-assignment.dto';
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

  @Get('master-data')
  @ApiOperation({ summary: 'Lấy dữ liệu danh mục nền cho Flow 3 (Hãng hàng không, Sân bay, Trạm dừng mẫu)' })
  getMasterData() {
    return this.routesService.getMasterData();
  }

  @Get('shipment/:shipmentId')
  @ApiOperation({ summary: 'Lấy thông tin lộ trình và danh sách điểm dừng của đơn vận chuyển' })
  getRouteByShipmentId(@CurrentUser() user: AuthenticatedUser, @Param('shipmentId', ParseIntPipe) shipmentId: number) {
    return this.routesService.getRouteByShipmentId(shipmentId, user);
  }

  @Get('shipment/:shipmentId/plan')
  @ApiOperation({
    summary:
      'Lấy toàn bộ kế hoạch chuyến đi (lộ trình, các chặng, xe, tài xế/hộ tống) và đánh giá tính hợp lệ để xuất bản (isReadyToPublish)',
  })
  getFullTripPlan(@CurrentUser() user: AuthenticatedUser, @Param('shipmentId', ParseIntPipe) shipmentId: number) {
    return this.routesService.getFullTripPlan(shipmentId, user);
  }

  // --- Step 1a: Manager Sets Strategic Framework ---
  @Post('plan/:shipmentId/strategic-framework')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Bước 1a: Logistics Manager lập khung kế hoạch chiến lược (loại xe, hãng bay, tuyến chính, giao Coordinator)',
  })
  setStrategicFramework(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: SetStrategicFrameworkDto,
  ) {
    return this.routesService.setStrategicFramework(user, shipmentId, dto);
  }

  // --- Step 1b: Coordinator Builds Detailed Plan ---
  @Post('plan/:shipmentId/build-detail')
  @Roles(UserRole.FLEET_ROUTE_COORDINATOR, UserRole.ADMIN, UserRole.LOGISTICS_MANAGER)
  @ApiOperation({
    summary: 'Bước 1b: Coordinator dựng kế hoạch chi tiết các chặng (Legs), gán xe cụ thể, chuyến bay và điểm dừng',
  })
  buildDetailedPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: BuildDetailedPlanDto,
  ) {
    return this.routesService.buildDetailedPlan(user, shipmentId, dto);
  }

  @Post('plan/:shipmentId/submit')
  @Roles(UserRole.FLEET_ROUTE_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Coordinator gửi duyệt kế hoạch chi tiết cho Manager (chuyển sang pending_approval)',
  })
  submitPlanForApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
  ) {
    return this.routesService.submitPlanForApproval(user, shipmentId);
  }

  // --- Step 2: Manager Reviews Plan ---
  @Post('plan/:shipmentId/review')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Bước 2: Logistics Manager phê duyệt kế hoạch (approved) hoặc trả về kèm lý do (draft)',
  })
  reviewTripPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: ReviewPlanDto,
  ) {
    return this.routesService.reviewTripPlan(user, shipmentId, dto);
  }

  // --- Step 3: Driver Confirms Assignment ---
  @Post('plan/:shipmentId/driver-confirm')
  @Roles(UserRole.DRIVER_ESCORT, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Bước 3: Tài xế / Hộ tống viên xác nhận nhận nhiệm vụ chuyến đi (khi đủ tất cả xác nhận chuyển sang confirmed)',
  })
  confirmTripAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: ConfirmAssignmentDto,
  ) {
    return this.routesService.confirmTripAssignment(user, shipmentId, dto);
  }

  @Post('plan/:shipmentId/driver-decline')
  @Roles(UserRole.DRIVER_ESCORT, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Bước 3 (Từ chối): Tài xế / Hộ tống viên từ chối nhận chuyến kèm lý do',
  })
  declineTripAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: DeclineAssignmentDto,
  ) {
    return this.routesService.declineTripAssignment(user, shipmentId, dto);
  }

  // --- Step 4: Ready to Depart Gate ---
  @Get('plan/:shipmentId/readiness')
  @ApiOperation({
    summary: 'Bước 4: Kiểm tra cổng hội tụ Ready to depart (Cả 3 điều kiện: Lộ trình Confirmed + Hồ sơ Flow 2 đạt 100% + SePay thanh toán thành công)',
  })
  getTripPlanReadiness(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
  ) {
    return this.routesService.getTripPlanReadiness(user, shipmentId);
  }

  // --- Legacy Compatibility ---
  @Post('shipment/:shipmentId')
  @Roles(UserRole.FLEET_ROUTE_COORDINATOR, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Fleet Coordinator lập/cập nhật lộ trình di chuyển gồm các chặng/điểm dừng',
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
      'Logistics Manager / Coordinator xuất bản chuyến đi và chuyển sang in_transit',
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
      'Tài xế (Driver) / Hộ tống (Escort) cập nhật mốc thực tế tại điểm dừng',
  })
  recordStopProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('stopId', ParseIntPipe) stopId: number,
    @Body() dto: RecordStopProgressDto,
  ) {
    return this.routesService.recordStopProgress(user, stopId, dto);
  }

  @Post('shipment/:shipmentId/incident')
  @ApiOperation({
    summary: 'Tài xế, Escort hoặc Coordinator báo cáo sự cố (tắc đường, sạt lở, hỏng xe...) để mở quyền hiệu chỉnh chặng',
  })
  reportIncident(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: { incidentType: string; description: string; severity?: string },
  ) {
    return this.routesService.reportIncident(user, shipmentId, dto);
  }

  @Post('incident/:incidentId/resolve')
  @Roles(UserRole.FLEET_ROUTE_COORDINATOR, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Coordinator hoặc Manager xác nhận đã giải quyết sự cố / Cập nhật xong lộ trình thay thế',
  })
  resolveIncident(
    @CurrentUser() user: AuthenticatedUser,
    @Param('incidentId', ParseIntPipe) incidentId: number,
  ) {
    return this.routesService.resolveIncident(user, incidentId);
  }
}

