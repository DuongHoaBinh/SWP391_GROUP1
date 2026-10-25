import { Module } from '@nestjs/common';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { TrackingStore } from './tracking.store';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [TrackingController],
  providers: [TrackingService, TrackingStore],
  exports: [TrackingService, TrackingStore],
})
export class TrackingModule {}
