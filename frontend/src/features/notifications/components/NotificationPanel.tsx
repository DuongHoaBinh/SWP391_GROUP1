'use client';

import React from 'react';
import { Bell, Plane, Check, AlertCircle } from 'lucide-react';
import { NotificationItem } from '@/lib/types';

interface NotificationPanelProps {
  notifications: NotificationItem[];
  onMarkAllAsRead: () => void;
  onActionClick?: (notification: NotificationItem) => void;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({
  notifications,
  onMarkAllAsRead,
  onActionClick,
}) => {
  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        border: '1px solid var(--border-card)',
        padding: '24px',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#64748b', display: 'flex', alignItems: 'center' }}>
            <Bell size={18} />
          </span>
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--text-heading)',
              margin: 0,
            }}
          >
            Notifications
          </h3>
        </div>

        <button
          onClick={onMarkAllAsRead}
          style={{
            fontSize: '12.5px',
            color: 'var(--text-muted)',
            fontWeight: 500,
            transition: 'color 0.15s ease',
          }}
        >
          Mark all as read
        </button>
      </div>

      {/* Notifications List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
        {notifications.map((notif) => {
          const isCritical = notif.type === 'CRITICAL';
          const isInfo = notif.type === 'INFO';
          const isSuccess = notif.type === 'SUCCESS';

          const borderLeftColor = isCritical
            ? '#ef4444'
            : isInfo
            ? '#3b82f6'
            : '#22c55e';

          return (
            <div
              key={notif.id}
              style={{
                display: 'flex',
                gap: '14px',
                borderLeft: `4px solid ${borderLeftColor}`,
                paddingLeft: '14px',
                paddingTop: '2px',
                paddingBottom: '2px',
              }}
            >
              {/* Icon Circle */}
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: isCritical
                    ? '#fee2e2'
                    : isInfo
                    ? '#eff6ff'
                    : '#dcfce7',
                  color: isCritical
                    ? '#ef4444'
                    : isInfo
                    ? '#2563eb'
                    : '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                {isCritical && <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444' }} />}
                {isInfo && <Plane size={15} style={{ transform: 'rotate(45deg)' }} />}
                {isSuccess && <Check size={16} strokeWidth={2.5} />}
              </div>

              {/* Text Body */}
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    fontSize: '13.5px',
                    color: 'var(--text-heading)',
                    lineHeight: 1.4,
                    margin: 0,
                    fontWeight: 500,
                  }}
                >
                  {notif.message}
                </p>

                {/* Optional Action Link */}
                {notif.actionText && (
                  <button
                    onClick={() => onActionClick && onActionClick(notif)}
                    style={{
                      fontSize: '13px',
                      color: isCritical ? '#dc2626' : 'var(--primary)',
                      fontWeight: 600,
                      marginTop: '4px',
                      display: 'inline-block',
                      textAlign: 'left',
                    }}
                  >
                    {notif.actionText}
                  </button>
                )}

                {/* Timestamp */}
                <div
                  style={{
                    fontSize: '12px',
                    color: '#94a3b8',
                    marginTop: '4px',
                  }}
                >
                  {notif.timeAgo}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
