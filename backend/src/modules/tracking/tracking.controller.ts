import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { TrackingService } from './tracking.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CheckInLegDto,
  CheckInStopDto,
  CoordinatorOverrideDto,
  CreateHealthLogDto,
  HorseHealthLogEntity,
  TripTrackingDetails,
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

  @Get('shipments/:shipmentId')
  async getTrackingDetails(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
  ): Promise<TripTrackingDetails> {
    return this.trackingService.getTrackingDetails(user, shipmentId);
  }

  @Post('shipments/:shipmentId/legs/:legId/start')
  async checkInLegStart(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Param('legId', ParseIntPipe) legId: number,
    @Body() dto: CheckInLegDto,
  ): Promise<TripTrackingDetails> {
    return this.trackingService.checkInLegStart(user, shipmentId, legId, dto);
  }

  @Post('shipments/:shipmentId/stops/:stopId/status')
  async checkInStop(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Param('stopId', ParseIntPipe) stopId: number,
    @Body() dto: CheckInStopDto,
  ): Promise<TripTrackingDetails> {
    return this.trackingService.checkInStop(user, shipmentId, stopId, dto);
  }

  @Post('shipments/:shipmentId/legs/:legId/complete')
  async checkInLegArrival(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Param('legId', ParseIntPipe) legId: number,
    @Body() dto: CheckInLegDto,
  ): Promise<TripTrackingDetails> {
    return this.trackingService.checkInLegArrival(user, shipmentId, legId, dto);
  }

  @Post('shipments/:shipmentId/coordinator-override')
  async coordinatorOverride(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: CoordinatorOverrideDto,
  ): Promise<TripTrackingDetails> {
    return this.trackingService.coordinatorOverrideMilestone(user, shipmentId, dto);
  }

  @Post('shipments/:shipmentId/health-logs')
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
  async completeShipment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
  ): Promise<{ success: boolean; message: string }> {
    await this.trackingService.completeShipment(user, shipmentId);
    return { success: true, message: 'Chuyến đi đã được đánh dấu hoàn thành' };
  }
}
