import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs';
import { DocumentsService } from './documents.service';
import { UploadHorseDocumentDto } from './dto/upload-horse-document.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import { documentFileFilter } from '../../common/utils/upload-validation';

const documentStorage = diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = './uploads/documents';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}${extname(file.originalname).toLowerCase()}`);
  },
});

/**
 * Kho giấy tờ gắn với con ngựa (Step 2, review 11/2026).
 * Thuộc module documents (sở hữu nghiệp vụ giấy tờ), URL đặt dưới /horses/:horseId cho dễ dùng.
 */
@ApiTags('Horse Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
@Controller('horses/:horseId/documents')
export class HorseDocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách giấy tờ đang hiệu lực của ngựa, kèm trạng thái hạn (valid / expiring_soon / expired / no_expiry)' })
  listHorseDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('horseId', ParseIntPipe) horseId: number,
  ) {
    return this.documentsService.listHorseDocuments(user, horseId);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: documentFileFilter,
      storage: documentStorage,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Tải giấy tờ lên hồ sơ ngựa; bản cùng loại trước đó được lưu trữ (append-only)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['documentTypeCode'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'PDF, PNG, JPG, DOCX (tối đa 10MB)' },
        documentTypeCode: { type: 'string', example: 'horse_passport' },
        docNumber: { type: 'string', example: 'VN-FEI-2026-9812' },
        fileUrl: { type: 'string', example: '', description: 'Hoặc URL nếu không tải file' },
        issueDate: { type: 'string', example: '2026-01-10' },
        expiryDate: { type: 'string', example: '2030-01-10' },
      },
    },
  })
  uploadHorseDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('horseId', ParseIntPipe) horseId: number,
    @Body() dto: UploadHorseDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.documentsService.uploadHorseDocument(user, horseId, dto, file);
  }

  @Get(':docId/history')
  @ApiOperation({ summary: 'Lịch sử phiên bản của loại giấy tờ này trên ngựa (gồm bản đã lưu trữ)' })
  getHorseDocumentHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('horseId', ParseIntPipe) horseId: number,
    @Param('docId', ParseIntPipe) docId: number,
  ) {
    return this.documentsService.getHorseDocumentHistory(user, horseId, docId);
  }

  @Get(':docId/file')
  @ApiOperation({ summary: 'Xem/tải tệp giấy tờ (kiểm tra chủ sở hữu ngựa)' })
  async downloadHorseDocumentFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('horseId', ParseIntPipe) horseId: number,
    @Param('docId', ParseIntPipe) docId: number,
    @Res() res: Response,
  ) {
    const info = await this.documentsService.getHorseDocumentFilePath(user, horseId, docId);
    if (info.externalUrl) {
      return res.redirect(info.externalUrl);
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(info.fileName)}"`);
    return res.sendFile(info.absolutePath);
  }
}
