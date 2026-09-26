import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationsStore } from './notifications.store';
import { NotificationItem, NotificationType } from './notifications.types';

@Injectable()
export class NotificationsService {
  constructor(private readonly notificationsStore: NotificationsStore) {}

  async createNotification(
    userId: number,
    title: string,
    message: string,
    notifType: NotificationType = 'status_update',
    shipmentId: number | null = null,
    horseId: number | null = null,
  ): Promise<number> {
    return this.notificationsStore.create(
      userId,
      title,
      message,
      notifType,
      shipmentId,
      horseId,
    );
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
}
