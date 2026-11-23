import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import { DocumentsService } from './documents.service';
import { DocumentExpiryMonitorService } from './document-expiry-monitor.service';

@ApiTags('compliance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('compliance')
export class ComplianceController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly documentExpiryMonitorService: DocumentExpiryMonitorService,
  ) {}

  @Get('requirements')
  @Roles(UserRole.CUSTOMER, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Lấy danh mục hồ sơ cần chuẩn bị theo quốc gia và phương thức (Step 8)',
    description:
      'Trả về danh sách giấy tờ theo quy định của quốc gia đến, đối chiếu với kho hồ sơ của từng ngựa và đánh dấu: dùng lại được, chờ duyệt, sắp hết hạn, hết hạn, cấp quá sớm hoặc thiếu.',
  })
  @ApiQuery({ name: 'country', required: true, example: 'Singapore' })
  @ApiQuery({ name: 'mode', required: false, enum: ['road', 'air', 'sea'], example: 'air' })
  @ApiQuery({ name: 'horseIds', required: false, example: '1,2,3' })
  @ApiQuery({ name: 'departDate', required: true, example: '2026-12-20' })
  @ApiQuery({ name: 'returnDate', required: false, example: '2026-12-25' })
  @ApiQuery({ name: 'borderGate', required: false, example: 'Changi Airport' })
  async getRequirements(
    @CurrentUser() user: AuthenticatedUser,
    @Query('country') country: string,
    @Query('departDate') departDate: string,
    @Query('mode') mode?: 'road' | 'air' | 'sea',
    @Query('horseIds') horseIds?: string,
    @Query('returnDate') returnDate?: string,
    @Query('borderGate') borderGate?: string,
  ) {
    if (!country || !country.trim()) {
      throw new BadRequestException('Quốc gia đến (country) là bắt buộc');
    }
    if (!departDate || !departDate.trim()) {
      throw new BadRequestException('Ngày khởi hành dự kiến (departDate) là bắt buộc');
    }

    const parsedHorseIds: number[] = horseIds
      ? String(horseIds)
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n) && n > 0)
      : [];

    return this.documentsService.getRequirements(user, {
      country: country.trim(),
      mode,
      horseIds: parsedHorseIds,
      departDate: departDate.trim(),
      returnDate: returnDate?.trim() || undefined,
      borderGate: borderGate?.trim() || undefined,
    });
  }

  @Post('run-expiry-sweep')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Chạy thủ công tác vụ quét hạn hồ sơ và cảnh báo (Demo / Audit)',
    description:
      'Đánh dấu expired cho tài liệu quá hạn, gửi nhắc nhở 30/7/1 ngày (idempotent), và chuyển đơn ready_to_depart có hồ sơ Tầng A hết hạn về planning.',
  })
  @ApiResponse({ status: 200, description: 'Kết quả quét rà soát hạn hồ sơ' })
  async runExpirySweep() {
    const result = await this.documentExpiryMonitorService.runSweep();
    return {
      success: true,
      message: 'Đã hoàn tất quét rà soát hạn hồ sơ kiểm dịch thành công!',
      ...result,
    };
  }

  @Get('documents/:id/history')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Xem lịch sử thẩm định của tài liệu (document_review_log)' })
  async getDocumentReviewHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) documentId: number,
  ) {
    return this.documentsService.getReviewLogs(user, documentId);
  }
}
