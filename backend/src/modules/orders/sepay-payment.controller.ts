import { Controller, Get, Header, Headers, HttpCode, Param, ParseIntPipe, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { SepayPaymentService } from './sepay-payment.service';

@ApiTags('Orders - SePay')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class SepayPaymentController {
  constructor(private readonly payments: SepayPaymentService) {}

  @Get(':id/payments/sepay')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Customer reads own payment; manager/admin may view payment status' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) { return this.payments.get(user, id); }

  @Post(':id/payments/sepay')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiOperation({ summary: 'Create or reuse SePay bank transfer instructions using the persisted VND quote' })
  create(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) { return this.payments.create(user, id); }
}

@ApiTags('SePay webhook')
@Controller('payments/sepay/webhook')
export class SepayWebhookController {
  constructor(private readonly payments: SepayPaymentService) {}

  @Get()
  readiness() { this.payments.config(); return { service: 'ht-sepay-webhook', status: 'ready', mode: 'integrated' }; }

  @Post()
  @HttpCode(200)
  receive(@Req() req: RawBodyRequest<Request>, @Headers('x-sepay-signature') signature?: string, @Headers('x-sepay-timestamp') timestamp?: string) {
    return this.payments.webhook(req.rawBody, signature, timestamp);
  }
}
