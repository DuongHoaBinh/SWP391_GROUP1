import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
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
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = './uploads/documents';
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
      limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Khách hàng hoặc chuyên viên tải lên chứng từ pháp lý/y tế (mở File Explorer để chọn file trực tiếp)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['horseId', 'regulationId', 'docType'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Chọn file tài liệu từ máy tính (PDF, PNG, JPG, DOCX)',
        },
        horseId: { type: 'number', example: 1, description: 'ID con ngựa' },
        regulationId: { type: 'number', example: 1, description: 'ID quy định trong bảng regulation' },
        docType: { type: 'string', example: 'horse_passport', description: 'Loại chứng từ' },
        docNumber: { type: 'string', example: 'VN-FEI-2026-9812', description: 'Số văn bản / hộ chiếu (tùy chọn)' },
        fileUrl: { type: 'string', example: '', description: 'Hoặc dán URL nếu không tải file từ máy tính' },
        issueDate: { type: 'string', example: '2026-01-10', description: 'Ngày cấp (YYYY-MM-DD)' },
        expiryDate: { type: 'string', example: '2030-01-10', description: 'Ngày hết hạn (YYYY-MM-DD)' },
      },
    },
  })
  uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.documentsService.uploadDocument(user, dto, file);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách chứng từ (khách hàng xem của mình, chuyên viên xem toàn bộ)' })
  @ApiQuery({ name: 'status', required: false, description: 'Lọc theo trạng thái (submitted, approved, rejected, expired)' })
  @ApiQuery({ name: 'horseId', required: false, description: 'Lọc theo ID con ngựa' })
  getDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('horseId') horseId?: string,
  ) {
    return this.documentsService.getDocuments(
      user,
      status,
      horseId ? Number(horseId) : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết một tài liệu kèm lịch sử phê duyệt của cơ quan chức năng' })
  getDocumentById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.documentsService.getDocumentById(user, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Khách hàng hoặc chuyên viên xóa tài liệu' })
  deleteDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.documentsService.deleteDocument(user, id);
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
