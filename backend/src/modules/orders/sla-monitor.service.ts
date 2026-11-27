import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersOpsStore } from './orders-ops.store';
import { CancellationCategory } from './refund-policy';

@Injectable()
export class SlaMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlaMonitorService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly opsStore: OrdersOpsStore,
    private readonly notificationsService: NotificationsService,
  ) {}

  onModuleInit(): void {
    if (process.env.DISABLE_SLA_SCHEDULER === 'true') return;
    const intervalMs = Math.max(15_000, Number(process.env.SLA_SWEEP_INTERVAL_MS ?? 60_000));
    this.timer = setInterval(() => {
      void this.runSweep().catch((err) => {
        this.logger.warn(`SLA background sweep error: ${(err as Error).message}`);
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
    escalatedPrimaryAssignments: number;
    hardCapAlertsTriggered: number;
    overdueInvoicesMarked: number;
    autoCancelledOverdueShipments: number;
  }> {
    if (this.running) {
      return {
        escalatedPrimaryAssignments: 0,
        hardCapAlertsTriggered: 0,
        overdueInvoicesMarked: 0,
        autoCancelledOverdueShipments: 0,
      };
    }

    this.running = true;
    try {
      const sweep = await this.opsStore.runSlaSweepQueries();

      for (const rem of sweep.primaryReminders) {
        const code = `REQ-${String(rem.shipmentId).padStart(3, '0')}`;
        await this.notificationsService.createNotification(
          rem.userId,
          `Nhắc nhở SLA xác nhận chuyến (${code})`,
          `Bạn đã qua 50% thời hạn xác nhận nhiệm vụ cho đơn ${code}. Vui lòng xác nhận sớm để tránh chuyển Backup Pool.`,
          'status_update',
          rem.shipmentId,
        );
      }

      for (const br of sweep.primaryBreaches) {
        const code = `REQ-${String(br.shipmentId).padStart(3, '0')}`;
        await this.notificationsService.notifyRole(
          'Logistics Manager',
          `Cảnh báo quá SLA nhân sự: Đơn ${code}`,
          `Nhân sự chính cho đơn ${code} chưa xác nhận đúng SLA và đã chuyển sang trạng thái chờ Backup Pool. Vui lòng gán nhân sự từ Backup Pool (kế hoạch vẫn giữ nguyên approved).`,
          'incident',
          br.shipmentId,
        );
      }

      for (const sid of sweep.hardCapShipmentIds) {
        const code = `REQ-${String(sid).padStart(3, '0')}`;
        await this.notificationsService.notifyRole(
          'Logistics Manager',
          `URGENT BR-F3-06: Quá trần hóa đơn T-52h - Đơn ${code}`,
          `Đơn ${code} đã vượt trần T-52h nhưng chưa hoàn tất xác nhận nhân sự/phát hành hóa đơn. Vui lòng chọn phương án fallback (điều chuyển / đối tác ngoài / dời chuyến).`,
          'incident',
          sid,
        );
      }

      for (const rem of sweep.paymentReminders) {
        const code = `REQ-${String(rem.shipmentId).padStart(3, '0')}`;
        await this.notificationsService.createNotification(
          rem.customerId,
          `Nhắc hạn thanh toán cước (${code})`,
          `Hóa đơn đơn ${code} chỉ còn dưới 6 giờ trước hạn thanh toán. Vui lòng hoàn tất chuyển khoản VietQR SePay để giữ chỗ xe.`,
          'status_update',
          rem.shipmentId,
        );
      }

      for (const ov of sweep.overdueMarked) {
        const code = `REQ-${String(ov.shipmentId).padStart(3, '0')}`;
        await Promise.allSettled([
          this.notificationsService.createNotification(
            ov.customerId,
            `Hóa đơn quá hạn thanh toán (${code})`,
            `Đơn ${code} đã quá hạn thanh toán. Bộ phận Điều hành sẽ xem xét gia hạn 1 lần hoặc giải phóng ô chuồng.`,
            'status_update',
            ov.shipmentId,
          ),
          this.notificationsService.notifyRole(
            'Logistics Manager',
            `Đơn quá hạn thanh toán (${code})`,
            `Đơn ${code} đã quá payment_due_at. Vui lòng chọn Giải phóng ô chuồng hoặc Cấp gia hạn duy nhất 1 lần (trần T-24h).`,
            'incident',
            ov.shipmentId,
          ),
        ]);
      }

      let autoCancelled = 0;
      for (const sid of sweep.expiredGraceShipmentIds) {
        try {
          const cancelled = await this.opsStore.operationalCancel(null, sid, {
            category: CancellationCategory.PAYMENT_OVERDUE_EXPIRED,
            reason: 'Hệ thống tự động hủy vận hành do hết thời hạn gia hạn thanh toán (grace_due_at / trần T-24h).',
          });
          autoCancelled++;
          const code = `REQ-${String(sid).padStart(3, '0')}`;
          await Promise.allSettled([
            this.notificationsService.createNotification(
              cancelled.customerId,
              `Tự động hủy đơn do hết hạn gia hạn thanh toán (${code})`,
              `Đơn ${code} đã quá hạn gia hạn cuối cùng (T-24h) mà chưa ghi nhận SePay thành công nên hệ thống tự động hủy vận hành để giải phóng ô chuồng.`,
              'status_update',
              sid,
            ),
            this.notificationsService.notifyRole(
              'Logistics Manager',
              `Auto-Cancel quá gia hạn thanh toán (${code})`,
              `Đơn ${code} đã tự động chuyển sang cancelled_operational (payment_overdue_expired) tại hạn chót.`,
              'status_update',
              sid,
            ),
          ]);
        } catch (err) {
          this.logger.warn(`Auto-cancel skipped for shipment #${sid}: ${(err as Error).message}`);
        }
      }

      if ((sweep as any).prepaidAutoCancelled) {
        const windowHours = Math.max(1, Math.round((Number(process.env.ORDER_PAYMENT_WINDOW_MINUTES) || 720) / 60));
        for (const pac of (sweep as any).prepaidAutoCancelled) {
          autoCancelled++;
          const code = `REQ-${String(pac.shipmentId).padStart(3, '0')}`;
          await this.notificationsService.createNotification(
            pac.customerId,
            `Đơn hàng đã tự động hủy do hết hạn thanh toán (${code})`,
            `Đơn hàng ${code} đã quá thời hạn thanh toán ${windowHours} giờ mà chưa ghi nhận giao dịch thành công. Đơn hàng đã tự động hủy, giải phóng xe và hoàn trả ngựa. Quý khách vui lòng tạo báo giá mới nếu muốn tiếp tục đặt chuyến.`,
            'status_update',
            pac.shipmentId,
          );
        }
      }

      if ((sweep as any).prepaidReviewAlerts) {
        for (const pra of (sweep as any).prepaidReviewAlerts) {
          const code = `REQ-${String(pra.shipmentId).padStart(3, '0')}`;
          await this.notificationsService.notifyRole(
            'Logistics Manager',
            `Đơn trả trước quá hạn có giao dịch cần đối soát (${code})`,
            `Đơn hàng ${code} đã quá payment_due_at nhưng có giao dịch SePay đang ở trạng thái review. Hệ thống không tự động hủy. Vui lòng đối soát.`,
            'incident',
            pra.shipmentId,
          );
        }
      }

      return {
        escalatedPrimaryAssignments: sweep.primaryBreaches.length,
        hardCapAlertsTriggered: sweep.hardCapShipmentIds.length,
        overdueInvoicesMarked: sweep.overdueMarked.length,
        autoCancelledOverdueShipments: autoCancelled,
      };
    } finally {
      this.running = false;
    }
  }
}
