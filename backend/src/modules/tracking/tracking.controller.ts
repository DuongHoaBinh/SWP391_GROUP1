import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
  Query,
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
  ShipmentCheckInDto,
  HealthLogQueryDto,
} from './tracking.types';

@ApiTags('Tracking')
@ApiBearerAuth()
@Controller('tracking')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Post('shipments/:shipmentId/start')
  @ApiOperation({ summary: 'Start the next leg of an assigned, ready shipment' })
  startShipment(@CurrentUser() user: AuthenticatedUser, @Param('shipmentId', ParseIntPipe) id: number, @Body() dto: CheckInLegDto) {
    return this.trackingService.startShipment(user, id, dto);
  }

  @Post('shipments/:shipmentId/checkin')
  @ApiOperation({ summary: 'Append a route_stop_update for an assigned trip' })
  checkIn(@CurrentUser() user: AuthenticatedUser, @Param('shipmentId', ParseIntPipe) id: number, @Body() dto: ShipmentCheckInDto) {
    return this.trackingService.checkInStop(user, id, dto.routeStopId, dto);
  }

  @Get('shipments/:shipmentId/health-logs')
  @ApiOperation({ summary: 'Health history, newest first; filter by horseId and paginate' })
  getHealthLogs(@CurrentUser() user: AuthenticatedUser, @Param('shipmentId', ParseIntPipe) id: number, @Query() query: HealthLogQueryDto) {
    return this.trackingService.getHealthLogs(user, id, query);
  }

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

  @Post('shipments/:shipmentId/complete')
  async completeShipment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
  ): Promise<{ success: boolean; message: string }> {
    await this.trackingService.completeShipment(user, shipmentId);
    return { success: true, message: 'Chuyến đi đã được đánh dấu hoàn thành' };
  }
}
