import { Module } from '@nestjs/common';
import { TrackingController } from './tracking.controller';
import { SystemSettingsController } from './system-settings.controller';
import { TrackingService } from './tracking.service';
import { TrackingStore } from './tracking.store';
import { HandoverController } from './handover.controller';
import { HandoverService } from './handover.service';
import { HandoverStore } from './handover.store';
import { NotificationsModule } from '../notifications/notifications.module';
import { RoutesModule } from '../routes/routes.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [NotificationsModule, RoutesModule, DocumentsModule],
  controllers: [HandoverController, TrackingController, SystemSettingsController],
  providers: [TrackingService, TrackingStore, HandoverService, HandoverStore],
  exports: [TrackingService, TrackingStore, HandoverService, HandoverStore],
})
export class TrackingModule {}
