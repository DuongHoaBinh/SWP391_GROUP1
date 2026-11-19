import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
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
  CreateHandoverDto,
  ResolveHandoverDisputeDto,
  RespondHandoverDto,
} from './dto/handover.dto';
import { HandoverService } from './handover.service';

@ApiTags('Delivery Handover & Acceptance (Flow 6)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tracking')
export class HandoverController {
  constructor(private readonly handoverService: HandoverService) {}

  @Get('handovers/attachments/:filename')
  @ApiOperation({ summary: 'Xem / tải bằng chứng bàn giao ngựa (authenticated JWT stream)' })
  async streamAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const info = await this.handoverService.getAuthorizedAttachmentPath(user, filename);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(info.fileName)}"`);
    return res.sendFile(info.absolutePath);
  }

  @Get('handovers')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.FLEET_ROUTE_COORDINATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Danh sách biên bản bàn giao toàn hệ thống (lọc tranh chấp cho Manager)' })
  listAllHandovers(@Query('status') status?: string) {
    return this.handoverService.listAllHandovers(status);
  }

  @Get('shipments/:shipmentId/handovers')
  @ApiOperation({ summary: 'Danh sách biên bản bàn giao theo từng ngựa của đơn vận chuyển' })
  getShipmentHandovers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
  ) {
    return this.handoverService.getHandoversByShipment(user, shipmentId);
  }

  @Post('shipments/:shipmentId/handovers')
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
          const uploadPath = './uploads/handovers';
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
  @ApiOperation({ summary: 'Tài xế/Hộ tống lập biên bản bàn giao theo từng cá thể ngựa (Flow 6)' })
  createHandover(
    @CurrentUser() user: AuthenticatedUser,
    @Param('shipmentId', ParseIntPipe) shipmentId: number,
    @Body() dto: CreateHandoverDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.handoverService.createHandover(user, shipmentId, dto, files || []);
  }

  @Post('handovers/:handoverId/respond')
  @HttpCode(200)
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      fileFilter: documentFileFilter,
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const uploadPath = './uploads/handovers';
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
  @ApiOperation({ summary: 'Khách hàng xác nhận nghiệm thu (confirm) hoặc mở tranh chấp kèm bằng chứng (dispute)' })
  respondHandover(
    @CurrentUser() user: AuthenticatedUser,
    @Param('handoverId', ParseIntPipe) handoverId: number,
    @Body() dto: RespondHandoverDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.handoverService.respondHandover(user, handoverId, dto, files || []);
  }

  @Post('handovers/:handoverId/resolve-dispute')
  @HttpCode(200)
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Logistics Manager giải quyết tranh chấp bàn giao theo trần max_compensation' })
  resolveDispute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('handoverId', ParseIntPipe) handoverId: number,
    @Body() dto: ResolveHandoverDisputeDto,
  ) {
    return this.handoverService.resolveDispute(user, handoverId, dto);
  }
}
