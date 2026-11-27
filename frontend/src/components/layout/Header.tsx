'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Bell, ChevronDown, Search, LogOut, Settings, Menu } from 'lucide-react';
import { getCurrentUser, logout } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { UserProfile, NotificationItem } from '@/lib/types';
import { LogoutConfirmModal } from './LogoutConfirmModal';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { CommandPalette } from '@/components/ui/CommandPalette';

const defaultHeaderUser: UserProfile = {
  id: '',
  name: 'User',
  email: '',
  role: 'CUSTOMER',
  initials: 'U',
};

function formatHeaderTimeAgo(dateStr: string, isEn: boolean) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 1) return isEn ? 'Just now' : 'Vừa xong';
  if (diffMins < 60) return isEn ? `${diffMins}m ago` : `${diffMins} phút trước`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return isEn ? `${diffHours}h ago` : `${diffHours} giờ trước`;
  const diffDays = Math.floor(diffHours / 24);
  return isEn ? `${diffDays}d ago` : `${diffDays} ngày trước`;
}

function getBreadcrumbTitle(
  pathname: string,
  t: (key: string, fb?: string) => string,
  isEn: boolean
): string {
  if (!pathname || pathname === '/customer' || pathname === '/customer/') return isEn ? 'Overview' : 'Tổng quan';
  if (pathname.startsWith('/customer/requests/new')) return isEn ? 'New Transport Order' : 'Tạo đơn mới';
  if (pathname.includes('/invoice')) return isEn ? 'Electronic Invoice' : 'Hóa đơn điện tử';
  if (pathname.includes('/refund')) return isEn ? 'Refund Request' : 'Yêu cầu hoàn tiền';
  if (pathname.includes('/payment')) return isEn ? 'Freight Payment' : 'Thanh toán cước';
  if (pathname.startsWith('/customer/requests/')) return isEn ? 'Order Details' : 'Chi tiết đơn vận chuyển';
  if (pathname.startsWith('/customer/requests')) return isEn ? 'Transport Orders' : 'Đơn vận chuyển';
  if (pathname.startsWith('/customer/reports')) return isEn ? 'Reports & Statements' : 'Báo cáo & Sao kê';
  if (pathname.startsWith('/customer/horses/')) return isEn ? 'Racehorse Profile' : 'Hồ sơ ngựa đua';
  if (pathname.startsWith('/customer/horses')) return isEn ? 'Racehorse Stable' : 'Quản lý ngựa đua';
  if (pathname.startsWith('/customer/tracking')) return isEn ? 'Live Tracking' : 'Theo dõi hành trình';
  if (pathname.startsWith('/customer/documents')) return isEn ? 'Documents & Quarantine' : 'Hồ sơ & Kiểm dịch';
  if (pathname.startsWith('/customer/notifications')) return t('common.notifications', isEn ? 'Notifications' : 'Thông báo');
  if (pathname.startsWith('/customer/settings')) return t('common.settings', isEn ? 'Account Settings' : 'Cài đặt');
  return isEn ? 'Overview' : 'Tổng quan';
}

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onMenuClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ title, onMenuClick }) => {
  const router = useRouter();
  const pathname = usePathname();
  const { t, language, translateRole, translateNotification, translateTimeAgo } = useLanguage();
  const isEn = language === 'en';
  const dynamicTitle = getBreadcrumbTitle(pathname || '', t, isEn);
  const displayTitle = title || dynamicTitle;

  const [currentUser, setCurrentUser] = useState<UserProfile>(defaultHeaderUser);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowNotifications(false);
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await apiClient<
        Array<{
          id: string | number;
          notifType?: string;
          title: string;
          message: string;
          createdAt?: string;
          isRead?: boolean;
          shipmentId?: number | string;
        }>
      >('/notifications');
      if (Array.isArray(data)) {
        const mapped: NotificationItem[] = data.map((item) => ({
          id: String(item.id),
          type: item.notifType === 'health_alert' ? 'CRITICAL' : 'INFO',
          title: item.title,
          message: item.message,
          timeAgo: item.createdAt
            ? translateTimeAgo(item.createdAt) || formatHeaderTimeAgo(item.createdAt, isEn)
            : '',
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
  }, [translateTimeAgo, isEn]);

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
  }, [fetchNotifications]);

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

  const handleNotificationClick = async (item: NotificationItem) => {
    if (!item.isRead) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
      );
      try {
        await apiClient(`/notifications/${item.id}/read`, { method: 'PATCH' });
        window.dispatchEvent(new CustomEvent('notifications-updated'));
      } catch {
        // ignore
      }
    }
    setShowNotifications(false);
    if (item.actionUrl) {
      router.push(item.actionUrl);
    }
  };

  const handleLogoutClick = () => {
    setShowUserMenu(false);
    setShowLogoutModal(true);
  };

  const handleConfirmLogout = () => {
    setShowLogoutModal(false);
    logout();
  };

  return (
    <header
      className="liquid-glass-header h-[60px] px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-3 sticky top-0 z-30"
    >
      {/* Title / Breadcrumb */}
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl border border-border text-text-secondary hover:bg-surface-muted transition-colors shrink-0 cursor-pointer"
            aria-label={t('nav.openMenu', isEn ? 'Open navigation menu' : 'Mở thanh điều hướng')}
          >
            <Menu size={18} aria-hidden="true" />
          </button>
        )}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link
            href="/customer"
            className="text-xs font-semibold text-text-muted hover:text-primary transition-colors hidden md:inline shrink-0"
          >
            {t('role.customer', isEn ? 'Customer Portal' : 'Cổng Khách Hàng')}
          </Link>
          <span className="text-xs text-border hidden md:inline" aria-hidden="true">/</span>
          <p className="text-[13.5px] sm:text-[15px] font-bold text-text-primary m-0 truncate tracking-tight">
            {displayTitle}
          </p>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {/* Mobile Quick Search Icon */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
          className="sm:hidden flex items-center justify-center w-8 h-8 rounded-lg bg-surface-muted/70 border border-border text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          aria-label={t('palette.search', isEn ? 'Quick search' : 'Tìm kiếm nhanh')}
        >
          <Search size={15} aria-hidden="true" />
        </button>

        {/* Desktop Command Palette Trigger */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
          className="hidden sm:flex items-center bg-surface-muted/70 hover:bg-surface border border-border hover:border-primary/50 rounded-xl px-3 py-1.5 w-[170px] md:w-[210px] xl:w-[250px] shadow-sm transition-all duration-150 cursor-pointer text-left group"
          title="Ctrl+K / ⌘K"
        >
          <Search size={14} aria-hidden="true" className="text-text-muted group-hover:text-primary transition-colors mr-2 shrink-0" />
          <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors flex-1 truncate font-medium">
            {t('common.search', 'Tìm kiếm nhanh...')}
          </span>
          <kbd className="kbd-badge shrink-0 ml-1" aria-hidden="true">⌘K</kbd>
        </button>

        {/* Language Switcher (hide on narrow mobile to preserve header title space; still available in Settings/tablet+) */}
        <div className="hidden sm:block">
          <LanguageSwitcher />
        </div>

        {/* Notifications Dropdown */}
        <div className="relative" ref={notificationsRef}>
          <button
            type="button"
            aria-expanded={showNotifications}
            aria-haspopup="true"
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowUserMenu(false);
            }}
            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center border transition-colors cursor-pointer relative ${
              showNotifications
                ? 'bg-surface-muted border-border text-text-primary'
                : 'bg-surface border-transparent hover:bg-surface-muted hover:border-border text-text-secondary'
            }`}
            aria-label={
              unreadCount > 0
                ? `${t('common.notifications', 'Thông báo')} (${unreadCount})`
                : t('common.notifications', 'Thông báo')
            }
          >
            <Bell size={17} aria-hidden="true" />
            {unreadCount > 0 && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: '5px',
                  right: '5px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#B33E3E',
                  boxShadow: '0 0 0 2px #ffffff',
                }}
              />
            )}
          </button>

          {showNotifications && (
            <div
              className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-[64px] sm:top-[calc(100%+8px)] sm:w-[360px] bg-white rounded-[14px] border border-[#D8CEBE] z-50 overflow-hidden"
              style={{
                boxShadow: '0 12px 30px rgba(24, 26, 23, 0.14)',
              }}
            >
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #E8E2D8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#F0EEE8',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#273244' }}>
                    {t('common.notifications', 'Thông báo')}
                  </span>
                  {unreadCount > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary-subtle text-primary">
                      {unreadCount}
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-xs text-primary font-semibold hover:underline cursor-pointer"
                  >
                    {t('common.markAllRead', 'Đánh dấu đã đọc')}
                  </button>
                )}
              </div>

              <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: '#747D88', fontSize: '13px' }}>
                    {t('notifications.empty', isEn ? 'No new notifications' : 'Không có thông báo mới nào')}
                  </div>
                ) : (
                  notifications.slice(0, 6).map((item) => {
                    const tr = translateNotification(item.title, item.message);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => void handleNotificationClick(item)}
                        className={`w-full text-left px-4 py-3 border-b border-[#E8E2D8] transition-colors flex items-start gap-2.5 cursor-pointer ${
                          item.isRead ? 'bg-white hover:bg-[#F0EEE8]/60' : 'bg-[#F4F1E9] hover:bg-[#EFE9DC]'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: item.isRead ? 'transparent' : '#A67C2E',
                            marginTop: '5px',
                            flexShrink: 0,
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p
                            style={{
                              fontSize: '12.5px',
                              fontWeight: item.isRead ? 600 : 700,
                              color: '#273244',
                              margin: 0,
                            }}
                          >
                            {tr.title}
                          </p>
                          <p
                            style={{
                              fontSize: '11.5px',
                              color: '#5F6977',
                              margin: '2px 0 0 0',
                              lineHeight: 1.4,
                            }}
                          >
                            {tr.message}
                          </p>
                          {item.timeAgo && (
                            <span style={{ fontSize: '10.5px', color: '#747D88', display: 'block', marginTop: '4px' }}>
                              {item.timeAgo}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="px-4 py-2.5 bg-surface-muted border-t border-border-subtle text-center">
                <Link
                  href="/customer/notifications"
                  onClick={() => setShowNotifications(false)}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  {t('common.viewAllNotifications', 'Xem tất cả thông báo')} →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Dropdown */}
        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            aria-expanded={showUserMenu}
            aria-haspopup="menu"
            aria-label={`${currentUser.name} (${translateRole(currentUser.role)})`}
            onClick={() => {
              setShowUserMenu(!showUserMenu);
              setShowNotifications(false);
            }}
            className={`flex items-center gap-1.5 sm:gap-2 py-1 pl-1 pr-1 sm:pr-2 rounded-xl border transition-all cursor-pointer ${
              showUserMenu ? 'bg-surface-muted border-border' : 'border-transparent hover:bg-surface-muted'
            }`}
          >
            <div
              aria-hidden="true"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '9px',
                background: 'linear-gradient(135deg, #181A17 0%, #A67C2E 100%)',
                color: '#F7F7F4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 700,
                border: '1px solid rgba(180, 154, 104, 0.45)',
                flexShrink: 0,
              }}
            >
              {currentUser.initials}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-bold text-text-primary m-0 max-w-[120px] truncate">
                {currentUser.name}
              </p>
              <p className="text-[10px] text-text-muted m-0">
                {translateRole(currentUser.role)}
              </p>
            </div>
            <ChevronDown size={14} className="hidden sm:block text-text-muted" aria-hidden="true" />
          </button>

          {showUserMenu && (
            <div
              role="menu"
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: '230px',
                backgroundColor: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #D8CEBE',
                boxShadow: '0 12px 30px rgba(24, 26, 23, 0.14)',
                zIndex: 50,
                overflow: 'hidden',
                padding: '6px',
              }}
            >
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #E8E2D8' }}>
                <p className="text-xs font-bold text-text-primary m-0 truncate">
                  {currentUser.name}
                </p>
                <p className="text-[11px] text-text-muted m-0 mt-0.5 truncate">
                  {currentUser.email}
                </p>
              </div>

              <div className="sm:hidden px-3 py-2 border-b border-[#E8E2D8] flex items-center justify-between">
                <span className="text-[11px] font-semibold text-text-muted">
                  {isEn ? 'Language' : 'Ngôn ngữ'}
                </span>
                <LanguageSwitcher />
              </div>

              <div className="py-1">
                <Link
                  role="menuitem"
                  href="/customer/settings"
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-text-primary hover:bg-surface-muted transition-colors"
                >
                  <Settings size={15} className="text-text-secondary" aria-hidden="true" />
                  <span>{t('common.settings', 'Cài đặt tài khoản')}</span>
                </Link>

                <button
                  role="menuitem"
                  type="button"
                  onClick={handleLogoutClick}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-semibold text-danger hover:bg-danger-bg transition-colors text-left cursor-pointer"
                >
                  <LogOut size={15} aria-hidden="true" />
                  <span>{t('common.logout', 'Đăng xuất')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Global Spotlight Palette Modal */}
      <CommandPalette />

      {/* Logout Confirmation Modal */}
      <LogoutConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleConfirmLogout}
      />
    </header>
  );
};
