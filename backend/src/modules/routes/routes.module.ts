import { Module } from '@nestjs/common';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';
import { RoutesStore } from './routes.store';
import { OrdersModule } from '../orders/orders.module';
import { FleetModule } from '../fleet/fleet.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [OrdersModule, FleetModule, NotificationsModule, DocumentsModule],
  controllers: [RoutesController],
  providers: [RoutesService, RoutesStore],
  exports: [RoutesService, RoutesStore],
})
export class RoutesModule {}
