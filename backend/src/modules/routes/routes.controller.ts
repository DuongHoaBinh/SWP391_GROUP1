import {
  Body,
  Controller,
  Get,
  HttpCode,
  Optional,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoutesService } from './routes.service';
import { RecordStopProgressDto } from './dto/record-stop-progress.dto';
import { BuildDetailedPlanDto } from './dto/build-detailed-plan.dto';
import { ReviewPlanDto } from './dto/review-plan.dto';
import { ConfirmAssignmentDto } from './dto/confirm-assignment.dto';
import { DeclineAssignmentDto } from './dto/decline-assignment.dto';
import { ReportIncidentDto } from './dto/report-incident.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import { RouteNetworkService, toHttpError } from './route-network.service';
import { PlanNetworkRouteDto } from './dto/plan-network-route.dto';

@ApiTags('Routes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('routes')
export class RoutesController {
  constructor(
    private readonly routesService: RoutesService,
    @Optional() private readonly routeNetwork?: RouteNetworkService,
  ) {}

  @Get('master-data')
  @ApiOperation({ summary: 'Lấy dữ liệu danh mục nền cho Flow 3 (Hãng hàng không, Sân bay, Trạm dừng mẫu)' })
  getMasterData() {
    return this.routesService.getMasterData();
  }

  @Get('network')
  @ApiOperation({
    summary: 'Mạng lưới vận tải ĐNA + Trung Quốc: cảng, tuyến biển (kèm hình học), sân bay, cửa khẩu, trạm nghỉ',
  })
  async getTransportNetwork() {
    if (!this.routeNetwork) throw new ServiceUnavailableException('Mạng lưới vận tải chưa được cấu hình');
    try {
      return await this.routeNetwork.getNetwork();
    } catch (err) {
      throw toHttpError(err);
    }
  }

  @Post('network/plan')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Lập tuyến đa phương thức (bản đồ + báo giá dùng chung). 422 kèm code và suggestions khi phương thức đã chọn không đi được',
  })
  planNetworkRoute(@Body() dto: PlanNetworkRouteDto) {
    if (!this.routeNetwork) throw new ServiceUnavailableException('Mạng lưới vận tải chưa được cấu hình');
    return this.routeNetwork.planOrThrowHttp({
      mode: dto.mode,
      seaMode: dto.seaMode,
      origin: dto.origin,
      destination: dto.destination,
    });
  }

  @Get('shipment/:shipmentId/optional')
  @ApiOperation({ summary: 'Lấy lộ trình của đơn hàng nếu đã lập (trả { route: null } với HTTP 200 nếu chưa có lộ trình)' })
  findOptionalRouteByShipmentId(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
  ) {
    return this.routesService.findOptionalRouteByShipmentId(shipmentId, user);
  }

  @Get('shipment/:shipmentId/plan')
  @ApiOperation({
    summary:
      'Lấy toàn bộ kế hoạch chuyến đi (lộ trình, các chặng, xe, tài xế/hộ tống) và đánh giá tính hợp lệ để xuất bản (isReadyToPublish)',
  })
  getFullTripPlan(@CurrentUser() user: AuthenticatedUser, @Param('shipmentId', ParseIntPipe) shipmentId: number) {
    return this.routesService.getFullTripPlan(shipmentId, user);
  }

  @Get('shipment/:shipmentId/draft-suggestion')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Tự dựng đề xuất lộ trình chi tiết (chặng road/flight/sea, chặng về khứ hồi, xe đã giữ chỗ, giờ đón và trạm dừng) từ báo giá của khách hàng',
  })
  getDraftSuggestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
  ) {
    return this.routesService.getDraftSuggestion(user, shipmentId);
  }

  // --- Step 1: Logistics Manager Builds Detailed Plan ---
  @Post('plan/:shipmentId/build-detail')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Bước 1: Logistics Manager dựng kế hoạch chi tiết các chặng (Legs), gán xe cụ thể, chuyến bay và điểm dừng',
  })
  buildDetailedPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: BuildDetailedPlanDto,
  ) {
    return this.routesService.buildDetailedPlan(user, shipmentId, dto);
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
  @Roles(UserRole.DRIVER_ESCORT, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
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
  @Roles(UserRole.DRIVER_ESCORT, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
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

  @Post('stops/:stopId/progress')
  @Roles(UserRole.DRIVER_ESCORT, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
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
  @Roles(UserRole.DRIVER_ESCORT, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Tài xế, Escort hoặc Coordinator báo cáo sự cố (tắc đường, sạt lở, hỏng xe...) để mở quyền hiệu chỉnh chặng',
  })
  reportIncident(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: ReportIncidentDto,
  ) {
    return this.routesService.reportIncident(user, shipmentId, dto);
  }

  @Get('incidents')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách sự cố hiện trường thực tế từ bảng incident_report' })
  getAllIncidents() {
    return this.routesService.getAllIncidents();
  }

  @Post('incident/:incidentId/resolve')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
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

