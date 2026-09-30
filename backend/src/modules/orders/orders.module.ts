import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersStore } from './orders.store';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersStore],
  exports: [OrdersService, OrdersStore],
})
export class OrdersModule {}
