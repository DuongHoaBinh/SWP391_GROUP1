import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  ParseIntPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as fs from 'fs';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { TrackingService } from './tracking.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { imageFileFilter } from '../../common/utils/upload-validation';
import { UserRole } from '../auth/auth.types';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UpdateVitalConfigDto } from './dto/update-vital-config.dto';
import {
  CheckInLegDto,
  CheckInStopDto,
  CoordinatorOverrideDto,
  CreateHealthLogDto,
  HorseHealthLogEntity,
  LiveOverviewItem,
  LiveTrackingDetails,
  PositionPingBatchDto,
  PositionPingResult,
  TrackingSystemSettings,
  TripTrackingDetails,
  ShipmentTimelineResponse,
} from './tracking.types';

@ApiTags('Tracking')
@ApiBearerAuth()
@Controller('tracking')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get('my-trips')
  async getMyTrips(@CurrentUser() user: AuthenticatedUser): Promise<any[]> {
    return this.trackingService.getMyTrips(user);
  }

  @Get('live-overview')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN, UserRole.FLEET_ROUTE_COORDINATOR)
  @ApiOperation({ summary: 'Bản đồ tổng quan giám sát toàn bộ chuyến đi đang chạy' })
  async getLiveOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Query('alertFilter') alertFilter?: string,
  ): Promise<LiveOverviewItem[]> {
    return this.trackingService.getLiveOverview(user, alertFilter);
  }

  @Get('settings')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN, UserRole.FLEET_ROUTE_COORDINATOR)
  @ApiOperation({ summary: 'Lấy cấu hình hệ thống tracking (geofence, simulation, vitals)' })
  async getTrackingSettings(): Promise<TrackingSystemSettings> {
    return this.trackingService.getTrackingSettings();
  }

  @Patch('settings')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cập nhật cấu hình tracking (ADMIN only: simulation, geofence, customer_vitals_detail)' })
  async updateTrackingSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() patch: Partial<TrackingSystemSettings>,
  ): Promise<TrackingSystemSettings> {
    return this.trackingService.updateTrackingSettings(user, patch);
  }

  @Get('shipments/:shipmentId')
  async getTrackingDetails(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
  ): Promise<TripTrackingDetails> {
    return this.trackingService.getTrackingDetails(user, shipmentId);
  }

  @Get('shipments/:shipmentId/live')
  @ApiOperation({ summary: 'Dữ liệu live tracking thời gian thực (vị trí xe, lộ trình, mốc, sinh hiệu)' })
  async getLiveTracking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
  ): Promise<LiveTrackingDetails> {
    return this.trackingService.getLiveTracking(user, shipmentId);
  }

  @Get('shipments/:shipmentId/timeline')
  @ApiOperation({ summary: 'Dữ liệu timeline tiến độ dọc chi tiết đã chuẩn hóa cho cả 3 actor' })
  async getShipmentTimeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
  ): Promise<ShipmentTimelineResponse> {
    return this.trackingService.getShipmentTimeline(user, shipmentId);
  }

  @Post('shipments/:shipmentId/pings')
  @Roles(UserRole.DRIVER_ESCORT, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN, UserRole.FLEET_ROUTE_COORDINATOR)
  @ApiOperation({ summary: 'Nhận batch tọa độ GPS từ thiết bị / app tài xế (tối đa 100 điểm)' })
  async recordPositionPings(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: PositionPingBatchDto,
  ): Promise<PositionPingResult> {
    return this.trackingService.recordPositionPings(user, shipmentId, dto);
  }

  @Post('shipments/:shipmentId/legs/:legId/start')
  @Roles(UserRole.DRIVER_ESCORT, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  async checkInLegStart(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Param('legId', ParseIntPipe) legId: number,
    @Body() dto: CheckInLegDto,
  ): Promise<TripTrackingDetails> {
    return this.trackingService.checkInLegStart(user, shipmentId, legId, dto);
  }

  @Post('shipments/:shipmentId/stops/:stopId/status')
  @Roles(UserRole.DRIVER_ESCORT, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  async checkInStop(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Param('stopId', ParseIntPipe) stopId: number,
    @Body() dto: CheckInStopDto,
  ): Promise<TripTrackingDetails> {
    return this.trackingService.checkInStop(user, shipmentId, stopId, dto);
  }

  @Post('shipments/:shipmentId/legs/:legId/complete')
  @Roles(UserRole.DRIVER_ESCORT, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  async checkInLegArrival(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Param('legId', ParseIntPipe) legId: number,
    @Body() dto: CheckInLegDto,
  ): Promise<TripTrackingDetails> {
    return this.trackingService.checkInLegArrival(user, shipmentId, legId, dto);
  }

  @Post('shipments/:shipmentId/coordinator-override')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  async coordinatorOverride(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: CoordinatorOverrideDto,
  ): Promise<TripTrackingDetails> {
    return this.trackingService.coordinatorOverrideMilestone(user, shipmentId, dto);
  }

  @Post('shipments/:shipmentId/return/no-show')
  @Roles(UserRole.DRIVER_ESCORT, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Tài xế đánh dấu no-show khi chờ quá thời gian tối đa ở điểm đón chặng về' })
  async markReturnNoShow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: { notes?: string; evidenceUrls?: string[] },
  ) {
    return this.trackingService.markReturnNoShow(user, shipmentId, dto);
  }

  @Get('vital-config')
  @ApiOperation({ summary: 'Lấy cấu hình ngưỡng sinh hiệu thú y 3 tầng (Xanh/Vàng/Đỏ) & cửa sổ 6h' })
  getVitalConfig() {
    return this.trackingService.getVitalConfig();
  }

  @Patch('vital-config')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Hiệu chỉnh ngưỡng sinh hiệu thú y 3 tầng theo DEC-06' })
  updateVitalConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateVitalConfigDto,
  ) {
    return this.trackingService.updateVitalConfig(user, dto);
  }

  @Get('health-logs/attachments/:filename')
  @ApiOperation({ summary: 'Xem ảnh đính kèm nhật ký sức khỏe ngựa (có xác thực JWT & quyền truy cập chuyến)' })
  async streamHealthPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const info = await this.trackingService.getAuthorizedHealthPhotoPath(user, filename);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(info.fileName)}"`);
    return res.sendFile(info.absolutePath);
  }

  @Post('shipments/:shipmentId/health-logs/upload')
  @Roles(UserRole.DRIVER_ESCORT, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      fileFilter: imageFileFilter,
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const uploadPath = './uploads/health-logs';
          if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
          cb(null, uploadPath);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Tải lên tối đa 5 ảnh sinh hiệu ngựa (<= 5MB/ảnh, xác thực magic bytes)' })
  uploadHealthPhotos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.trackingService.handleUploadedHealthPhotos(user, shipmentId, files);
  }

  @Post('shipments/:shipmentId/health-logs')
  @Roles(UserRole.DRIVER_ESCORT, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  async createHealthLog(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: CreateHealthLogDto,
  ): Promise<HorseHealthLogEntity> {
    return this.trackingService.createHealthLog(user, shipmentId, dto);
  }

  @Get('horses/:horseId/health-logs')
  @ApiOperation({ summary: 'Lấy lịch sử theo dõi sức khỏe của con ngựa theo trạm/chuyến' })
  async getHorseHealthLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Param('horseId', ParseIntPipe) horseId: number,
  ): Promise<any[]> {
    return this.trackingService.getHealthLogsByHorseId(user, horseId);
  }

  @Post('shipments/:shipmentId/complete')
  @Roles(UserRole.DRIVER_ESCORT, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  async completeShipment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
  ): Promise<{ success: boolean; message: string }> {
    await this.trackingService.completeShipment(user, shipmentId);
    return { success: true, message: 'Chuyến đi đã được đánh dấu hoàn thành' };
  }
}
