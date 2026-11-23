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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
  ApproveRefundDto,
  CreateDisbursementDto,
  GrantPaymentGraceDto,
  OperationalCancelDto,
  RescheduleSharedDto,
  SlaFallbackDto,
  TransferRefundDto,
  UpgradeCharterDto,
} from './dto/orders-ops.dto';
import { OrdersOpsService } from './orders-ops.service';
import { SlaMonitorService } from './sla-monitor.service';

@ApiTags('Orders Operations, Refunds & SLA')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersOpsController {
  constructor(
    private readonly opsService: OrdersOpsService,
    private readonly slaMonitorService: SlaMonitorService,
  ) {}

  // Registered before OrdersController (:id) so static paths never hit ParseIntPipe on :id
  @Get('refunds')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Manager / Admin views all manual refund records (SoD workflow)' })
  listAllRefunds(@CurrentUser() user: AuthenticatedUser, @Query('shipmentId') shipmentId?: string) {
    const sid = shipmentId ? Number(shipmentId) : undefined;
    if (shipmentId !== undefined && (!Number.isInteger(sid) || sid! <= 0)) {
      throw new BadRequestException('shipmentId không hợp lệ');
    }
    return this.opsService.listRefunds(user, sid);
  }

  @Post('sla/run-sweep')
  @HttpCode(200)
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Chạy quét SLA Driver, Hard Cap T-52h, Payment Overdue và tự động hủy hết gia hạn (T-24h)' })
  runSlaSweep() {
    return this.slaMonitorService.runSweep();
  }

  @Get('disbursements/:disbursementId/receipt')
  @ApiOperation({ summary: 'Xem / tải biên lai phí cơ quan ứng trước (authenticated stream)' })
  async streamDisbursementReceipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('disbursementId', ParseIntPipe) disbursementId: number,
    @Res() res: Response,
  ) {
    const info = await this.opsService.getAuthorizedDisbursementReceipt(user, disbursementId);
    if (info.externalUrl) return res.redirect(info.externalUrl);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(info.fileName)}"`);
    return res.sendFile(info.absolutePath);
  }

  @Get('refunds/:refundId/receipt')
  @ApiOperation({ summary: 'Xem / tải ủy nhiệm chi hoàn tiền thủ công (authenticated stream)' })
  async streamRefundReceipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('refundId', ParseIntPipe) refundId: number,
    @Res() res: Response,
  ) {
    const info = await this.opsService.getAuthorizedRefundReceipt(user, refundId);
    if (info.externalUrl) return res.redirect(info.externalUrl);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(info.fileName)}"`);
    return res.sendFile(info.absolutePath);
  }

  @Patch('refunds/:refundId/approve')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Logistics Manager / Admin phê duyệt mức hoàn tiền hoặc bảo lưu 30 ngày (Dual Approval nếu >= 20M)' })
  approveRefund(
    @CurrentUser() user: AuthenticatedUser,
    @Param('refundId', ParseIntPipe) refundId: number,
    @Body() dto: ApproveRefundDto,
  ) {
    return this.opsService.approveRefund(user, refundId, dto);
  }

  @Post('refunds/:refundId/transfer')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('receipt', {
      fileFilter: documentFileFilter,
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const uploadPath = './uploads/refund-receipts';
          if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
          cb(null, uploadPath);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'Admin / Finance xác nhận đã chuyển khoản hoàn tiền thủ công (Bắt buộc SoD: transferred_by != approved_by)' })
  transferRefund(
    @CurrentUser() user: AuthenticatedUser,
    @Param('refundId', ParseIntPipe) refundId: number,
    @Body() dto: TransferRefundDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.opsService.transferRefund(user, refundId, dto, file);
  }

  @Post(':id/operational-cancel')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Hủy vận hành đơn hàng (cấm khi in_transit -> 409) kèm tính toán hoàn tiền & khấu trừ phí ứng trước' })
  operationalCancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: OperationalCancelDto,
  ) {
    return this.opsService.operationalCancel(user, id, dto);
  }

  @Get(':id/disbursements')
  @ApiOperation({ summary: 'Xem danh sách lệ phí cơ quan nhà nước ứng trước nộp hộ (Reimbursable Disbursement)' })
  getDisbursements(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.opsService.getDisbursements(user, id);
  }

  @Post(':id/disbursements')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('receipt', {
      fileFilter: documentFileFilter,
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const uploadPath = './uploads/disbursements';
          if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
          cb(null, uploadPath);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'Ghi nhận khoản lệ phí cơ quan chức năng công ty ứng trước có biên lai' })
  createDisbursement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateDisbursementDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.opsService.createDisbursement(user, id, dto, file);
  }

  @Get(':id/refunds')
  @ApiOperation({ summary: 'Xem lịch sử hoàn tiền / bảo lưu 30 ngày theo đơn hàng' })
  getOrderRefunds(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.opsService.listRefunds(user, id);
  }

  @Post(':id/upgrade-charter')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN, UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Nâng cấp từ shared_stall sang dedicated_charter tại D-3 (Nhánh A void/reissue hoặc Nhánh B supplemental_invoice)' })
  upgradeCharter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpgradeCharterDto,
  ) {
    return this.opsService.upgradeCharter(user, id, dto);
  }

  @Post(':id/reschedule-shared')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN, UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Dời sang chuyến ghép kế tiếp miễn phí tại mốc D-3 fallback' })
  rescheduleShared(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RescheduleSharedDto,
  ) {
    return this.opsService.rescheduleShared(user, id, dto);
  }

  @Post(':id/payment-grace')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Manager cấp gia hạn thanh toán duy nhất 1 lần theo công thức MIN(grant+10h, T-24h)' })
  grantPaymentGrace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GrantPaymentGraceDto,
  ) {
    return this.opsService.grantPaymentGrace(user, id, dto);
  }

  @Post(':id/sla-fallback')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Manager xử lý phương án dự phòng BR-F3-06 khi quá trần T-52h' })
  handleSlaFallback(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SlaFallbackDto,
  ) {
    return this.opsService.handleSlaFallback(user, id, dto);
  }
}
