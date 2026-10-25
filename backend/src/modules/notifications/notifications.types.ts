export type NotificationType =
  | 'document_missing'
  | 'status_update'
  | 'incident'
  | 'handover_complete'
  | 'custom';

export interface NotificationItem {
  id: number;
  userId: number;
  shipmentId: number | null;
  horseId: number | null;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;
}
