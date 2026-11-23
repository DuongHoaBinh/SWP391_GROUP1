import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TrackingService } from './tracking.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import { TrackingSystemSettings } from './tracking.types';

@ApiTags('System Settings')
@ApiBearerAuth()
@Controller('system-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SystemSettingsController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get('tracking')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy cấu hình hệ thống tracking (geofence, simulation, vitals)' })
  async getTrackingSettings(): Promise<TrackingSystemSettings> {
    return this.trackingService.getTrackingSettings();
  }

  @Patch('tracking')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cập nhật cấu hình tracking (ADMIN only: simulation, geofence, customer_vitals_detail)' })
  async updateTrackingSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() patch: Partial<TrackingSystemSettings>,
  ): Promise<TrackingSystemSettings> {
    return this.trackingService.updateTrackingSettings(user, patch);
  }
}
