import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createPool, Pool, RowDataPacket } from 'mysql2/promise';
import { NotificationItem, NotificationType } from './notifications.types';

interface NotificationRow extends RowDataPacket {
  notification_id: number;
  user_id: number;
  shipment_id: number | null;
  horse_id: number | null;
  title: string;
  message: string;
  notif_type: NotificationType;
  is_read: number;
  created_at: Date;
}

@Injectable()
export class NotificationsStore implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;

  async onModuleInit(): Promise<void> {
    this.pool = createPool({
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 3306),
      database: process.env.DB_NAME ?? 'horse_transport_system',
      user: process.env.DB_USER ?? 'root',
      password: process.env.DB_PASSWORD ?? '',
      connectionLimit: 10,
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }

  async create(
    userId: number,
    title: string,
    message: string,
    notifType: NotificationType,
    shipmentId: number | null = null,
    horseId: number | null = null,
  ): Promise<number> {
    const [result] = await this.pool.execute(
      'INSERT INTO notification (user_id, shipment_id, horse_id, title, message, notif_type, is_read) VALUES (?, ?, ?, ?, ?, ?, FALSE)',
      [userId, shipmentId, horseId, title, message, notifType],
    );
    return (result as { insertId: number }).insertId;
  }

  async findByUserId(userId: number): Promise<NotificationItem[]> {
    const [rows] = await this.pool.execute<NotificationRow[]>(
      'SELECT notification_id, user_id, shipment_id, horse_id, title, message, notif_type, is_read, created_at FROM notification WHERE user_id = ? ORDER BY created_at DESC',
      [userId],
    );

    return rows.map((row) => ({
      id: row.notification_id,
      userId: row.user_id,
      shipmentId: row.shipment_id,
      horseId: row.horse_id,
      title: row.title,
      message: row.message,
      type: row.notif_type,
      isRead: Boolean(row.is_read),
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async markAsRead(notificationId: number, userId: number): Promise<boolean> {
    const [result] = await this.pool.execute(
      'UPDATE notification SET is_read = TRUE WHERE notification_id = ? AND user_id = ?',
      [notificationId, userId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }
}
