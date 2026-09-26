'use client';

import React, { useState } from 'react';
import { Bell, ChevronDown, Check, ExternalLink } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { mockNotifications } from '@/lib/mock-data';
import Link from 'next/link';

interface HeaderProps {
  title?: string;
  subtitle?: string;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'Dashboard',
  subtitle = "Welcome back. Here's an overview of your transportation activities.",
}) => {
  const user = getCurrentUser();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [notifications, setNotifications] = useState(mockNotifications);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  return (
    <header
      style={{
        height: '84px',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid var(--border-light)',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      {/* Title & Subtitle */}
      <div>
        <h2
          style={{
            fontSize: '24px',
            fontWeight: 800,
            color: 'var(--text-heading)',
            letterSpacing: '-0.02em',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontSize: '13.5px',
            color: 'var(--text-muted)',
            marginTop: '3px',
            marginBottom: 0,
          }}
        >
          {subtitle}
        </p>
      </div>

      {/* Right Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {/* Notification Bell Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowUserMenu(false);
            }}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b',
              backgroundColor: showNotifications ? '#f1f5f9' : '#ffffff',
              position: 'relative',
              transition: 'all 0.15s ease',
            }}
            aria-label="Notifications"
          >
            <Bell size={19} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  width: '8px',
                  height: '8px',
                  backgroundColor: '#ef4444',
                  borderRadius: '50%',
                  border: '1.5px solid #ffffff',
                }}
              />
            )}
          </button>

          {/* Notifications Popover */}
          {showNotifications && (
            <div
              style={{
                position: 'absolute',
                top: '48px',
                right: 0,
                width: '340px',
                backgroundColor: '#ffffff',
                borderRadius: '14px',
                border: '1px solid var(--border-card)',
                boxShadow: 'var(--shadow-popup)',
                padding: '16px',
                zIndex: 100,
                animation: 'fadeIn 0.15s ease-out',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: '12px',
                  borderBottom: '1px solid var(--border-light)',
                  marginBottom: '10px',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: '14px' }}>Notifications</span>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    style={{
                      fontSize: '12px',
                      color: 'var(--primary)',
                      fontWeight: 600,
                    }}
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      padding: '10px',
                      borderRadius: '8px',
                      backgroundColor: n.isRead ? '#fafcff' : '#f0f7ff',
                      borderLeft: `3px solid ${n.type === 'CRITICAL' ? '#ef4444' : n.type === 'SUCCESS' ? '#22c55e' : '#3b82f6'}`,
                      fontSize: '12.5px',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--text-heading)' }}>{n.title}</div>
                    <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>{n.message}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{n.timeAgo}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '12px', textAlign: 'center', borderTop: '1px solid var(--border-light)', paddingTop: '8px' }}>
                <Link
                  href="/customer/notifications"
                  onClick={() => setShowNotifications(false)}
                  style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 600 }}
                >
                  View all notifications →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User Pill Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setShowUserMenu(!showUserMenu);
              setShowNotifications(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '6px 10px',
              borderRadius: '12px',
              border: '1px solid transparent',
              transition: 'background-color 0.15s ease',
            }}
          >
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: 'var(--text-heading)',
                  lineHeight: 1.2,
                }}
              >
                {user.name}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  fontWeight: 500,
                }}
              >
                {user.organization || 'Al Fares Stud'}
              </div>
            </div>

            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                backgroundColor: '#e2e8f0',
                color: '#334155',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '13px',
              }}
            >
              {user.initials}
            </div>

            <ChevronDown size={16} color="#64748b" />
          </button>

          {/* User Menu Popover */}
          {showUserMenu && (
            <div
              style={{
                position: 'absolute',
                top: '50px',
                right: 0,
                width: '200px',
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                border: '1px solid var(--border-card)',
                boxShadow: 'var(--shadow-popup)',
                padding: '8px',
                zIndex: 100,
                animation: 'fadeIn 0.15s ease-out',
              }}
            >
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Signed in as</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)' }}>
                  {user.email}
                </div>
              </div>
              <Link
                href="/customer/horses"
                onClick={() => setShowUserMenu(false)}
                style={{
                  display: 'block',
                  padding: '8px 12px',
                  fontSize: '13px',
                  color: 'var(--text-body)',
                  borderRadius: '6px',
                }}
              >
                My Horses
              </Link>
              <Link
                href="/customer/documents"
                onClick={() => setShowUserMenu(false)}
                style={{
                  display: 'block',
                  padding: '8px 12px',
                  fontSize: '13px',
                  color: 'var(--text-body)',
                  borderRadius: '6px',
                }}
              >
                Document Sets
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
