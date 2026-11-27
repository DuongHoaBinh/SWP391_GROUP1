import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import { PricingService } from './pricing.service';
import { CreateTariffDto, PreviewPricingDto } from './dto/pricing.dto';

@ApiTags('Pricing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get('tariffs/active')
  @ApiOperation({ summary: 'Lấy các bảng giá đang áp dụng (active) theo từng phương thức (region VN)' })
  getActiveTariffs(@Query('region') region?: string) {
    return this.pricingService.getActiveTariffs(region || 'VN');
  }

  @Get('tariffs')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy lịch sử phiên bản bảng giá của một phương thức' })
  @ApiQuery({ name: 'mode', enum: ['road', 'air', 'sea'], required: true })
  @ApiQuery({ name: 'region', required: false, example: 'VN' })
  getTariffHistory(
    @Query('mode') mode?: string,
    @Query('region') region?: string,
  ) {
    if (!mode || !['road', 'air', 'sea'].includes(mode)) {
      throw new BadRequestException('Tham số mode là bắt buộc và phải thuộc một trong các giá trị: road, air, sea');
    }
    return this.pricingService.getTariffHistory(mode as 'road' | 'air' | 'sea', region || 'VN');
  }

  @Post('tariffs')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Tạo phiên bản bảng giá mới (tự động bật bản mới, tắt bản cũ trong transaction)' })
  createTariff(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTariffDto,
  ) {
    return this.pricingService.createTariffVersion(user, dto);
  }

  @Post('preview')
  @Roles(UserRole.LOGISTICS_MANAGER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Xem trước cước vận chuyển thử nghiệm theo tham số hoặc bảng giá hiện hành' })
  previewPricing(@Body() dto: PreviewPricingDto) {
    return this.pricingService.previewPricing(dto);
  }
}
