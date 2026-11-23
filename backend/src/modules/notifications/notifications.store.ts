import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { createPool, Pool, RowDataPacket } from 'mysql2/promise';
import { NotificationItem, NotificationType } from './notifications.types';
import { MYSQL_POOL } from '../../common/database/database.module';

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

  constructor(@Optional() @Inject(MYSQL_POOL) private readonly injectedPool?: Pool) {
    if (injectedPool) {
      this.pool = injectedPool;
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.pool) {
      this.pool = createPool({
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 3306),
        database: process.env.DB_NAME ?? 'horse_transport_system',
        user: process.env.DB_USER ?? 'root',
        password: process.env.DB_PASSWORD ?? '',
        connectionLimit: 10,
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool && !this.injectedPool) {
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
    const [rows] = await this.pool.execute<any[]>(
      `SELECT n.notification_id, n.user_id, n.shipment_id, n.horse_id, n.title, n.message, n.notif_type, n.is_read, n.created_at,
              COALESCE(LOWER(r.role_name), 'customer') as user_role,
              cu.full_name as shipment_customer_name,
              cu.email as shipment_customer_email,
              CASE WHEN s.shipment_id IS NOT NULL THEN CONCAT('REQ-', LPAD(
                (SELECT COUNT(*) FROM shipment sub WHERE sub.customer_id = s.customer_id AND sub.shipment_id <= s.shipment_id),
                3, '0'
              )) ELSE NULL END as customer_code,
              CASE WHEN s.shipment_id IS NOT NULL THEN CONCAT('REQ-', LPAD(s.shipment_id, 3, '0')) ELSE NULL END as global_code
       FROM notification n
       JOIN \`user\` u ON u.user_id = n.user_id
       LEFT JOIN \`role\` r ON r.role_id = u.role_id
       LEFT JOIN shipment s ON s.shipment_id = n.shipment_id
       LEFT JOIN \`user\` cu ON cu.user_id = s.customer_id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [userId],
    );

    return rows.map((row) => {
      let title = row.title;
      let message = row.message;
      if (row.shipment_id) {
        if (row.user_role === 'customer' && row.customer_code && row.global_code) {
          // Khách hàng luôn thấy mã đơn theo số thứ tự của riêng mình (REQ-001, REQ-002...)
          title = title.split(row.global_code).join(row.customer_code);
          message = message.split(row.global_code).join(row.customer_code);
        } else if (row.user_role !== 'customer' && row.customer_code && row.global_code) {
          // Nhân viên nội bộ (Manager, Specialist) luôn thấy mã đơn toàn hệ thống (REQ-022...)
          title = title.split(row.customer_code).join(row.global_code);
          message = message.split(row.customer_code).join(row.global_code);
        }

        // Thay thế hiển thị tên khách hàng nếu có
        if (row.shipment_customer_name && row.shipment_customer_email) {
          message = message.split(`Khách hàng (${row.shipment_customer_email})`).join(`Khách hàng ${row.shipment_customer_name}`);
        }
      }

      // Xóa bỏ các ký tự dấu '#' đứng trước mã đơn (ví dụ: #REQ-024 -> REQ-024)
      title = title.replaceAll('#REQ-', 'REQ-');
      message = message.replaceAll('#REQ-', 'REQ-');

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

  async markAllAsRead(userId: number): Promise<boolean> {
    await this.pool.execute(
      'UPDATE notification SET is_read = TRUE WHERE user_id = ?',
      [userId],
    );
    return true;
  }

  async findUserIdsByRole(roleName: string): Promise<number[]> {
    const roleMapping: Record<string, string[]> = {
      'Logistics Manager': ['Logistics Manager', 'LOGISTICS_MANAGER'],
      'LOGISTICS_MANAGER': ['Logistics Manager', 'LOGISTICS_MANAGER'],
      // Specialist/Coordinator đã gộp vào Logistics Manager: thông báo gửi cho role cũ đến Manager.
      'Transport Specialist': ['Logistics Manager', 'LOGISTICS_MANAGER'],
      'TRANSPORT_SPECIALIST': ['Logistics Manager', 'LOGISTICS_MANAGER'],
      'Fleet & Route Coordinator': ['Logistics Manager', 'LOGISTICS_MANAGER'],
      'FLEET_ROUTE_COORDINATOR': ['Logistics Manager', 'LOGISTICS_MANAGER'],
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
    return rows.map((row) => Number(row.user_id));
  }

  async findUserEmailById(userId: number): Promise<string | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      'SELECT email FROM `user` WHERE user_id = ? LIMIT 1',
      [userId],
    );
    return rows[0]?.email ?? null;
  }
}
