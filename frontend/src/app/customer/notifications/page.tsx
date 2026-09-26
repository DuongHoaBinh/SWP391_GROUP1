'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { mockNotifications } from '@/lib/mock-data';
import { NotificationItem } from '@/lib/types';
import { DocumentUploadModal } from '@/features/documents/components/DocumentUploadModal';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>(mockNotifications);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
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
                {notif.actionText && (
                  <button
                    onClick={() => setIsUploadOpen(true)}
                    style={{
                      marginTop: '6px',
                      fontSize: '13px',
                      color: notif.type === 'CRITICAL' ? '#dc2626' : 'var(--primary)',
                      fontWeight: 600,
                    }}
                  >
                    {notif.actionText} →
                  </button>
                )}
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
