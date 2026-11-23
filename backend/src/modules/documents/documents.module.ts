import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { HorseDocumentsController } from './horse-documents.controller';
import { ComplianceController } from './compliance.controller';
import { DocumentsService } from './documents.service';
import { DocumentsStore } from './documents.store';
import { DocumentExpiryMonitorService } from './document-expiry-monitor.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [DocumentsController, HorseDocumentsController, ComplianceController],
  providers: [DocumentsService, DocumentsStore, DocumentExpiryMonitorService],
  exports: [DocumentsService, DocumentsStore, DocumentExpiryMonitorService],
})
export class DocumentsModule {}
