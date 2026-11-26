import { Module } from '@nestjs/common';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';
import { RoutesStore } from './routes.store';
import { OrdersModule } from '../orders/orders.module';
import { FleetModule } from '../fleet/fleet.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DocumentsModule } from '../documents/documents.module';
import { DistanceModule } from './distance.module';
import { RouteNetworkModule } from './route-network.module';

@Module({
  imports: [OrdersModule, FleetModule, NotificationsModule, DocumentsModule, DistanceModule, RouteNetworkModule],
  controllers: [RoutesController],
  providers: [RoutesService, RoutesStore],
  exports: [RoutesService, RoutesStore, DistanceModule, RouteNetworkModule],
})
export class RoutesModule {}
