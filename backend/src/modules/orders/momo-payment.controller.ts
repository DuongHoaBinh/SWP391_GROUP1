import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { MomoPaymentService } from './momo-payment.service';
import { ConfirmAtmSandboxDto, MomoIpnDto } from './momo-payment.types';

@ApiTags('Orders - MoMo Sandbox')
@Controller('orders')
export class MomoPaymentController {
  constructor(private readonly payments: MomoPaymentService) {}

  @Get(':id/payments/momo') @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Customer reads own sandbox payment' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) { return this.payments.get(user, id); }

  @Post(':id/payments/momo') @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Create or reuse a MoMo sandbox payment using the stored VND quote' })
  create(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) { return this.payments.create(user, id); }

  @Post(':id/payments/momo/refresh') @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Query MoMo sandbox to reconcile the current payment' })
  refresh(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) { return this.payments.refresh(user, id); }

  @Post(':id/payments/momo/confirm-atm') @UseGuards(JwtAuthGuard) @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm ATM card payment in sandbox mode' })
  confirmAtm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ConfirmAtmSandboxDto,
  ) {
    return this.payments.confirmAtmSandbox(user, id, body);
  }

  @Post('payments/momo/ipn') @HttpCode(204)
  @ApiOperation({ summary: 'MoMo sandbox IPN; validates signature and persisted transaction identity' })
  async ipn(@Body() dto: MomoIpnDto) { await this.payments.ipn(dto); }
}
