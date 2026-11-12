import { Module } from '@nestjs/common';
import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';
import { FleetStore } from './fleet.store';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RoadTripsStore } from './road-trips.store';
import { RoadTripsController } from './road-trips.controller';

@Module({
  imports: [OrdersModule, NotificationsModule],
  controllers: [FleetController, RoadTripsController],
  providers: [FleetService, FleetStore, RoadTripsStore],
  exports: [FleetService, FleetStore, RoadTripsStore],
})
export class FleetModule {}
