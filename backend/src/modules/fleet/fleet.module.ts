import { Module } from '@nestjs/common';
import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';
import { FleetStore } from './fleet.store';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RoadTripsStore } from './road-trips.store';
import { RoadTripsController } from './road-trips.controller';
import { AllocationModule } from './allocation.module';
import { CityRestrictionsController, SystemSettingsController } from './city-restrictions.controller';

@Module({
  imports: [OrdersModule, NotificationsModule, AllocationModule],
  controllers: [FleetController, RoadTripsController, CityRestrictionsController, SystemSettingsController],
  providers: [FleetService, FleetStore, RoadTripsStore],
  exports: [FleetService, FleetStore, RoadTripsStore, AllocationModule],
})
export class FleetModule {}
