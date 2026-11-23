import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, RowDataPacket } from 'mysql2/promise';
import { DocumentsStore } from './documents.store';
import { DocumentsService } from './documents.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MYSQL_POOL } from '../../common/database/database.module';
import { DocumentStatus } from './documents.types';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import { formatDateIct, parseStartOfDayIct } from './requirement-policy';

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_THRESHOLDS = [30, 7, 1];

@Injectable()
export class DocumentExpiryMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DocumentExpiryMonitorService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly documentsStore: DocumentsStore,
    private readonly documentsService: DocumentsService,
    private readonly notificationsService: NotificationsService,
    @Inject(MYSQL_POOL) private readonly pool: Pool,
  ) {}

  onModuleInit(): void {
    if (process.env.DISABLE_DOC_EXPIRY_SCHEDULER === 'true') return;
    const intervalMs = Math.max(60_000, Number(process.env.DOC_EXPIRY_SWEEP_INTERVAL_MS ?? 3_600_000));
    this.timer = setInterval(() => {
      void this.runSweep().catch((err) => {
        this.logger.warn(`Document expiry background sweep error: ${(err as Error).message}`);
      });
    }, intervalMs);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runSweep(): Promise<{
    expiredCount: number;
    reminderCount: number;
    demotedOrdersCount: number;
  }> {
    if (this.running) {
      return { expiredCount: 0, reminderCount: 0, demotedOrdersCount: 0 };
    }

    this.running = true;
    try {
      let expiredCount = 0;
      let reminderCount = 0;
      let demotedOrdersCount = 0;

      const now = new Date();
      const todayIct = formatDateIct(now);
      const todayMs = parseStartOfDayIct(todayIct);

      // 1. Fetch all approved documents that are not archived
      const approvedDocs = await this.documentsStore.findApprovedDocuments();

      for (const doc of approvedDocs) {
        if (!doc.expiryDate) continue;
        const expiryStr = doc.expiryDate.trim().slice(0, 10);
        const expiryMs = parseStartOfDayIct(expiryStr);

        // Case A: Expired document
        if (expiryStr < todayIct) {
          await this.documentsStore.updateDocumentReview(
            doc.id,
            DocumentStatus.EXPIRED,
            'Hết hạn tự động qua hệ thống giám sát định kỳ',
            undefined,
            undefined,
            null,
          );

          await this.documentsStore.createReviewLog({
            documentId: doc.id,
            fromStatus: 'approved',
            toStatus: 'expired',
            reviewerId: null,
            reason: 'Hết hạn tự động',
            checkedFieldsJson: null,
          });

          await this.documentsStore.recordExpiryNotice(doc.id, 0);

          const ownerId = doc.ownerId ?? doc.uploadedBy;
          const title = doc.regulationTitle || doc.docType;
          await this.notificationsService.createNotification(
            ownerId,
            'Hồ sơ kiểm dịch đã hết hạn',
            `Hồ sơ "${title}" của ngựa "${doc.horseName || 'ngựa'}" đã hết hạn vào ngày ${expiryStr}. Vui lòng cập nhật bản mới.`,
            'status_update',
          );
          expiredCount++;
          continue;
        }

        // Case B: Reminders before expiration (30, 7, 1 days)
        const diffDays = Math.floor((expiryMs - todayMs) / DAY_MS);
        for (const threshold of REMINDER_THRESHOLDS) {
          if (diffDays <= threshold && diffDays >= 0) {
            const alreadySent = await this.documentsStore.hasExpiryNoticeBeenSent(doc.id, threshold);
            if (!alreadySent) {
              const recorded = await this.documentsStore.recordExpiryNotice(doc.id, threshold);
              if (recorded) {
                const ownerId = doc.ownerId ?? doc.uploadedBy;
                const title = doc.regulationTitle || doc.docType;
                await this.notificationsService.createNotification(
                  ownerId,
                  'Nhắc nhở gia hạn hồ sơ kiểm dịch',
                  `Hồ sơ "${title}" của ngựa "${doc.horseName || 'ngựa'}" sẽ hết hạn trong ${diffDays} ngày (ngày ${expiryStr}). Vui lòng chuẩn bị gia hạn.`,
                  'status_update',
                );
                reminderCount++;
              }
            }
          }
        }
      }

      // 2. Demote orders in ready_to_depart if any Tier A document required for the trip has expired
      const systemUser: AuthenticatedUser = {
        id: '0',
        email: 'system@equitransit.local',
        role: UserRole.LOGISTICS_MANAGER,
      };

      const [readyOrders] = await this.pool.execute<RowDataPacket[]>(
        "SELECT shipment_id, customer_id, request_code FROM shipment WHERE status = 'ready_to_depart'",
      );

      for (const orderRow of readyOrders) {
        const shipmentId = Number(orderRow.shipment_id);
        const checklist = await this.documentsService.getOrderComplianceChecklist(systemUser, shipmentId);

        // Check if compliance is broken or Tier A docs are expired/missing
        const hasTierAExpired = checklist.horses.some((h) =>
          h.documents.some((d) => d.isExpiredForTrip && (!d.regulationDocType || d.status !== 'approved')),
        );

        if (!checklist.isFullyCompliant || checklist.hasExpiredDocuments || hasTierAExpired) {
          // Demote order back to planning
          await this.pool.execute(
            "UPDATE shipment SET status = 'planning' WHERE shipment_id = ? AND status = 'ready_to_depart'",
            [shipmentId],
          );

          const code = orderRow.request_code || `REQ-${String(shipmentId).padStart(3, '0')}`;

          await this.notificationsService.notifyRole(
            'Logistics Manager',
            `⚠️ Đơn ${code} chuyển về planning do giấy tờ Tầng A hết hạn`,
            `Đơn vận chuyển ${code} đang ở trạng thái ready_to_depart nhưng phát hiện hồ sơ Tầng A của ngựa đã hết hạn hoặc không còn đủ điều kiện xuất phát. Đơn đã được chuyển về trạng thái planning.`,
            'status_update',
            shipmentId,
          );

          await this.notificationsService.createNotification(
            orderRow.customer_id,
            `Đơn ${code} cần bổ sung giấy tờ kiểm dịch`,
            `Đơn vận chuyển ${code} tạm thời chuyển về trạng thái lập kế hoạch (planning) do phát sinh hồ sơ kiểm dịch hết hạn. Vui lòng kiểm tra và cập nhật lại hồ sơ.`,
            'document_missing',
            shipmentId,
          );

          demotedOrdersCount++;
        }
      }

      // 3. For in_transit orders: do NOT change status, keep existing runtime compliance alert
      const [inTransitOrders] = await this.pool.execute<RowDataPacket[]>(
        "SELECT shipment_id FROM shipment WHERE status IN ('in_transit', 'return_pending')",
      );

      for (const orderRow of inTransitOrders) {
        const shipmentId = Number(orderRow.shipment_id);
        const checklist = await this.documentsService.getOrderComplianceChecklist(systemUser, shipmentId);
        if (!checklist.isFullyCompliant || checklist.hasExpiredDocuments) {
          await this.documentsService.flagInTransitComplianceAlert(
            shipmentId,
            'Đơn đang vận chuyển nhưng phát sinh hồ sơ kiểm dịch hết hạn hoặc không đạt chuẩn.',
          );
        }
      }

      return { expiredCount, reminderCount, demotedOrdersCount };
    } finally {
      this.running = false;
    }
  }
}
