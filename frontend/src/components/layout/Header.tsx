'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, ChevronDown, Search, LogOut, Check, ExternalLink, Settings, Menu } from 'lucide-react';
import { getCurrentUser, clearAuthSession } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { mockCurrentUser, mockNotifications } from '@/lib/mock-data';
import { UserProfile, NotificationItem } from '@/lib/types';
import Link from 'next/link';
import { LogoutConfirmModal } from './LogoutConfirmModal';

function formatHeaderTimeAgo(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onMenuClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'Dashboard',
  subtitle = 'Overview of your racehorse transportation activities.',
  onMenuClick,
}) => {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserProfile>(mockCurrentUser);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [searchValue, setSearchValue] = useState('');

  const fetchNotifications = async () => {
    try {
      const data = await apiClient<any[]>('/notifications');
      if (Array.isArray(data) && data.length > 0) {
        const mapped: NotificationItem[] = data.map((item) => ({
          id: String(item.id),
          type: item.notifType === 'health_alert' ? 'CRITICAL' : 'INFO',
          title: item.title,
          message: item.message,
          timeAgo: item.createdAt ? formatHeaderTimeAgo(item.createdAt) : 'Recently',
          isRead: Boolean(item.isRead),
          relatedRequestCode: item.shipmentId ? `REQ-${String(item.shipmentId).padStart(3, '0')}` : undefined,
          actionUrl: item.shipmentId ? `/customer/requests/${item.shipmentId}` : undefined,
        }));
        setNotifications(mapped);
      } else {
        setNotifications(mockNotifications);
      }
    } catch {
      setNotifications(mockNotifications);
    }
  };

  useEffect(() => {
    setCurrentUser(getCurrentUser());
    fetchNotifications();

    const handleUserUpdate = () => {
      setCurrentUser(getCurrentUser());
      fetchNotifications();
    };
    window.addEventListener('auth-user-updated', handleUserUpdate);
    return () => {
      window.removeEventListener('auth-user-updated', handleUserUpdate);
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

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

  const handleLogoutClick = () => {
    setShowUserMenu(false);
    setShowLogoutModal(true);
  };

  const handleConfirmLogout = () => {
    setShowLogoutModal(false);
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>
        )}
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
      </div>

      {/* Right Controls: Search Bar + Notifications + User Profile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Search Bar */}
        <div
          className="hidden sm:flex"
          style={{
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
            placeholder="Search requests, horses..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchValue.trim()) {
                router.push(`/customer/requests?search=${encodeURIComponent(searchValue.trim())}`);
              }
            }}
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
              suppressHydrationWarning
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
              {currentUser.initials || 'CU'}
            </div>
            <div style={{ textAlign: 'left', lineHeight: 1.2, maxWidth: '140px', overflow: 'hidden' }}>
              <div
                suppressHydrationWarning
                style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}
              >
                {currentUser.name || currentUser.email}
              </div>
              <div
                suppressHydrationWarning
                style={{ fontSize: '11px', color: '#64748b' }}
              >
                {currentUser.role === 'CUSTOMER' ? 'Customer' : currentUser.role}
              </div>
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
              <Link
                href="/customer/settings"
                onClick={() => setShowUserMenu(false)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: '#334155',
                  textDecoration: 'none',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#f1f5f9')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')}
              >
                <Settings size={15} />
                <span>Profile Settings</span>
              </Link>
              <button
                onClick={handleLogoutClick}
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
      <LogoutConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleConfirmLogout}
      />
    </header>
  );
};
