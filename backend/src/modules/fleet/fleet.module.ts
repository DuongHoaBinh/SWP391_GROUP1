import { Module } from '@nestjs/common';
import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';
import { FleetStore } from './fleet.store';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [OrdersModule, NotificationsModule],
  controllers: [FleetController],
  providers: [FleetService, FleetStore],
  exports: [FleetService, FleetStore],
})
export class FleetModule {}
