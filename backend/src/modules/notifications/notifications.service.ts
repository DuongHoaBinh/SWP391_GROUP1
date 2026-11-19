import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { NotificationsStore } from './notifications.store';
import { NotificationItem, NotificationType } from './notifications.types';
import { MailService } from '../auth/mail.service';

const CRITICAL_EMAIL_TYPES = new Set<NotificationType>([
  'incident',
  'handover_complete',
  'document_missing',
]);

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationsStore: NotificationsStore,
    @Optional() private readonly mailService?: MailService,
  ) {}

  async createNotification(
    userId: number,
    title: string,
    message: string,
    notifType: NotificationType = 'status_update',
    shipmentId: number | null = null,
    horseId: number | null = null,
  ): Promise<number> {
    const id = await this.notificationsStore.create(
      userId,
      title,
      message,
      notifType,
      shipmentId,
      horseId,
    );

    if (
      CRITICAL_EMAIL_TYPES.has(notifType) &&
      this.mailService &&
      typeof this.notificationsStore.findUserEmailById === 'function'
    ) {
      try {
        const email = await this.notificationsStore.findUserEmailById(userId);
        if (email) {
          await this.mailService.sendOperationalEmail(email, title, message);
        }
      } catch {
        // Non-blocking SMTP channel
      }
    }

    return id;
  }

  async getMyNotifications(userId: number): Promise<NotificationItem[]> {
    return this.notificationsStore.findByUserId(userId);
  }

  async markAsRead(notificationId: number, userId: number): Promise<{ success: boolean }> {
    const updated = await this.notificationsStore.markAsRead(notificationId, userId);
    if (!updated) {
      throw new NotFoundException('Notification not found or access denied');
    }
    return { success: true };
  }

  async markAllAsRead(userId: number): Promise<{ success: boolean }> {
    await this.notificationsStore.markAllAsRead(userId);
    return { success: true };
  }

  async notifyRole(
    roleName: string,
    title: string,
    message: string,
    notifType: NotificationType = 'status_update',
    shipmentId: number | null = null,
  ): Promise<void> {
    const userIds = await this.notificationsStore.findUserIdsByRole(roleName);
    for (const uid of userIds) {
      await this.createNotification(uid, title, message, notifType, shipmentId);
    }
  }
}
