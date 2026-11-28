import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, RowDataPacket } from 'mysql2/promise';
import { DocumentsStore } from './documents.store';
import { DocumentsService } from './documents.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MYSQL_POOL } from '../../common/database/database.module';
import { DocumentStatus } from './documents.types';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../auth/auth.types';
import { computeDeferredSubmitDeadline, formatDateIct, parseEndOfDayIct, parseStartOfDayIct } from './requirement-policy';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const REMINDER_THRESHOLDS = [30, 7, 1];
const DEFERRED_DOC_THRESHOLD_HOURS = [48, 24, 0];

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
    deferredRemindersCount: number;
  }> {
    if (this.running) {
      return { expiredCount: 0, reminderCount: 0, demotedOrdersCount: 0, deferredRemindersCount: 0 };
    }

    this.running = true;
    try {
      let expiredCount = 0;
      let reminderCount = 0;
      let demotedOrdersCount = 0;
      let deferredRemindersCount = 0;

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

      // 2. Demote orders in ready_to_depart if any required document has expired
      const systemUser: AuthenticatedUser = {
        id: '0',
        email: 'system@equitransit.local',
        role: UserRole.LOGISTICS_MANAGER,
      };

      const [readyOrders] = await this.pool.execute<RowDataPacket[]>(
        "SELECT shipment_id, customer_id FROM shipment WHERE status = 'ready_to_depart'",
      );

      for (const orderRow of readyOrders) {
        const shipmentId = Number(orderRow.shipment_id);
        const checklist = await this.documentsService.getOrderComplianceChecklist(systemUser, shipmentId);

        const hasExpiredRequiredDoc = checklist.horses.some((h) =>
          h.documents.some((d) => d.status === DocumentStatus.EXPIRED),
        );

        if (!checklist.isFullyCompliant || checklist.hasExpiredDocuments || hasExpiredRequiredDoc) {
          // Demote order back to confirmed/planning and sync route plan_status
          await this.pool.execute(
            "UPDATE shipment SET status = 'confirmed' WHERE shipment_id = ? AND status = 'ready_to_depart'",
            [shipmentId],
          );
          await this.pool.execute(
            "UPDATE route SET plan_status = 'confirmed' WHERE shipment_id = ? AND plan_status = 'ready_to_depart'",
            [shipmentId],
          );

          const code = `REQ-${String(shipmentId).padStart(3, '0')}`;

          await this.notificationsService.notifyRole(
            'Logistics Manager',
            `⚠️ Đơn ${code} cần rà soát lại do có hồ sơ kiểm dịch hết hạn`,
            `Đơn vận chuyển ${code} đang ở trạng thái ready_to_depart nhưng phát hiện hồ sơ kiểm dịch của ngựa đã hết hạn hoặc không còn đủ điều kiện xuất phát. Đơn đã tạm chuyển về trạng thái đã xác nhận (confirmed).`,
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

      // 4. Remind Customer (and alert Manager on overdue) for deferred ("Submit later") documents approaching submitDeadline
      try {
        const [deferredRows] = await this.pool.execute<RowDataPacket[]>(
          `SELECT shipment_id, customer_id, requested_date, departure_date, created_at, deferred_documents_json
           FROM shipment
           WHERE status IN ('awaiting_payment', 'paid_pending_review', 'approved', 'planning', 'confirmed')
             AND deferred_documents_json IS NOT NULL`,
        );

        for (const row of deferredRows) {
          const shipmentId = Number(row.shipment_id);
          const customerId = Number(row.customer_id);
          let deferredList: Array<{
            horseId: number;
            documentTypeCode: string;
            documentTypeName?: string;
            submitDeadline?: string | null;
          }> = [];
          try {
            const parsed =
              typeof row.deferred_documents_json === 'string'
                ? JSON.parse(row.deferred_documents_json)
                : row.deferred_documents_json;
            if (Array.isArray(parsed)) deferredList = parsed;
          } catch {
            deferredList = [];
          }
          if (deferredList.length === 0) continue;

          const checklist = await this.documentsService.getOrderComplianceChecklist(systemUser, shipmentId);
          const code = `REQ-${String(shipmentId).padStart(3, '0')}`;
          const departureRef = row.departure_date || row.requested_date;
          const createdRef = row.created_at || now;
          const canonicalDeadline = departureRef
            ? computeDeferredSubmitDeadline(new Date(departureRef), new Date(createdRef))
            : todayIct;

          for (const item of deferredList) {
            const horseId = Number(item.horseId);
            const docCode = String(item.documentTypeCode || '').trim();
            if (!horseId || !docCode) continue;

            // Skip if the horse already has an approved or submitted non-expired document for this code
            const horseChecklist = checklist.horses.find((h) => Number(h.horseId) === horseId);
            const alreadyUploaded = Boolean(
              horseChecklist?.documents?.some((d) => {
                const sameType =
                  String(d.documentTypeCode || d.regulationDocType || d.docType || '').toLowerCase() ===
                  docCode.toLowerCase();
                return sameType && (d.status === 'approved' || d.status === 'submitted') && !d.isExpiredForTrip;
              }),
            );
            if (alreadyUploaded) continue;

            const deadlineStr = canonicalDeadline;
            const hoursRemaining = (parseEndOfDayIct(deadlineStr) - now.getTime()) / HOUR_MS;

            // Pick the tightest crossed threshold (0 = overdue, 24 = <=24h left, 48 = <=48h left)
            let matchedThreshold: number | null = null;
            if (hoursRemaining <= 0) matchedThreshold = 0;
            else if (hoursRemaining <= 24) matchedThreshold = 24;
            else if (hoursRemaining <= 48) matchedThreshold = 48;

            if (matchedThreshold === null) continue;

            // Deduplicate per (shipment_id, horse_id, document_type_code, threshold_hours)
            const [insRes] = await this.pool.execute(
              `INSERT IGNORE INTO shipment_doc_deadline_notice
                 (shipment_id, horse_id, document_type_code, threshold_hours)
               VALUES (?, ?, ?, ?)`,
              [shipmentId, horseId, docCode, matchedThreshold],
            );
            const inserted = Number((insRes as { affectedRows?: number }).affectedRows || 0) > 0;
            if (!inserted) continue;

            const horseName = horseChecklist?.horseName || `#${horseId}`;
            const docLabel = item.documentTypeName || docCode;

            if (matchedThreshold === 0) {
              await Promise.allSettled([
                this.notificationsService.createNotification(
                  customerId,
                  `Quá hạn nộp bổ sung hồ sơ (${code})`,
                  `Giấy tờ "${docLabel}" của ngựa ${horseName} (đơn ${code}) đã quá hạn nộp bổ sung (${deadlineStr}). Vui lòng tải lên ngay để tránh trễ giờ xuất phát.`,
                  'document_missing',
                  shipmentId,
                ),
                this.notificationsService.notifyRole(
                  'Logistics Manager',
                  `Khách chưa nộp giấy tờ "Nộp sau" quá hạn (${code})`,
                  `Đơn ${code}: giấy tờ "${docLabel}" của ngựa ${horseName} đã quá hạn nộp bổ sung (${deadlineStr}) nhưng chưa được tải lên. Vui lòng liên hệ khách hàng xử lý trước khi xuất phát.`,
                  'incident',
                  shipmentId,
                ),
              ]);
            } else {
              await this.notificationsService.createNotification(
                customerId,
                `Nhắc hạn nộp bổ sung hồ sơ (${code})`,
                `Còn dưới ${matchedThreshold} giờ đến hạn nộp bổ sung (${deadlineStr}) cho giấy tờ "${docLabel}" của ngựa ${horseName} (đơn ${code}). Vui lòng vào mục Hồ sơ của đơn để tải lên sớm.`,
                'document_missing',
                shipmentId,
              );
            }
            deferredRemindersCount++;
          }
        }
      } catch (err) {
        this.logger.warn(`Deferred document deadline reminder sweep skipped: ${(err as Error).message}`);
      }

      return { expiredCount, reminderCount, demotedOrdersCount, deferredRemindersCount };
    } finally {
      this.running = false;
    }
  }
}
