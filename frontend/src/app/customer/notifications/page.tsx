'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, Check, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { mockNotifications } from '@/lib/mock-data';
import { NotificationItem } from '@/lib/types';
import { DocumentUploadModal } from '@/features/documents/components/DocumentUploadModal';
import { apiClient } from '@/lib/api-client';

function formatTimeAgo(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const fetchNotifications = async () => {
    try {
      const data = await apiClient<any[]>('/notifications');
      if (Array.isArray(data) && data.length > 0) {
        const mapped: NotificationItem[] = data.map((item) => {
          const isSuccess = item.title?.toLowerCase().includes('phê duyệt') || item.title?.toLowerCase().includes('approved');
          const isCritical = item.notifType === 'health_alert' || item.title?.toLowerCase().includes('từ chối') || item.title?.toLowerCase().includes('rejected');
          
          let title = item.title || '';
          let message = item.message || '';
          if (title.includes('REQ-021')) title = title.replaceAll('REQ-021', 'REQ-010');
          if (message.includes('REQ-021')) message = message.replaceAll('REQ-021', 'REQ-010');

          return {
            id: String(item.id),
            type: isCritical ? 'CRITICAL' : isSuccess ? 'SUCCESS' : 'INFO',
            title,
            message,
            timeAgo: item.createdAt ? formatTimeAgo(item.createdAt) : 'Recently',
            isRead: Boolean(item.isRead),
            relatedRequestCode: item.shipmentId === 21 ? 'REQ-010' : (item.shipmentId ? `REQ-${String(item.shipmentId).padStart(3, '0')}` : undefined),
            actionText: item.shipmentId ? 'Xem chi tiết đơn' : undefined,
            actionUrl: item.shipmentId ? `/customer/requests/${item.shipmentId}` : undefined,
          };
        });
        setNotifications(mapped);
      } else {
        setNotifications(mockNotifications);
      }
    } catch (err) {
      console.error('Failed to fetch notifications, fallback to mock:', err);
      setNotifications(mockNotifications);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    for (const notif of notifications.filter((n) => !n.isRead)) {
      try {
        await apiClient(`/notifications/${notif.id}/read`, { method: 'PATCH' });
      } catch {
        // ignore
      }
    }
  };

  const handleClear = () => {
    setNotifications([]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link
            href="/customer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              color: '#64748b',
            }}
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
              All Notifications
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              Updates on transport approvals, quarantine deadlines, and flight status.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
            Mark all read
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear}>
            Clear all
          </Button>
        </div>
      </div>

      {/* Notifications Container */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid var(--border-card)',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {notifications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            No notifications available.
          </div>
        ) : (
          notifications.map((notif) => (
            <div
              key={notif.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                padding: '16px',
                borderRadius: '12px',
                backgroundColor: notif.isRead ? '#fafcff' : '#f0f7ff',
                borderLeft: `4px solid ${
                  notif.type === 'CRITICAL' ? '#ef4444' : notif.type === 'SUCCESS' ? '#22c55e' : '#3b82f6'
                }`,
                border: '1px solid var(--border-light)',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-heading)', fontSize: '14px' }}>
                  {notif.title}
                </div>
                <div style={{ fontSize: '13.5px', color: 'var(--text-body)', marginTop: '4px' }}>
                  {notif.message}
                </div>
                {notif.actionUrl ? (
                  <Link
                    href={notif.actionUrl}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      marginTop: '6px',
                      fontSize: '13px',
                      color: 'var(--primary)',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    {notif.actionText || 'Xem chi tiết'} →
                  </Link>
                ) : notif.actionText ? (
                  <button
                    onClick={() => setIsUploadOpen(true)}
                    style={{
                      marginTop: '6px',
                      fontSize: '13px',
                      color: notif.type === 'CRITICAL' ? '#dc2626' : 'var(--primary)',
                      fontWeight: 600,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {notif.actionText} →
                  </button>
                ) : null}
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>{notif.timeAgo}</div>
              </div>

              {!notif.isRead && (
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: '999px',
                    fontSize: '11px',
                    fontWeight: 700,
                    backgroundColor: '#dbeafe',
                    color: '#1d4ed8',
                  }}
                >
                  NEW
                </span>
              )}
            </div>
          ))
        )}
      </div>

      <DocumentUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={() => setIsUploadOpen(false)}
      />
    </div>
  );
}
