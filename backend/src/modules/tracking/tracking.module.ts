import { Module } from '@nestjs/common';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { TrackingStore } from './tracking.store';
import { NotificationsModule } from '../notifications/notifications.module';
import { RoutesModule } from '../routes/routes.module';

@Module({
  imports: [NotificationsModule, RoutesModule],
  controllers: [TrackingController],
  providers: [TrackingService, TrackingStore],
  exports: [TrackingService, TrackingStore],
})
export class TrackingModule {}
