import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { OperatingCostItem, PerformanceReportResponse } from './reports.types';
import { CreateOperatingCostDto } from './dto/create-operating-cost.dto';
import { UpdateExcusedDelayDto } from './dto/update-excused-delay.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('performance')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get executive logistics, real OTD, operating costs and financial reconciliation metrics' })
  async getPerformance(): Promise<PerformanceReportResponse> {
    return this.reportsService.getPerformanceReport();
  }

  @Get('shipments/:shipmentId/operating-costs')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'List actual operating costs recorded for a shipment' })
  async getOperatingCosts(@Param('shipmentId', ParseIntPipe) shipmentId: number): Promise<OperatingCostItem[]> {
    return this.reportsService.getOperatingCosts(shipmentId);
  }

  @Post('shipments/:shipmentId/operating-costs')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Record an operating cost entry for a shipment' })
  async addOperatingCost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: CreateOperatingCostDto,
  ): Promise<OperatingCostItem> {
    return this.reportsService.addOperatingCost(user, shipmentId, dto);
  }

  @Delete('operating-costs/:costId')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete an erroneous operating cost entry' })
  async deleteOperatingCost(@Param('costId', ParseIntPipe) costId: number): Promise<{ success: boolean }> {
    return this.reportsService.deleteOperatingCost(costId);
  }

  @Patch('shipments/:shipmentId/excused-delay')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Mark/unmark completed shipment as excused delay within 48h window (DEC-02)' })
  async updateExcusedDelay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: UpdateExcusedDelayDto,
  ) {
    return this.reportsService.updateExcusedDelay(user, shipmentId, dto);
  }
}
