import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersStore } from './orders.store';
import { NotificationsModule } from '../notifications/notifications.module';
import { MomoPaymentController } from './momo-payment.controller';
import { MomoPaymentService } from './momo-payment.service';
import { MomoPaymentStore } from './momo-payment.store';

@Module({
  imports: [NotificationsModule],
  controllers: [OrdersController, MomoPaymentController],
  providers: [OrdersService, OrdersStore, MomoPaymentService, MomoPaymentStore],
  exports: [OrdersService, OrdersStore],
})
export class OrdersModule {}
