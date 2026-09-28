import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { CreateRegulationDto } from './dto/create-regulation.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { RecordAuthorityApprovalDto } from './dto/record-authority-approval.dto';
import { NotifyMissingDocumentsDto } from './dto/notify-missing.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';

@ApiTags('Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  // --- Regulations ---
  @Get('regulations')
  @ApiOperation({ summary: 'Lấy danh sách các quy định/loại tài liệu bắt buộc theo quốc gia' })
  @ApiQuery({ name: 'country', required: false, description: 'Lọc theo tên quốc gia (VD: Singapore, Vietnam)' })
  getRegulations(@Query('country') country?: string) {
    return this.documentsService.getRegulations(country);
  }

  @Post('regulations')
  @Roles(UserRole.TRANSPORT_SPECIALIST, UserRole.ADMIN)
  @ApiOperation({ summary: 'Transport Specialist tạo mới quy định yêu cầu chứng từ cho quốc gia' })
  createRegulation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRegulationDto,
  ) {
    return this.documentsService.createRegulation(user, dto);
  }

  // --- Documents Upload & Viewing ---
  @Post('upload')
  @Roles(UserRole.CUSTOMER, UserRole.TRANSPORT_SPECIALIST, UserRole.ADMIN)
  @ApiOperation({ summary: 'Khách hàng hoặc chuyên viên tải lên chứng từ pháp lý/y tế cho con ngựa' })
  uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.documentsService.uploadDocument(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết một tài liệu kèm lịch sử phê duyệt của cơ quan chức năng' })
  getDocumentById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.documentsService.getDocumentById(user, id);
  }

  @Get('horse/:horseId')
  @ApiOperation({ summary: 'Xem danh sách toàn bộ tài liệu đã tải lên của một con ngựa' })
  getDocumentsByHorse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('horseId', ParseIntPipe) horseId: number,
  ) {
    return this.documentsService.getDocumentsByHorse(user, horseId);
  }

  // --- Compliance Checklist for Orders ---
  @Get('order/:orderId/checklist')
  @ApiOperation({
    summary: 'Lấy bảng checklist tuân thủ hồ sơ kiểm dịch của toàn bộ các con ngựa trong một đơn hàng',
  })
  getOrderComplianceChecklist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.documentsService.getOrderComplianceChecklist(user, orderId);
  }

  // --- Document Review ---
  @Patch(':id/review')
  @Roles(UserRole.TRANSPORT_SPECIALIST, UserRole.ADMIN)
  @ApiOperation({ summary: 'Transport Specialist thẩm định tài liệu (chấp thuận, từ chối hoặc hết hạn)' })
  reviewDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.documentsService.reviewDocument(user, id, dto);
  }

  // --- Authority Approval Tracking ---
  @Post(':id/authority-approval')
  @Roles(UserRole.TRANSPORT_SPECIALIST, UserRole.ADMIN)
  @ApiOperation({ summary: 'Ghi nhận tiến độ và kết quả thẩm định từ Cục thú y / Hải quan' })
  recordAuthorityApproval(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordAuthorityApprovalDto,
  ) {
    return this.documentsService.recordAuthorityApproval(user, id, dto);
  }

  // --- Remind / Notify Missing Documents ---
  @Post('order/:orderId/notify-missing')
  @Roles(UserRole.TRANSPORT_SPECIALIST, UserRole.ADMIN)
  @ApiOperation({ summary: 'Gửi thông báo nhắc nhở tự động đến khách hàng về các chứng từ còn thiếu' })
  notifyMissingDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: NotifyMissingDocumentsDto,
  ) {
    return this.documentsService.notifyMissingDocuments(user, orderId, dto);
  }
}
