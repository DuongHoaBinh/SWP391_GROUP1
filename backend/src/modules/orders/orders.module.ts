import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersStore } from './orders.store';
import { NotificationsModule } from '../notifications/notifications.module';
import { DocumentsModule } from '../documents/documents.module';
import { MomoPaymentController } from './momo-payment.controller';
import { MomoPaymentService } from './momo-payment.service';
import { MomoPaymentStore } from './momo-payment.store';
import { SepayPaymentController, SepayWebhookController } from './sepay-payment.controller';
import { SepayPaymentService } from './sepay-payment.service';
import { SepayPaymentStore } from './sepay-payment.store';
import { OrdersOpsController } from './orders-ops.controller';
import { OrdersOpsService } from './orders-ops.service';
import { OrdersOpsStore } from './orders-ops.store';
import { SlaMonitorService } from './sla-monitor.service';

@Module({
  imports: [NotificationsModule, DocumentsModule],
  controllers: [
    OrdersOpsController,
    OrdersController,
    MomoPaymentController,
    SepayPaymentController,
    SepayWebhookController,
  ],
  providers: [
    OrdersService,
    OrdersStore,
    MomoPaymentService,
    MomoPaymentStore,
    SepayPaymentService,
    SepayPaymentStore,
    OrdersOpsStore,
    OrdersOpsService,
    SlaMonitorService,
  ],
  exports: [
    OrdersService,
    OrdersStore,
    MomoPaymentService,
    MomoPaymentStore,
    SepayPaymentService,
    SepayPaymentStore,
    OrdersOpsStore,
    OrdersOpsService,
    SlaMonitorService,
  ],
})
export class OrdersModule {}
