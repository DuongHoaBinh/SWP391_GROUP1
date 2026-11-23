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
import { DistanceModule } from '../routes/distance.module';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { PricingStore } from './pricing.store';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { QuotesStore } from './quotes.store';
import { InsuranceClaimController } from './insurance-claim.controller';
import { InsuranceClaimService } from './insurance-claim.service';
import { InsuranceClaimStore } from './insurance-claim.store';
import { AuthModule } from '../auth/auth.module';
import { AllocationModule } from '../fleet/allocation.module';
import { QuoteAllocationService } from './quote-allocation.service';

@Module({
  imports: [NotificationsModule, DocumentsModule, DistanceModule, AuthModule, AllocationModule],
  controllers: [
    OrdersOpsController,
    OrdersController,
    PricingController,
    QuotesController,
    InsuranceClaimController,
    MomoPaymentController,
    SepayPaymentController,
    SepayWebhookController,
  ],
  providers: [
    OrdersService,
    OrdersStore,
    PricingService,
    PricingStore,
    QuotesService,
    QuotesStore,
    QuoteAllocationService,
    InsuranceClaimService,
    InsuranceClaimStore,
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
    PricingService,
    PricingStore,
    QuotesService,
    QuotesStore,
    InsuranceClaimService,
    InsuranceClaimStore,
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
