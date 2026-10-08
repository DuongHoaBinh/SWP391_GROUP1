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
  actual_request_code?: string;
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

    try {
      // Auto-repair any past notifications that had mismatched shipment IDs (e.g. REQ-021 instead of REQ-010)
      await this.pool.execute(
        `UPDATE notification 
         SET title = REPLACE(title, 'REQ-021', 'REQ-010'), 
             message = REPLACE(message, 'REQ-021', 'REQ-010') 
         WHERE title LIKE '%REQ-021%' OR message LIKE '%REQ-021%'`
      );
    } catch (err) {
      console.warn('[NotificationsStore] Repair notification error:', err);
    }
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
      `SELECT n.notification_id, n.user_id, n.shipment_id, n.horse_id, n.title, n.message, n.notif_type, n.is_read, n.created_at,
              (SELECT CONCAT('REQ-', LPAD(
                (SELECT COUNT(*) FROM shipment sub WHERE sub.customer_id = s.customer_id AND sub.shipment_id <= s.shipment_id),
                3, '0'
              )) FROM shipment s WHERE s.shipment_id = n.shipment_id) as actual_request_code
       FROM notification n 
       WHERE n.user_id = ? 
       ORDER BY n.created_at DESC`,
      [userId],
    );

    return rows.map((row) => {
      let title = row.title;
      let message = row.message;
      if (row.shipment_id && row.actual_request_code) {
        const rawCode = `REQ-${String(row.shipment_id).padStart(3, '0')}`;
        if (rawCode !== row.actual_request_code) {
          title = title.split(rawCode).join(row.actual_request_code);
          message = message.split(rawCode).join(row.actual_request_code);
        }
      }
      return {
        id: row.notification_id,
        userId: row.user_id,
        shipmentId: row.shipment_id,
        horseId: row.horse_id,
        title,
        message,
        type: row.notif_type,
        isRead: Boolean(row.is_read),
        createdAt: new Date(row.created_at).toISOString(),
      };
    });
  }

  async markAsRead(notificationId: number, userId: number): Promise<boolean> {
    const [result] = await this.pool.execute(
      'UPDATE notification SET is_read = TRUE WHERE notification_id = ? AND user_id = ?',
      [notificationId, userId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async findUserIdsByRole(roleName: string): Promise<number[]> {
    const roleMapping: Record<string, string[]> = {
      'Logistics Manager': ['Logistics Manager', 'LOGISTICS_MANAGER'],
      'LOGISTICS_MANAGER': ['Logistics Manager', 'LOGISTICS_MANAGER'],
      'Transport Specialist': ['Transport Specialist', 'TRANSPORT_SPECIALIST'],
      'TRANSPORT_SPECIALIST': ['Transport Specialist', 'TRANSPORT_SPECIALIST'],
      'Fleet & Route Coordinator': ['Fleet & Route Coordinator', 'FLEET_ROUTE_COORDINATOR'],
      'FLEET_ROUTE_COORDINATOR': ['Fleet & Route Coordinator', 'FLEET_ROUTE_COORDINATOR'],
      'Vehicle Driver / Escort': ['Vehicle Driver / Escort', 'DRIVER_ESCORT'],
      'DRIVER_ESCORT': ['Vehicle Driver / Escort', 'DRIVER_ESCORT'],
      'Admin': ['Admin', 'ADMIN'],
      'ADMIN': ['Admin', 'ADMIN'],
      'Customer': ['Customer', 'CUSTOMER'],
      'CUSTOMER': ['Customer', 'CUSTOMER'],
    };

    const targetRoles = roleMapping[roleName] || [roleName];
    const placeholders = targetRoles.map(() => '?').join(', ');

    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT u.user_id FROM \`user\` u JOIN \`role\` r ON u.role_id = r.role_id WHERE r.role_name IN (${placeholders}) AND u.status = "active"`,
      targetRoles,
    );
    return rows.map((r) => Number(r.user_id));
  }
}
