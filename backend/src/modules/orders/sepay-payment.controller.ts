import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { SepayPaymentService } from './sepay-payment.service';
import {
  ManualConfirmPaymentDto,
  SepayWebhookPayloadDto,
  SimulateSepayWebhookDto,
  UpdatePaymentConfigDto,
} from './sepay-payment.types';

@ApiTags('Orders - SePay QR Payment & Invoices')
@Controller()
export class SepayPaymentController {
  constructor(private readonly payments: SepayPaymentService) {}

  @Get('orders/payments/config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get bank receiving account & QR payment configuration' })
  getConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.payments.getConfig(user);
  }

  @Put('orders/payments/config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manager updates bank receiving account & QR payment configuration' })
  updateConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePaymentConfigDto,
  ) {
    return this.payments.updateConfig(user, dto);
  }

  @Get('orders/payments/overview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manager / Coordinator gets payment status overview for all orders' })
  getOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.payments.getAllPaymentsOverview(user);
  }

  @Get('orders/:id/payment')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get QR payment, invoice, and Flow 2 eligibility for an order' })
  getOrderPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.payments.getOrderPaymentDetail(user, id);
  }

  @Post('orders/:id/payment/request')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manager sends or resends QR payment request after Flow 2 is completed' })
  sendPaymentRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.payments.sendPaymentRequest(user, id);
  }

  @Post('orders/:id/payment/report-transferred')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Customer reports manual bank transfer ("Tôi đã chuyển khoản")' })
  reportTransferred(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.payments.reportCustomerTransferred(user, id);
  }

  @Post('orders/:id/payment/confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manager manually confirms payment received' })
  confirmManual(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ManualConfirmPaymentDto,
  ) {
    return this.payments.confirmManualByManager(user, id, dto);
  }

  @Post('webhooks/sepay')
  @HttpCode(200)
  @ApiOperation({ summary: 'Public SePay Webhook endpoint protected by Authorization: Apikey <KEY>' })
  handleWebhook(
    @Headers('authorization') authHeader: string | undefined,
    @Body() payload: SepayWebhookPayloadDto,
  ) {
    return this.payments.handleSepayWebhook(authHeader, payload);
  }

  @Post('webhooks/sepay/simulate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Simulate SePay Test Mode webhook transfer (when PAYMENT_DEV_SIMULATE=true)' })
  simulateWebhook(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SimulateSepayWebhookDto,
  ) {
    return this.payments.simulateWebhook(user, dto);
  }
}

