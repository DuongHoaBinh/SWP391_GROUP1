import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { PerformanceReportResponse } from './reports.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('performance')
  @ApiOperation({ summary: 'Get executive logistics and revenue performance metrics' })
  async getPerformance(): Promise<PerformanceReportResponse> {
    return this.reportsService.getPerformanceReport();
  }
}

