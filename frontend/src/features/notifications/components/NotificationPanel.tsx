'use client';

import React from 'react';
import { Bell, Plane, Check } from 'lucide-react';
import { NotificationItem } from '@/lib/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';

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
  const { t, translateNotification, translateTimeAgo } = useLanguage();

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '14px',
        border: '1px solid #D8CEBE',
        padding: '24px',
        boxShadow: '0 4px 16px rgba(24, 26, 23, 0.04)',
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
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '20px',
          paddingBottom: '12px',
          borderBottom: '1px solid #E8E2D8',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#B49A68', display: 'flex', alignItems: 'center' }} aria-hidden="true">
            <Bell size={18} />
          </span>
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: '#181A17',
              margin: 0,
            }}
          >
            {t('common.notifications', 'Thông báo')}
          </h3>
        </div>

        <button
          type="button"
          onClick={onMarkAllAsRead}
          style={{
            fontSize: '12.5px',
            color: '#A67C2E',
            fontWeight: 600,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 6px',
            transition: 'color 0.15s ease',
          }}
        >
          {t('common.markAllRead', 'Đánh dấu tất cả đã đọc')}
        </button>
      </div>

      {/* Notifications List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
        {notifications.length === 0 ? (
          <div style={{ padding: '24px 8px', textAlign: 'center', fontSize: '13px', color: '#5F6977' }}>
            {t('notifications.empty', 'Không có thông báo mới nào')}
          </div>
        ) : notifications.map((notif) => {
          const isCritical = notif.type === 'CRITICAL';
          const isInfo = notif.type === 'INFO';

          const borderLeftColor = isCritical
            ? '#B33E3E'
            : isInfo
            ? '#A67C2E'
            : '#287653';

          const localized = translateNotification(notif.title, notif.message);
          const actionText = notif.actionText ? (localized.actionText || notif.actionText) : localized.actionText;
          const timeAgoText = translateTimeAgo ? translateTimeAgo((notif as any).createdAt || notif.timeAgo) : notif.timeAgo;

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
                    ? '#F8EAEA'
                    : isInfo
                    ? '#FAF8F4'
                    : '#E8F2EB',
                  color: isCritical
                    ? '#B33E3E'
                    : isInfo
                    ? '#A67C2E'
                    : '#287653',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                {isCritical && <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#B33E3E' }} />}
                {isInfo && <Plane size={15} style={{ transform: 'rotate(45deg)' }} />}
                {!isCritical && !isInfo && <Check size={16} strokeWidth={2.5} />}
              </div>

              {/* Text Body */}
              <div style={{ flex: 1 }}>
                {localized.title && (
                  <h4 style={{ fontSize: '13.5px', fontWeight: 700, margin: '0 0 2px 0', color: '#181A17' }}>
                    {localized.title}
                  </h4>
                )}
                <p
                  style={{
                    fontSize: '13px',
                    color: '#5B6779',
                    lineHeight: 1.45,
                    margin: 0,
                    fontWeight: 500,
                  }}
                >
                  {localized.message}
                </p>

                {/* Optional Action Link */}
                {actionText && (
                  <button
                    type="button"
                    onClick={() => onActionClick && onActionClick(notif)}
                    style={{
                      fontSize: '12.5px',
                      color: isCritical ? '#B33E3E' : '#A67C2E',
                      fontWeight: 600,
                      marginTop: '4px',
                      display: 'inline-block',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                    }}
                  >
                    {actionText}
                  </button>
                )}

                {/* Timestamp */}
                <div
                  style={{
                    fontSize: '11.5px',
                    color: '#5F6977',
                    marginTop: '4px',
                  }}
                >
                  {timeAgoText}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
