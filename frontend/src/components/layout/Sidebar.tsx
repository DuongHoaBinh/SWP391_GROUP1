'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Truck,
  FolderClosed,
  Navigation,
  Bell,
  Plus,
  Settings,
  LogOut,
  X,
  Pin,
  PinOff,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { logout } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { LogoutConfirmModal } from './LogoutConfirmModal';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
}

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen = false, onClose }) => {
  const pathname = usePathname();
  const { t, language } = useLanguage();
  const isEn = language === 'en';
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    try {
      const saved =
        localStorage.getItem('equitransit_sidebar_pinned') ??
        localStorage.getItem('equiroute_sidebar_pinned');
      if (saved !== null) {
        setIsPinned(saved === 'true');
      }
    } catch {
      // ignore
    }

    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current?.();
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleEsc);
    };
  }, [mobileOpen]);

  const togglePin = () => {
    setIsPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('equitransit_sidebar_pinned', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleMouseEnter = () => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    if (!isPinned) {
      hoverTimeoutRef.current = setTimeout(() => {
        setIsHovered(true);
      }, 120);
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (!isPinned) {
      leaveTimeoutRef.current = setTimeout(() => {
        setIsHovered(false);
      }, 150);
    }
  };

  const isExpanded = isPinned || isHovered;

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const notifs = await apiClient<Array<{ isRead?: boolean }>>('/notifications');
        if (Array.isArray(notifs)) {
          setUnreadNotifs(notifs.filter((n) => !n.isRead).length);
        }
      } catch {
        // ignore
      }
    };
    fetchUnread();

    window.addEventListener('notifications-updated', fetchUnread);
    return () => {
      window.removeEventListener('notifications-updated', fetchUnread);
    };
  }, []);

  const navItems: NavItem[] = [
    {
      label: isEn ? 'Overview' : 'Tổng quan',
      href: '/customer',
      icon: <LayoutDashboard size={18} aria-hidden="true" />,
    },
    {
      label: isEn ? 'Transport Orders' : 'Đơn vận chuyển',
      href: '/customer/requests',
      icon: <Truck size={18} aria-hidden="true" />,
    },
    {
      label: isEn ? 'Racehorse Stable' : 'Quản lý ngựa đua',
      href: '/customer/horses',
      icon: (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M22 17v-1c0-4-3-7-7-7H9l-2-3H3l1 5-2 3v3h10" />
          <path d="M12 12v5" />
          <path d="M17 12v5" />
          <circle cx="8" cy="7" r="1" />
        </svg>
      ),
    },
    {
      label: isEn ? 'Documents & Quarantine' : 'Hồ sơ & Kiểm dịch',
      href: '/customer/documents',
      icon: <FolderClosed size={18} aria-hidden="true" />,
    },
    {
      label: isEn ? 'Live Tracking' : 'Theo dõi hành trình',
      href: '/customer/tracking',
      icon: <Navigation size={18} aria-hidden="true" />,
    },
  ];

  const managementItems: NavItem[] = [
    {
      label: t('common.notifications', isEn ? 'Notifications' : 'Thông báo'),
      href: '/customer/notifications',
      icon: <Bell size={18} aria-hidden="true" />,
      badge: unreadNotifs > 0 ? unreadNotifs : undefined,
    },
    {
      label: t('common.settings', isEn ? 'Account Settings' : 'Cài đặt'),
      href: '/customer/settings',
      icon: <Settings size={18} aria-hidden="true" />,
    },
  ];

  const isNavItemActive = (href: string) => {
    if (href === '/customer') return pathname === '/customer';
    if (href === '/customer/requests') {
      return Boolean(pathname?.startsWith('/customer/requests') || pathname?.startsWith('/customer/reports'));
    }
    return Boolean(pathname?.startsWith(href));
  };

  const handleConfirmLogout = () => {
    setShowLogoutModal(false);
    logout();
  };

  const pinLabel = isPinned
    ? t('sidebar.unpin', isEn ? 'Unpin sidebar' : 'Bỏ ghim thanh menu')
    : t('sidebar.pin', isEn ? 'Pin sidebar' : 'Ghim cố định thanh menu');

  const renderBrandHeader = (mobile = false) => (
    <div
      style={{
        padding: !mobile && !isExpanded ? '20px 10px' : '20px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: !mobile && !isExpanded ? 'center' : 'space-between',
        borderBottom: '1px solid #2C2F2A',
        flexDirection: !mobile && !isExpanded ? 'column' : 'row',
        gap: !mobile && !isExpanded ? '12px' : '0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        {mobile ? (
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '11px',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(180, 154, 104, 0.45)',
              backgroundColor: '#242722',
              flexShrink: 0,
            }}
          >
            <img src="/logo.png" alt="EquiTransit" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ) : (
          <button
            type="button"
            onClick={togglePin}
            title={pinLabel}
            aria-label={pinLabel}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B49A68] cursor-pointer"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '11px',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(180, 154, 104, 0.45)',
              backgroundColor: '#242722',
              flexShrink: 0,
              padding: 0,
            }}
          >
            <img src="/logo.png" alt="EquiTransit" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </button>
        )}

        {(mobile || isExpanded) && (
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#F7F7F4', lineHeight: 1.1 }}>
              EquiTransit
            </div>
          </div>
        )}
      </div>

      {mobile ? (
        <button
          type="button"
          onClick={onClose}
          className="p-2 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          aria-label={t('nav.closeMenu', isEn ? 'Close navigation menu' : 'Đóng thanh điều hướng')}
        >
          <X size={20} aria-hidden="true" />
        </button>
      ) : (
        isExpanded && (
          <button
            type="button"
            onClick={togglePin}
            className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all cursor-pointer ${
              isPinned
                ? 'bg-[#242722] text-[#B49A68] border border-[#B49A68]/50'
                : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
            title={pinLabel}
            aria-label={pinLabel}
            aria-pressed={isPinned}
          >
            {isPinned ? <Pin size={15} className="rotate-45 text-[#B49A68]" aria-hidden="true" /> : <PinOff size={15} aria-hidden="true" />}
          </button>
        )
      )}
    </div>
  );

  return (
    <>
      <LogoutConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleConfirmLogout}
      />

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            aria-hidden="true"
            className="fixed inset-0 bg-[#181A17]/65 backdrop-blur-sm animate-fade-in-only"
            onClick={onClose}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.mobileNav', isEn ? 'Mobile navigation' : 'Điều hướng di động')}
            style={{
              width: '268px',
              backgroundColor: '#181A17',
              color: '#94A3B8',
              display: 'flex',
              flexDirection: 'column',
              height: '100dvh',
              position: 'relative',
              zIndex: 51,
              borderRight: '1px solid #2C2F2A',
            }}
            className="animate-fade-in shadow-2xl"
          >
            {renderBrandHeader(true)}

            <div style={{ flex: 1, padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
              <Link
                href="/customer/requests/new"
                onClick={onClose}
                className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#B49A68] hover:bg-[#C6AD7B] text-[#181A17] text-[13.5px] font-extrabold shadow-sm transition-colors no-underline"
              >
                <Plus size={16} strokeWidth={2.75} aria-hidden="true" />
                <span>{isEn ? 'New Transport Order' : 'Tạo đơn mới'}</span>
              </Link>

              <div>
                <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.08em', color: '#B49A68', textTransform: 'uppercase', padding: '0 10px', marginBottom: '8px' }}>
                  {t('nav.navigation', 'Điều Hướng')}
                </div>
                <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {navItems.map((item) => {
                    const isActive = isNavItemActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        aria-current={isActive ? 'page' : undefined}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-[10px] text-[13.5px] transition-colors no-underline border-l-[3px] ${
                          isActive
                            ? 'font-bold text-[#F7F7F4] bg-[#B49A68]/20 border-[#B49A68]'
                            : 'font-medium text-slate-300 border-transparent hover:bg-[#242722] hover:text-[#F7F7F4]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={isActive ? 'text-[#B49A68]' : 'text-slate-400'}>{item.icon}</span>
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge !== undefined && (
                          <span className="px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-[#B33E3E] text-white shrink-0">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </nav>
              </div>

              <div>
                <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.08em', color: '#B49A68', textTransform: 'uppercase', padding: '0 10px', marginBottom: '8px' }}>
                  {isEn ? 'Account' : 'Tài Khoản'}
                </div>
                <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {managementItems.map((item) => {
                    const isActive = pathname?.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        aria-current={isActive ? 'page' : undefined}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-[10px] text-[13.5px] transition-colors no-underline border-l-[3px] ${
                          isActive
                            ? 'font-bold text-[#F7F7F4] bg-[#B49A68]/20 border-[#B49A68]'
                            : 'font-medium text-slate-300 border-transparent hover:bg-[#242722] hover:text-[#F7F7F4]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={isActive ? 'text-[#B49A68]' : 'text-slate-400'}>{item.icon}</span>
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge !== undefined && (
                          <span className="px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-[#B33E3E] text-white shrink-0">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </nav>
              </div>

              <div style={{ marginTop: 'auto', paddingTop: '14px', borderTop: '1px solid #2C2F2A' }}>
                <button
                  type="button"
                  onClick={() => {
                    onClose?.();
                    setShowLogoutModal(true);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13.5px] font-semibold text-rose-300 bg-[#B33E3E]/15 border border-[#B33E3E]/30 hover:bg-[#B33E3E]/25 transition-colors cursor-pointer"
                >
                  <LogOut size={17} aria-hidden="true" />
                  <span>{t('common.logout', 'Đăng xuất')}</span>
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop Sidebar (never set inline display:flex so hidden md:flex hides it on mobile!) */}
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="hidden md:flex flex-col liquid-glass-sidebar shrink-0 no-scrollbar"
        style={{
          width: isExpanded ? '260px' : '76px',
          color: '#94A3B8',
          height: '100vh',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          overflowX: isExpanded ? 'hidden' : 'visible',
          transition: 'width 0.28s cubic-bezier(0.2, 0, 0, 1)',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {renderBrandHeader(false)}

        <div
          className="no-scrollbar"
          style={{
            flex: 1,
            padding: !isExpanded ? '16px 8px' : '16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: !isExpanded ? '14px' : '18px',
            overflowY: isExpanded ? 'auto' : 'visible',
            overflowX: isExpanded ? 'hidden' : 'visible',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {/* Fixed Primary CTA: + Tạo đơn mới */}
          {!isExpanded ? (
            <Link
              href="/customer/requests/new"
              aria-label={isEn ? 'New Transport Order' : 'Tạo đơn mới'}
              className="relative group flex items-center justify-center py-0.5 no-underline"
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-[#B49A68] text-[#181A17] hover:bg-[#C6AD7B] shadow-md transition-all">
                <Plus size={19} strokeWidth={2.75} aria-hidden="true" />
              </div>
              <div
                aria-hidden="true"
                className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-[#181A17] text-[#F7F7F4] text-xs font-bold whitespace-nowrap shadow-xl border border-[#2C2F2A] pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50"
              >
                {isEn ? '+ New Order' : '+ Tạo đơn mới'}
              </div>
            </Link>
          ) : (
            <Link
              href="/customer/requests/new"
              className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#B49A68] hover:bg-[#C6AD7B] text-[#181A17] text-[13.5px] font-extrabold shadow-sm transition-colors whitespace-nowrap no-underline"
            >
              <Plus size={16} strokeWidth={2.75} aria-hidden="true" />
              <span>{isEn ? 'New Transport Order' : 'Tạo đơn mới'}</span>
            </Link>
          )}

          {/* Section: NAVIGATION */}
          <div>
            {isExpanded ? (
              <div
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: '#B49A68',
                  textTransform: 'uppercase',
                  padding: '0 10px',
                  marginBottom: '8px',
                  whiteSpace: 'nowrap',
                }}
              >
                {t('nav.navigation', 'Điều Hướng')}
              </div>
            ) : (
              <div className="w-8 h-[1px] bg-[#2C2F2A] mx-auto my-2" />
            )}

            <nav style={{ display: 'flex', flexDirection: 'column', gap: !isExpanded ? '6px' : '3px' }}>
              {navItems.map((item) => {
                const isActive = isNavItemActive(item.href);

                if (!isExpanded) {
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-label={item.label}
                      aria-current={isActive ? 'page' : undefined}
                      className="relative group flex items-center justify-center py-1"
                    >
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 group-hover:bg-[#242722] group-hover:text-[#F7F7F4] ${
                          isActive
                            ? 'bg-[#242722] text-[#B49A68] border border-[#B49A68]/50 shadow-sm'
                            : 'text-slate-300'
                        }`}
                      >
                        {item.icon}
                      </div>

                      {item.badge !== undefined && (
                        <span aria-hidden="true" className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-[#181A17] animate-pulse" />
                      )}

                      <div
                        aria-hidden="true"
                        className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-[#181A17] text-[#F7F7F4] text-xs font-bold whitespace-nowrap shadow-xl border border-[#2C2F2A] pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50 flex items-center gap-2 -translate-x-1.5 group-hover:translate-x-0"
                      >
                        <span>{item.label}</span>
                        {item.badge !== undefined && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#B33E3E] text-white">
                            {item.badge}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-[10px] text-[13.5px] whitespace-nowrap transition-all duration-150 no-underline border-l-[3px] ${
                      isActive
                        ? 'font-bold text-[#F7F7F4] bg-[#B49A68]/20 border-[#B49A68]'
                        : 'font-medium text-slate-300 border-transparent hover:bg-[#242722] hover:text-[#F7F7F4]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={isActive ? 'text-[#B49A68]' : 'text-slate-400'}>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>

                    {item.badge !== undefined && (
                      <span className="px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-[#B33E3E] text-white">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Section: ACCOUNT (Notifications + Settings grouped like Manager) */}
          <div>
            {isExpanded ? (
              <div
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: '#B49A68',
                  textTransform: 'uppercase',
                  padding: '0 10px',
                  marginBottom: '8px',
                  whiteSpace: 'nowrap',
                }}
              >
                {isEn ? 'Account' : 'Tài Khoản'}
              </div>
            ) : (
              <div className="w-8 h-[1px] bg-[#2C2F2A] mx-auto my-2" />
            )}

            <nav style={{ display: 'flex', flexDirection: 'column', gap: !isExpanded ? '6px' : '3px' }}>
              {managementItems.map((item) => {
                const isActive = pathname?.startsWith(item.href);

                if (!isExpanded) {
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-label={item.label}
                      aria-current={isActive ? 'page' : undefined}
                      className="relative group flex items-center justify-center py-1"
                    >
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 group-hover:bg-[#242722] group-hover:text-[#F7F7F4] ${
                          isActive
                            ? 'bg-[#242722] text-[#B49A68] border border-[#B49A68]/50 shadow-sm'
                            : 'text-slate-300'
                        }`}
                      >
                        {item.icon}
                      </div>

                      {item.badge !== undefined && (
                        <span aria-hidden="true" className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-[#181A17] animate-pulse" />
                      )}

                      <div
                        aria-hidden="true"
                        className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-[#181A17] text-[#F7F7F4] text-xs font-bold whitespace-nowrap shadow-xl border border-[#2C2F2A] pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50 flex items-center gap-2 -translate-x-1.5 group-hover:translate-x-0"
                      >
                        <span>{item.label}</span>
                        {item.badge !== undefined && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#B33E3E] text-white">
                            {item.badge}
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-[10px] text-[13.5px] whitespace-nowrap transition-all duration-150 no-underline border-l-[3px] ${
                      isActive
                        ? 'font-bold text-[#F7F7F4] bg-[#B49A68]/20 border-[#B49A68]'
                        : 'font-medium text-slate-300 border-transparent hover:bg-[#242722] hover:text-[#F7F7F4]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={isActive ? 'text-[#B49A68]' : 'text-slate-400'}>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                    {item.badge !== undefined && (
                      <span className="px-1.5 py-0.5 rounded-full text-[11px] font-bold bg-[#B33E3E] text-white">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Logout Action */}
          <div style={{ marginTop: 'auto', paddingTop: '14px', borderTop: '1px solid #2C2F2A' }}>
            {!isExpanded ? (
              <button
                type="button"
                onClick={() => setShowLogoutModal(true)}
                className="relative group flex items-center justify-center w-full py-1 cursor-pointer"
                aria-label={t('common.logout', 'Đăng xuất')}
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-rose-300 hover:bg-[#B33E3E]/20 hover:text-rose-200 transition-colors">
                  <LogOut size={18} aria-hidden="true" />
                </div>
                <div
                  aria-hidden="true"
                  className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-[#181A17] text-[#F7F7F4] text-xs font-bold whitespace-nowrap shadow-xl border border-[#2C2F2A] pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50"
                >
                  {t('common.logout', 'Đăng xuất')}
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowLogoutModal(true)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13.5px] font-semibold text-rose-300 bg-[#B33E3E]/15 border border-[#B33E3E]/30 hover:bg-[#B33E3E]/25 transition-colors whitespace-nowrap cursor-pointer"
              >
                <LogOut size={17} aria-hidden="true" />
                <span>{t('common.logout', 'Đăng xuất')}</span>
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
