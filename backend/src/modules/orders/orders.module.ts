import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersStore } from './orders.store';
import { NotificationsModule } from '../notifications/notifications.module';
import { DocumentsModule } from '../documents/documents.module';
import { MomoPaymentController } from './momo-payment.controller';
import { MomoPaymentService } from './momo-payment.service';
import { MomoPaymentStore } from './momo-payment.store';
import { SepayPaymentController } from './sepay-payment.controller';
import { SepayPaymentService } from './sepay-payment.service';
import { SepayPaymentStore } from './sepay-payment.store';

@Module({
  imports: [NotificationsModule, DocumentsModule],
  controllers: [OrdersController, MomoPaymentController, SepayPaymentController],
  providers: [
    OrdersService,
    OrdersStore,
    MomoPaymentService,
    MomoPaymentStore,
    SepayPaymentService,
    SepayPaymentStore,
  ],
  exports: [
    OrdersService,
    OrdersStore,
    MomoPaymentService,
    MomoPaymentStore,
    SepayPaymentService,
    SepayPaymentStore,
  ],
})
export class OrdersModule {}
