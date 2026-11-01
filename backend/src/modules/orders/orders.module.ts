import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersStore } from './orders.store';
import { NotificationsModule } from '../notifications/notifications.module';
import { SepayPaymentController, SepayWebhookController } from './sepay-payment.controller';
import { SepayPaymentService } from './sepay-payment.service';
import { SepayPaymentStore } from './sepay-payment.store';

@Module({
  imports: [NotificationsModule],
  controllers: [OrdersController, SepayPaymentController, SepayWebhookController],
  providers: [OrdersService, OrdersStore, SepayPaymentService, SepayPaymentStore],
  exports: [OrdersService, OrdersStore],
})
export class OrdersModule {}
