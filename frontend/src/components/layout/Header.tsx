'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, ChevronDown, Search, LogOut, Check, ExternalLink } from 'lucide-react';
import { getCurrentUser, clearAuthSession } from '@/lib/auth';
import { mockNotifications } from '@/lib/mock-data';
import Link from 'next/link';

interface HeaderProps {
  title?: string;
  subtitle?: string;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'Dashboard',
  subtitle = 'Overview of your racehorse transportation activities.',
}) => {
  const router = useRouter();
  const user = getCurrentUser();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [notifications, setNotifications] = useState(mockNotifications);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const handleLogout = () => {
    setShowUserMenu(false);
    clearAuthSession();
    router.push('/login');
  };

  return (
    <header
      style={{
        height: '76px',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Title & Subtitle */}
      <div>
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 800,
            color: '#0f172a',
            letterSpacing: '-0.02em',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {title}
        </h1>
        <p
          style={{
            fontSize: '13px',
            color: '#64748b',
            marginTop: '2px',
            marginBottom: 0,
          }}
        >
          {subtitle}
        </p>
      </div>

      {/* Right Controls: Search Bar + Notifications + User Profile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Search Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '7px 12px',
            width: '260px',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
          }}
        >
          <Search size={16} color="#94a3b8" style={{ marginRight: '8px', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search requests, horses, do..."
            style={{
              border: 'none',
              outline: 'none',
              fontSize: '13px',
              color: '#0f172a',
              width: '100%',
              backgroundColor: 'transparent',
            }}
          />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#94a3b8',
              backgroundColor: '#f1f5f9',
              padding: '2px 6px',
              borderRadius: '4px',
              border: '1px solid #e2e8f0',
              flexShrink: 0,
            }}
          >
            ⌘K
          </span>
        </div>

        {/* Notification Bell Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowUserMenu(false);
            }}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#475569',
              backgroundColor: showNotifications ? '#f8fafc' : '#ffffff',
              position: 'relative',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
            }}
            aria-label="Notifications"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: '#ef4444',
                  boxShadow: '0 0 0 2px #ffffff',
                }}
              />
            )}
          </button>

          {/* Notifications Flyout */}
          {showNotifications && (
            <div
              style={{
                position: 'absolute',
                top: '48px',
                right: 0,
                width: '340px',
                backgroundColor: '#ffffff',
                borderRadius: '14px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 12px 30px rgba(0, 0, 0, 0.12)',
                zIndex: 100,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid #f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                  Notifications ({unreadCount})
                </div>
                <button
                  onClick={handleMarkAllRead}
                  style={{ fontSize: '12px', color: '#2563eb', fontWeight: 600, cursor: 'pointer' }}
                >
                  Mark all read
                </button>
              </div>

              <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                {notifications.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid #f8fafc',
                      backgroundColor: item.isRead ? '#ffffff' : '#f8fafc',
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>{item.title}</div>
                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>{item.timeAgo}</div>
                  </div>
                ))}
              </div>

              <Link
                href="/customer/notifications"
                onClick={() => setShowNotifications(false)}
                style={{
                  display: 'block',
                  textAlign: 'center',
                  padding: '10px',
                  fontSize: '12.5px',
                  color: '#2563eb',
                  fontWeight: 600,
                  textDecoration: 'none',
                  borderTop: '1px solid #f1f5f9',
                  backgroundColor: '#fafbfc',
                }}
              >
                View all notifications
              </Link>
            </div>
          )}
        </div>

        {/* User Profile Button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setShowUserMenu(!showUserMenu);
              setShowNotifications(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '4px 8px 4px 4px',
              borderRadius: '999px',
              border: '1px solid #e2e8f0',
              backgroundColor: '#ffffff',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '12px',
              }}
            >
              {user.initials}
            </div>
            <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{user.name}</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Customer</div>
            </div>
            <ChevronDown size={14} color="#64748b" style={{ marginLeft: '4px' }} />
          </button>

          {/* User Menu Dropdown */}
          {showUserMenu && (
            <div
              style={{
                position: 'absolute',
                top: '46px',
                right: 0,
                width: '180px',
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
                padding: '6px',
                zIndex: 100,
              }}
            >
              <button
                onClick={handleLogout}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: '#ef4444',
                  cursor: 'pointer',
                  border: 'none',
                  background: 'none',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#fef2f2')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')}
              >
                <LogOut size={15} />
                <span>Log out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
