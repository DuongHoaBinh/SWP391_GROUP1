import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import * as fs from 'fs';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { documentFileFilter } from '../../common/utils/upload-validation';
import { UserRole } from '../auth/auth.types';
import {
  AssessIncidentDto,
  CreateChangeRequestDto,
  CreateIncidentDto,
  ResolveIncidentDto,
  ReviewChangeRequestDto,
} from './dto/incidents.dto';
import { IncidentsService } from './incidents.service';

@ApiTags('Incidents & Change Requests (Flow 5)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách sự cố chuyến đi (phân lọc theo quyền/chuyến)' })
  listIncidents(
    @CurrentUser() user: AuthenticatedUser,
    @Query('shipmentId') shipmentId?: string,
    @Query('status') status?: string,
  ) {
    let parsedSid: number | undefined;
    if (shipmentId !== undefined) {
      parsedSid = Number(shipmentId);
      if (!Number.isInteger(parsedSid) || parsedSid <= 0) {
        throw new BadRequestException('shipmentId không hợp lệ');
      }
    }
    return this.incidentsService.listIncidents(user, { shipmentId: parsedSid, status });
  }

  @Get('attachments/:filename')
  @ApiOperation({ summary: 'Xem / tải bằng chứng sự cố (authenticated JWT stream)' })
  async streamAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const info = await this.incidentsService.getAuthorizedAttachmentPath(user, filename);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(info.fileName)}"`);
    return res.sendFile(info.absolutePath);
  }

  @Get('change-requests')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.FLEET_ROUTE_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách đề xuất đổi lộ trình/lịch trình/chi phí (Flow 5)' })
  listChangeRequests(
    @Query('incidentId') incidentId?: string,
    @Query('shipmentId') shipmentId?: string,
    @Query('status') status?: string,
  ) {
    return this.incidentsService.listChangeRequests({
      incidentId: incidentId ? Number(incidentId) : undefined,
      shipmentId: shipmentId ? Number(shipmentId) : undefined,
      status,
    });
  }

  @Post('change-requests/:changeId/review')
  @HttpCode(200)
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Logistics Manager phê duyệt hoặc từ chối đề xuất thay đổi (RACI #17 A)' })
  reviewChangeRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('changeId', ParseIntPipe) changeId: number,
    @Body() dto: ReviewChangeRequestDto,
  ) {
    return this.incidentsService.reviewChangeRequest(user, changeId, dto);
  }

  @Post('change-requests/:changeId/publish')
  @HttpCode(200)
  @Roles(UserRole.FLEET_ROUTE_COORDINATOR, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Coordinator xuất bản phương án thay đổi đã duyệt kèm ripple alert cô lập' })
  publishChangeRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('changeId', ParseIntPipe) changeId: number,
  ) {
    return this.incidentsService.publishChangeRequest(user, changeId);
  }

  @Post('shipments/:shipmentId')
  @Roles(
    UserRole.DRIVER_ESCORT,
    UserRole.FLEET_ROUTE_COORDINATOR,
    UserRole.LOGISTICS_MANAGER,
    UserRole.ADMIN,
  )
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      fileFilter: documentFileFilter,
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const uploadPath = './uploads/incidents';
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
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'Báo cáo sự cố thực địa kèm tệp bằng chứng (<= 5MB/tệp)' })
  createIncident(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: CreateIncidentDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.incidentsService.createIncident(user, shipmentId, dto, files || []);
  }

  @Get(':incidentId')
  @ApiOperation({ summary: 'Chi tiết sự cố và lịch sử đề xuất thay đổi' })
  getIncident(
    @CurrentUser() user: AuthenticatedUser,
    @Param('incidentId', ParseIntPipe) incidentId: number,
  ) {
    return this.incidentsService.getIncidentById(user, incidentId);
  }

  @Patch(':incidentId/assess')
  @Roles(UserRole.FLEET_ROUTE_COORDINATOR, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Coordinator tiếp nhận đánh giá sự cố (open -> in_review)' })
  assessIncident(
    @Param('incidentId', ParseIntPipe) incidentId: number,
    @Body() dto: AssessIncidentDto,
  ) {
    return this.incidentsService.assessIncident(incidentId, dto);
  }

  @Post(':incidentId/change-requests')
  @Roles(UserRole.FLEET_ROUTE_COORDINATOR, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Coordinator lập đề xuất thay đổi lộ trình / chi phí phát sinh trình Manager' })
  createChangeRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('incidentId', ParseIntPipe) incidentId: number,
    @Body() dto: CreateChangeRequestDto,
  ) {
    return this.incidentsService.createChangeRequest(user, incidentId, dto);
  }

  @Post(':incidentId/resolve')
  @HttpCode(200)
  @Roles(UserRole.FLEET_ROUTE_COORDINATOR, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Đóng sự cố và ghi kết quả xử lý cuối cùng' })
  resolveIncident(
    @CurrentUser() user: AuthenticatedUser,
    @Param('incidentId', ParseIntPipe) incidentId: number,
    @Body() dto: ResolveIncidentDto,
  ) {
    return this.incidentsService.resolveIncident(user, incidentId, dto);
  }
}
