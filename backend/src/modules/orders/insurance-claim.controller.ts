import {
  Body,
  Controller,
  Get,
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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import { extname, join } from 'path';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import { CreateInsuranceClaimDto, ReviewInsuranceClaimDto } from './dto/insurance-claim.dto';
import { SubmitRefundFormDto } from './dto/prepaid-flow.dto';
import { InsuranceClaimService } from './insurance-claim.service';

const uploadDir = join(process.cwd(), 'uploads', 'claims');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

@ApiTags('Insurance Claims')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class InsuranceClaimController {
  constructor(private readonly claimService: InsuranceClaimService) {}

  @Get('orders/:id/insurance/payout-table')
  @Roles(UserRole.CUSTOMER, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Bảng đền bù bằng tiền thật theo từng cá thể ngựa của đơn hàng' })
  getShipmentPayoutTable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.claimService.getShipmentPayoutTable(user, id);
  }

  @Post('orders/:id/horses/:shipmentHorseId/claims')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Khách hàng nộp yêu cầu bồi thường bảo hiểm cho cá thể ngựa' })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `claim-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  createClaim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('shipmentHorseId', ParseIntPipe) shipmentHorseId: number,
    @Body() dto: CreateInsuranceClaimDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.claimService.createClaim(user, id, shipmentHorseId, dto, files);
  }

  @Get('orders/:id/claims')
  @Roles(UserRole.CUSTOMER, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Xem danh sách yêu cầu bồi thường của một đơn hàng' })
  listClaimsByShipment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.claimService.listClaimsByShipment(user, id);
  }

  @Get('insurance/claims')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Logistics Manager / Admin xem danh sách toàn bộ claim hệ thống' })
  @ApiQuery({ name: 'status', required: false, description: 'Lọc theo trạng thái' })
  listAllClaims(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.claimService.listAllClaims(user, status);
  }

  @Get('insurance/claims/:claimId')
  @Roles(UserRole.CUSTOMER, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Xem chi tiết yêu cầu bồi thường và lịch sử thẩm định' })
  getClaimById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('claimId', ParseIntPipe) claimId: number,
  ) {
    return this.claimService.getClaimById(user, claimId);
  }

  @Get('insurance/claims/:claimId/evidence/:fileIndex')
  @Roles(UserRole.CUSTOMER, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Tải/Xem tệp bằng chứng bồi thường có phân quyền xác thực' })
  async getClaimEvidence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('claimId', ParseIntPipe) claimId: number,
    @Param('fileIndex', ParseIntPipe) fileIndex: number,
    @Res() res: Response,
  ) {
    const { absolutePath, fileName } = await this.claimService.getClaimEvidenceFile(
      user,
      claimId,
      fileIndex,
    );
    res.download(absolutePath, fileName);
  }

  @Patch('insurance/claims/:claimId/review')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Logistics Manager / Admin thẩm định yêu cầu bồi thường' })
  reviewClaim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('claimId', ParseIntPipe) claimId: number,
    @Body() dto: ReviewInsuranceClaimDto,
  ) {
    return this.claimService.reviewClaim(user, claimId, dto);
  }

  @Get('insurance/claims/:claimId/refund-form')
  @Roles(UserRole.CUSTOMER, UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy thông tin biểu mẫu nhận tiền bồi thường bảo hiểm theo claimId' })
  getClaimRefundForm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('claimId', ParseIntPipe) claimId: number,
  ) {
    return this.claimService.getClaimRefundForm(user, claimId);
  }

  @Post('insurance/claims/:claimId/refund-form')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Khách hàng nộp thông tin tài khoản ngân hàng nhận tiền bồi thường bảo hiểm' })
  submitClaimRefundForm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('claimId', ParseIntPipe) claimId: number,
    @Body() dto: SubmitRefundFormDto,
  ) {
    return this.claimService.submitClaimRefundForm(user, claimId, dto);
  }
}
