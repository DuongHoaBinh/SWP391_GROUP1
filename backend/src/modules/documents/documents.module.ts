import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { HorseDocumentsController } from './horse-documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentsStore } from './documents.store';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [DocumentsController, HorseDocumentsController],
  providers: [DocumentsService, DocumentsStore],
  exports: [DocumentsService, DocumentsStore],
})
export class DocumentsModule {}
