import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsStore } from './notifications.store';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsStore],
  exports: [NotificationsService],
})
export class NotificationsModule {}
