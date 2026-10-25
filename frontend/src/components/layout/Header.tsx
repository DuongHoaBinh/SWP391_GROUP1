'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, ChevronDown, Search, LogOut, Check, ExternalLink, Settings, Menu } from 'lucide-react';
import { getCurrentUser, clearAuthSession } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { UserProfile, NotificationItem } from '@/lib/types';
import Link from 'next/link';
import { LogoutConfirmModal } from './LogoutConfirmModal';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useLanguage } from '@/lib/i18n/LanguageContext';

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
  const { t } = useLanguage();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [searchValue, setSearchValue] = useState('');

  const fetchNotifications = async () => {
    try {
      const data = await apiClient<any[]>('/notifications');
      if (Array.isArray(data)) {
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
        setNotifications([]);
      }
    } catch {
      setNotifications([]);
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
    window.addEventListener('notifications-updated', fetchNotifications);
    return () => {
      window.removeEventListener('auth-user-updated', handleUserUpdate);
      window.removeEventListener('notifications-updated', fetchNotifications);
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await apiClient('/notifications/read-all', { method: 'PATCH' });
      window.dispatchEvent(new CustomEvent('notifications-updated'));
    } catch {
      // ignore
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
    <header className="min-h-[76px] flex-wrap gap-2 px-4 py-3 sm:flex-nowrap sm:px-8"
      style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
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
          <p className="hidden sm:block"
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
      <div className="flex items-center gap-2 sm:gap-4">
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
            placeholder={t('common.search', 'Search requests, horses...')}
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

        {/* Language Switcher */}
        <LanguageSwitcher variant="pill" />

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
                  {t('common.notifications', 'Notifications')} ({unreadCount})
                </div>
                <button
                  onClick={handleMarkAllRead}
                  style={{ fontSize: '12px', color: '#2563eb', fontWeight: 600, cursor: 'pointer' }}
                >
                  {t('common.markAllRead', 'Mark all read')}
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
                {t('common.viewDetails', 'View all notifications')}
              </Link>
            </div>
          )}
        </div>

        {/* User Profile Button */}
        <div style={{ position: 'relative' }}>
          <button aria-label={currentUser?.name ? `Tài khoản: ${currentUser.name}` : 'Tài khoản'}
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
              {currentUser?.initials || 'CU'}
            </div>
            <div className="hidden sm:block" style={{ textAlign: 'left', lineHeight: 1.2, maxWidth: '140px', overflow: 'hidden' }}>
              <div
                suppressHydrationWarning
                style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}
              >
                {currentUser?.name || currentUser?.email || 'Đang tải tài khoản'}
              </div>
              <div
                suppressHydrationWarning
                style={{ fontSize: '11px', color: '#64748b' }}
              >
                {currentUser?.role === 'CUSTOMER' ? 'Customer' : currentUser?.role}
              </div>
            </div>
            <ChevronDown className="hidden sm:block" size={14} color="#64748b" style={{ marginLeft: '4px' }} />
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
                <span>{t('common.settings', 'Profile Settings')}</span>
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
                  borderTop: '1px solid #f1f5f9',
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = '#fef2f2')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')}
              >
                <LogOut size={15} />
                <span>{t('common.logout', 'Log out')}</span>
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
