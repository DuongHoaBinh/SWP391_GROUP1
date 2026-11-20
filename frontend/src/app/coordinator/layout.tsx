'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Map,
  Truck,
  CalendarDays,
  Radio,
  AlertTriangle,
  Bell,
  Settings,
  HelpCircle,
  LogOut,
  Search,
  ChevronDown,
  Menu,
  X,
  Pin,
  PinOff,
} from 'lucide-react';
import { getAuthToken, getCurrentUser, logout } from '@/lib/auth';
import { getDashboardRouteForRole } from '@/lib/auth-redirect';
import { LogoutConfirmModal } from '@/components/layout/LogoutConfirmModal';
import { HelpSupportModal } from '@/components/layout/HelpSupportModal';
import { PortalLoadingSkeleton } from '@/components/layout/PortalLoadingSkeleton';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { apiClient } from '@/lib/api-client';
import { AmbientCanvas } from '@/components/layout/AmbientCanvas';
import { FleetRouteStoreProvider } from '@/lib/fleet-route-store';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
}

export default function CoordinatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, language } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [currentUser, setCurrentUser] = useState<ReturnType<typeof getCurrentUser> | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

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

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setShowUserMenu(false);
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileMenuOpen]);

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

  const fetchUnread = useCallback(async () => {
    try {
      const notifs = await apiClient<any[]>('/notifications');
      if (Array.isArray(notifs)) {
        setUnreadNotifs(notifs.filter((n) => !n.isRead).length);
      }
    } catch {
      // ignore background poll errors
    }
  }, []);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      const target = pathnameRef.current || '/coordinator';
      router.replace(`/login?redirect=${encodeURIComponent(target)}`);
      return;
    }

    const user = getCurrentUser();
    setCurrentUser(user);
    if (user?.role && user.role !== 'FLEET_ROUTE_COORDINATOR' && user.role !== 'ADMIN') {
      router.replace(getDashboardRouteForRole(user.role));
      return;
    }

    setIsAuthorized(true);
    void fetchUnread();

    const handleNotificationsUpdated = () => {
      void fetchUnread();
    };
    const handleAuthUpdated = () => {
      void fetchUnread();
      setCurrentUser(getCurrentUser());
    };
    window.addEventListener('notifications-updated', handleNotificationsUpdated);
    window.addEventListener('auth-user-updated', handleAuthUpdated);
    const interval = setInterval(() => {
      void fetchUnread();
    }, 15000);

    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
      window.removeEventListener('notifications-updated', handleNotificationsUpdated);
      window.removeEventListener('auth-user-updated', handleAuthUpdated);
      clearInterval(interval);
    };
  }, [router, fetchUnread]);

  if (!isAuthorized) {
    return <PortalLoadingSkeleton />;
  }

  const navItems: NavItem[] = [
    {
      label: t('nav.dashboard', 'Tổng quan'),
      href: '/coordinator',
      icon: <LayoutDashboard size={18} />,
    },
    {
      label: t('nav.routes', 'Lập lộ trình tuyến'),
      href: '/coordinator/routes',
      icon: <Map size={18} />,
    },
    {
      label: t('nav.vehicles', 'Quản lý đội xe'),
      href: '/coordinator/vehicles',
      icon: <Truck size={18} />,
    },
    {
      label: t('nav.schedule', 'Lịch trình điều phối'),
      href: '/coordinator/schedule',
      icon: <CalendarDays size={18} />,
    },
    {
      label: t('nav.monitoring', 'Giám sát thời gian thực'),
      href: '/coordinator/monitoring',
      icon: <Radio size={18} />,
    },
  ];

  const managementItems: NavItem[] = [
    {
      label: t('nav.alerts', 'Cảnh báo vận hành'),
      href: '/coordinator/alerts',
      icon: <AlertTriangle size={18} />,
    },
    {
      label: t('common.notifications', 'Thông báo'),
      href: '/coordinator/notifications',
      icon: <Bell size={18} />,
      badge: unreadNotifs > 0 ? unreadNotifs : undefined,
    },
    {
      label: t('common.settings', 'Cài đặt hệ thống'),
      href: '/coordinator/settings',
      icon: <Settings size={18} />,
    },
  ];

  const handleLogoutConfirm = () => {
    setShowLogoutModal(false);
    logout();
  };

  const userInitials =
    currentUser?.initials ||
    currentUser?.name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() ||
    'FC';

  return (
    <FleetRouteStoreProvider>
      <div className="flex h-[100dvh] max-h-[100dvh] bg-[#F4F1E9] overflow-hidden relative font-sans">
        <AmbientCanvas />
        <LogoutConfirmModal
          isOpen={showLogoutModal}
          onClose={() => setShowLogoutModal(false)}
          onConfirm={handleLogoutConfirm}
        />

        {/* LEFT SIDEBAR (DESKTOP PUSH-CONTENT & HOVER/PIN COLLAPSIBLE) */}
        <aside
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className="hidden md:flex liquid-glass-sidebar shrink-0 flex-col"
          style={{
            width: isExpanded ? '260px' : '76px',
            color: '#A5ACA1',
            height: '100%',
            position: 'sticky',
            top: 0,
            zIndex: 40,
            borderRight: '1px solid rgba(180, 154, 104, 0.16)',
            overflowX: isExpanded ? 'hidden' : 'visible',
            transition: 'width 0.28s cubic-bezier(0.2, 0, 0, 1)',
          }}
        >
          {/* Logo & Toggle Header */}
          <div
            style={{
              height: '72px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: !isExpanded ? 'center' : 'space-between',
              padding: !isExpanded ? '0 12px' : '0 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <button
                type="button"
                onClick={togglePin}
                aria-label={
                  !isPinned
                    ? t('coordinator.pinTooltip', 'Hover to auto-expand. Click to pin.')
                    : t('coordinator.unpinTooltip', 'Pinned. Click to unpin.')
                }
                title={
                  !isPinned
                    ? t('coordinator.pinTooltip', 'Hover to auto-expand. Click to pin.')
                    : t('coordinator.unpinTooltip', 'Pinned. Click to unpin.')
                }
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: !isExpanded ? '0' : '12px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
                  border: '1px solid rgba(180, 154, 104, 0.45)',
                  backgroundColor: '#181A17',
                  flexShrink: 0,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <img src="/logo.png" alt="EquiTransit" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </button>
              {isExpanded && (
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  <p style={{ color: '#FAF8F4', fontWeight: 700, fontSize: '15px', letterSpacing: '0.01em', lineHeight: 1.2, margin: 0 }}>
                    EquiTransit
                  </p>
                  <span style={{ fontSize: '10px', color: '#B49A68', fontWeight: 700, letterSpacing: '0.08em' }}>
                    COORDINATOR
                  </span>
                </div>
              )}
            </div>

            {isExpanded && (
              <button
                type="button"
                onClick={togglePin}
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all cursor-pointer ${
                  isPinned
                    ? 'bg-[#C4B38E]/25 text-[#D8CEBE] border border-[#C4B38E]/45 shadow-sm'
                    : 'text-[#A5ACA1] hover:text-white hover:bg-white/10'
                }`}
                title={isPinned ? t('coordinator.unpinTooltip', 'Unpin sidebar') : t('coordinator.pinTooltip', 'Pin sidebar')}
                aria-label={isPinned ? t('coordinator.unpinTooltip', 'Unpin sidebar') : t('coordinator.pinTooltip', 'Pin sidebar')}
              >
                {isPinned ? <Pin size={15} className="rotate-45 text-[#B49A68]" /> : <PinOff size={15} />}
              </button>
            )}
          </div>

          {/* Navigation Groups */}
          <div
            style={{
              flex: 1,
              overflowY: isExpanded ? 'auto' : 'visible',
              overflowX: isExpanded ? 'hidden' : 'visible',
              padding: !isExpanded ? '20px 8px' : '24px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: !isExpanded ? '16px' : '28px',
            }}
          >
            {/* OVERVIEW GROUP */}
            <div>
              {isExpanded && (
                <p style={{ padding: '0 12px', fontSize: '10px', fontWeight: 600, color: '#787E75', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                  {t('coordinator.nav.routeOps', 'Điều Hành Tuyến Đường')}
                </p>
              )}
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {navItems.map((item) => {
                  const isActive =
                    item.href === '/coordinator'
                      ? pathname === '/coordinator'
                      : Boolean(pathname?.startsWith(item.href));

                  if (!isExpanded) {
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-label={item.label}
                        className="relative group flex items-center justify-center py-1 no-underline"
                      >
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:bg-[#C4B38E]/20 group-hover:text-[#D8CEBE] ${
                            isActive
                              ? 'bg-[#C4B38E]/25 text-[#D8CEBE] border border-[#C4B38E]/40 shadow-lg shadow-[#A67C2E]/20'
                              : 'text-[#A5ACA1] hover:text-white'
                          }`}
                        >
                          {item.icon}
                        </div>

                        {item.badge !== undefined && (
                          <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-[#A67C2E] ring-2 ring-[#181A17] animate-pulse" />
                        )}

                        <div className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-[#181A17]/95 backdrop-blur-md text-[#FAF8F4] text-xs font-bold whitespace-nowrap shadow-2xl border border-[#B49A68]/30 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-[65] flex items-center gap-2 -translate-x-1.5 group-hover:translate-x-0">
                          <span>{item.label}</span>
                          {item.badge !== undefined && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#A67C2E] text-white">
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
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        fontSize: '13.5px',
                        fontWeight: isActive ? 600 : 500,
                        color: isActive ? '#FAF8F4' : '#A5ACA1',
                        backgroundColor: isActive ? 'rgba(180, 154, 104, 0.14)' : 'transparent',
                        border: isActive ? '1px solid rgba(180, 154, 104, 0.28)' : '1px solid transparent',
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ color: isActive ? '#B49A68' : '#787E75' }}>{item.icon}</span>
                        <span>{item.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* MANAGEMENT GROUP */}
            <div>
              {isExpanded && (
                <p style={{ padding: '0 12px', fontSize: '10px', fontWeight: 600, color: '#787E75', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                  {t('coordinator.nav.systemAdmin', 'Quản Trị Hệ Thống')}
                </p>
              )}
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {managementItems.map((item) => {
                  const isActive = Boolean(pathname?.startsWith(item.href));

                  if (!isExpanded) {
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-label={item.label}
                        className="relative group flex items-center justify-center py-1 no-underline"
                      >
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:bg-[#C4B38E]/20 group-hover:text-[#D8CEBE] ${
                            isActive
                              ? 'bg-[#C4B38E]/25 text-[#D8CEBE] border border-[#C4B38E]/40 shadow-lg shadow-[#A67C2E]/20'
                              : 'text-[#A5ACA1] hover:text-white'
                          }`}
                        >
                          {item.icon}
                        </div>

                        {item.badge !== undefined && (
                          <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-red-500 ring-2 ring-[#181A17] animate-pulse" />
                        )}

                        <div className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-[#181A17]/95 backdrop-blur-md text-[#FAF8F4] text-xs font-bold whitespace-nowrap shadow-2xl border border-[#B49A68]/30 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-[65] flex items-center gap-2 -translate-x-1.5 group-hover:translate-x-0">
                          <span>{item.label}</span>
                          {item.badge !== undefined && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500 text-white">
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
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        fontSize: '13.5px',
                        fontWeight: isActive ? 600 : 500,
                        color: isActive ? '#FAF8F4' : '#A5ACA1',
                        backgroundColor: isActive ? 'rgba(180, 154, 104, 0.14)' : 'transparent',
                        border: isActive ? '1px solid rgba(180, 154, 104, 0.28)' : '1px solid transparent',
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ color: isActive ? '#B49A68' : '#787E75' }}>{item.icon}</span>
                        <span>{item.label}</span>
                      </div>

                      {item.badge !== undefined && (
                        <span
                          style={{
                            backgroundColor: '#ef4444',
                            color: '#ffffff',
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '999px',
                          }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Bottom Area */}
          <div
            style={{
              padding: !isExpanded ? '16px 8px' : '16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {!isExpanded ? (
              <button
                type="button"
                aria-label={t('common.helpSupport', 'Trợ Giúp & Hỗ Trợ')}
                onClick={() => setShowSupportModal(true)}
                className="relative group flex items-center justify-center py-1 bg-transparent border-0 cursor-pointer w-full"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[#A5ACA1] hover:text-white hover:bg-white/5 transition-all duration-200 group-hover:scale-110">
                  <HelpCircle size={18} />
                </div>
                <div className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-[#181A17]/95 backdrop-blur-md text-[#FAF8F4] text-xs font-bold whitespace-nowrap shadow-2xl border border-[#B49A68]/30 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-[65] -translate-x-1.5 group-hover:translate-x-0">
                  <span>{t('common.helpSupport', 'Trợ Giúp & Hỗ Trợ')}</span>
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowSupportModal(true)}
                className="flex items-center gap-3 px-3 py-2 text-[13px] text-[#A5ACA1] hover:text-[#FAF8F4] hover:bg-white/5 rounded-lg whitespace-nowrap cursor-pointer w-full text-left transition-colors"
              >
                <HelpCircle size={17} className="text-[#787E75]" />
                <span>{t('common.helpSupport', 'Trợ Giúp & Hỗ Trợ')}</span>
              </button>
            )}

            {!isExpanded ? (
              <div className="flex flex-col items-center gap-2 pt-1">
                <div
                  className="relative group cursor-pointer"
                  title={`${currentUser?.name || t('role.coordinator', 'Điều Phối Viên')}${currentUser?.email ? ` (${currentUser.email})` : ''}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-[#181A17] border border-[#C4B38E]/50 text-[#C4B38E] flex items-center justify-center font-bold text-xs shadow-md group-hover:scale-110 transition-all">
                    {userInitials}
                  </div>
                  <div className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-[#181A17]/95 backdrop-blur-md text-[#FAF8F4] text-xs font-bold whitespace-nowrap shadow-2xl border border-[#B49A68]/30 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-[65] -translate-x-1.5 group-hover:translate-x-0">
                    <div className="font-extrabold text-white">{currentUser?.name || t('role.coordinator', 'Điều Phối Viên')}</div>
                    {currentUser?.email && (
                      <div className="text-[10px] text-[#A5ACA1] font-normal">{currentUser.email}</div>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowLogoutModal(true)}
                  className="p-2 text-[#A5ACA1] hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-all cursor-pointer"
                  title={t('common.logout', 'Đăng xuất')}
                  aria-label={t('common.logout', 'Đăng xuất')}
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '12px',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  border: '1px solid rgba(180, 154, 104, 0.2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      backgroundColor: '#181A17',
                      border: '1px solid rgba(196, 179, 142, 0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#C4B38E',
                      flexShrink: 0,
                    }}
                  >
                    {userInitials}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#FAF8F4', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {currentUser?.name || t('role.coordinator', 'Điều Phối Viên')}
                    </p>
                    <p style={{ fontSize: '10px', color: '#B49A68', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t('role.coordinator', language === 'en' ? 'Fleet & Route Coordinator' : 'Điều Phối Viên Đội Xe')}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowLogoutModal(true)}
                  title={t('common.logout', 'Đăng xuất')}
                  aria-label={t('common.logout', 'Đăng xuất')}
                  className="text-[#A5ACA1] hover:text-rose-400 p-1 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* MOBILE DRAWER */}
        {mobileMenuOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('common.openMenu', 'Menu điều hướng')}
            className="fixed inset-0 z-[70] flex md:hidden"
          >
            <div
              className="fixed inset-0 bg-[#181A17]/65 backdrop-blur-sm transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside
              style={{
                width: '268px',
                backgroundColor: '#181A17',
                color: '#A5ACA1',
                display: 'flex',
                flexDirection: 'column',
                height: '100dvh',
                position: 'relative',
                zIndex: 71,
                borderRight: '1px solid rgba(180, 154, 104, 0.22)',
              }}
              className="animate-fade-in shadow-2xl"
            >
              {/* Logo + Close */}
              <div
                style={{
                  height: '72px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 20px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '9px',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: '12px',
                      border: '1px solid rgba(180, 154, 104, 0.45)',
                      backgroundColor: '#181A17',
                    }}
                  >
                    <img src="/logo.png" alt="EquiTransit" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div>
                    <p style={{ color: '#FAF8F4', fontWeight: 700, fontSize: '15px', lineHeight: 1.2, margin: 0 }}>
                      EquiTransit
                    </p>
                    <span style={{ fontSize: '10px', color: '#B49A68', fontWeight: 700, letterSpacing: '0.08em' }}>
                      COORDINATOR
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label={t('common.closeMenu', language === 'en' ? 'Close navigation' : 'Đóng menu điều hướng')}
                  className="text-[#A5ACA1] hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Nav links */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div>
                  <p style={{ padding: '0 12px', fontSize: '10px', fontWeight: 600, color: '#787E75', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                    {t('coordinator.nav.routeOps', 'Điều Hành Tuyến Đường')}
                  </p>
                  <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {navItems.map((item) => {
                      const isActive =
                        item.href === '/coordinator'
                          ? pathname === '/coordinator'
                          : Boolean(pathname?.startsWith(item.href));
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            fontSize: '13.5px',
                            fontWeight: isActive ? 600 : 500,
                            color: isActive ? '#FAF8F4' : '#A5ACA1',
                            backgroundColor: isActive ? 'rgba(180, 154, 104, 0.16)' : 'transparent',
                            border: isActive ? '1px solid rgba(180, 154, 104, 0.3)' : '1px solid transparent',
                            textDecoration: 'none',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ color: isActive ? '#B49A68' : '#787E75' }}>{item.icon}</span>
                            <span>{item.label}</span>
                          </span>
                        </Link>
                      );
                    })}
                  </nav>
                </div>

                <div>
                  <p style={{ padding: '0 12px', fontSize: '10px', fontWeight: 600, color: '#787E75', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                    {t('coordinator.nav.systemAdmin', 'Quản Trị Hệ Thống')}
                  </p>
                  <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {managementItems.map((item) => {
                      const isActive = Boolean(pathname?.startsWith(item.href));
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            fontSize: '13.5px',
                            fontWeight: isActive ? 600 : 500,
                            color: isActive ? '#FAF8F4' : '#A5ACA1',
                            backgroundColor: isActive ? 'rgba(180, 154, 104, 0.16)' : 'transparent',
                            border: isActive ? '1px solid rgba(180, 154, 104, 0.3)' : '1px solid transparent',
                            textDecoration: 'none',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ color: isActive ? '#B49A68' : '#787E75' }}>{item.icon}</span>
                            <span>{item.label}</span>
                          </span>
                          {item.badge !== undefined && (
                            <span style={{ backgroundColor: '#A67C2E', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '999px' }}>
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              </div>

              {/* Drawer Footer: Help & Support + Logout */}
              <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setShowSupportModal(true);
                  }}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-[13px] font-medium text-[#A5ACA1] hover:text-white hover:bg-white/5 transition-colors cursor-pointer text-left"
                >
                  <HelpCircle size={16} className="text-[#B49A68]" />
                  <span>{t('common.helpSupport', 'Trợ Giúp & Hỗ Trợ')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setShowLogoutModal(true);
                  }}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[13.5px] font-semibold transition-colors cursor-pointer text-left"
                >
                  <LogOut size={16} />
                  <span>{t('common.logout', 'Đăng xuất')}</span>
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* MAIN CONTENT AREA */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
          {/* TOP HEADER */}
          <header
            className="liquid-glass-header px-3 sm:px-6"
            style={{
              height: '72px',
              backgroundColor: 'rgba(255, 255, 255, 0.88)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderBottom: '1px solid #E5E0D5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              position: 'sticky',
              top: 0,
              zIndex: 45,
              flexShrink: 0,
            }}
          >
            {/* Left: Mobile Menu Toggle & Title */}
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label={t('common.openMenu', language === 'en' ? 'Open mobile menu' : 'Mở menu điều hướng')}
                className="md:hidden w-10 h-10 rounded-lg border border-[#E5E0D5] bg-white text-[#181A17] flex items-center justify-center shrink-0 cursor-pointer hover:bg-[#FAF8F4]"
              >
                <Menu size={20} />
              </button>
              <div className="min-w-0">
                <p className="text-sm sm:text-base font-bold text-[#181A17] m-0 leading-tight truncate">
                  {t('coordinator.title', language === 'en' ? 'Fleet & Route Portal' : 'Điều Phối Tuyến & Đội Xe')}
                </p>
                <p className="text-xs text-[#6B7280] mt-0.5 mb-0 font-medium hidden lg:block truncate">
                  {t('coordinator.subtitle', 'Tổng quan tình trạng vận hành đội xe và tiến độ điều phối các chuyến vận chuyển.')}
                </p>
              </div>
            </div>

            {/* Center: Search */}
            <div className="hidden sm:flex items-center bg-[#FAF8F4] border border-[#E5E0D5] rounded-xl px-3.5 py-2 w-44 md:w-72 lg:w-96 focus-within:border-[#A67C2E] focus-within:bg-white transition-colors">
              <Search size={15} className="text-[#8892A0] mr-2.5 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                aria-label={t('common.search', 'Search trips, vehicles, routes...')}
                placeholder={t('common.search', 'Search trips, vehicles, routes...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchTerm.trim()) {
                    router.push(`/coordinator/routes?search=${encodeURIComponent(searchTerm.trim())}`);
                  }
                }}
                className="border-none outline-none bg-transparent text-xs sm:text-sm text-[#181A17] w-full"
              />
              <span className="hidden md:inline-block text-[10.5px] font-bold text-[#8892A0] bg-white border border-[#E5E0D5] px-1.5 py-0.5 rounded shrink-0">
                ⌘K
              </span>
            </div>

            {/* Right: Actions & User */}
            <div className="flex items-center gap-2 sm:gap-3.5 shrink-0">
              <LanguageSwitcher variant="pill" />

              <button
                type="button"
                onClick={() => router.push('/coordinator/notifications')}
                aria-label={t('common.notifications', language === 'en' ? 'Notifications' : 'Thông báo')}
                className="w-10 h-10 rounded-full border border-[#E5E0D5] flex items-center justify-center text-[#5F6977] bg-white hover:bg-[#FAF8F4] relative cursor-pointer transition-colors shrink-0"
              >
                <Bell size={17} />
                {unreadNotifs > 0 && (
                  <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
                )}
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowUserMenu((v) => !v)}
                  aria-expanded={showUserMenu}
                  aria-haspopup="menu"
                  aria-label={t('common.accountMenu', language === 'en' ? 'Account menu' : 'Menu tài khoản')}
                  className="flex items-center gap-2.5 bg-[#FAF8F4] hover:bg-[#F3EFE6] border border-[#E5E0D5] rounded-full py-1 pl-1 pr-2.5 cursor-pointer transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-[#181A17] text-[#C4B38E] flex items-center justify-center text-xs font-bold shrink-0">
                    {userInitials}
                  </div>
                  <div className="text-left leading-tight hidden sm:block">
                    <p className="text-xs font-semibold text-[#181A17] m-0 max-w-[120px] truncate">
                      {currentUser?.name || t('role.coordinator', 'Điều Phối Viên')}
                    </p>
                    <p className="text-[10px] text-[#6B7280] m-0 font-medium flex items-center gap-0.5">
                      {t('role.coordinator', 'Coordinator')} <ChevronDown size={10} />
                    </p>
                  </div>
                  <ChevronDown size={12} className="text-[#6B7280] sm:hidden" />
                </button>

                {showUserMenu && (
                  <>
                    <div onClick={() => setShowUserMenu(false)} className="fixed inset-0 z-[55]" />
                    <div
                      role="menu"
                      className="absolute right-0 mt-2 w-56 bg-white border border-[#D8CEBE] rounded-xl shadow-xl p-1.5 z-[60] flex flex-col gap-0.5"
                    >
                      <Link
                        role="menuitem"
                        href="/coordinator/settings"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#181A17] rounded-lg hover:bg-[#FAF8F4] no-underline"
                      >
                        <Settings size={14} className="text-[#6B665D]" />
                        <span>{t('common.accountSettings', 'Cài đặt tài khoản')}</span>
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setShowUserMenu(false);
                          setShowSupportModal(true);
                        }}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#181A17] rounded-lg hover:bg-[#FAF8F4] text-left cursor-pointer w-full"
                      >
                        <HelpCircle size={14} className="text-[#6B665D]" />
                        <span>{t('common.helpSupport', 'Trợ Giúp & Hỗ Trợ')}</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setShowUserMenu(false);
                          setShowLogoutModal(true);
                        }}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#9E3B3B] rounded-lg hover:bg-rose-50 text-left cursor-pointer w-full"
                      >
                        <LogOut size={14} />
                        <span>{t('common.logout', 'Đăng xuất')}</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          {/* Content Container */}
          <div className="p-3.5 sm:p-6 lg:p-8" style={{ flex: 1, overflowY: 'auto', backgroundColor: 'transparent' }}>
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>{children}</div>
          </div>
        </main>
        <HelpSupportModal isOpen={showSupportModal} onClose={() => setShowSupportModal(false)} />
      </div>
    </FleetRouteStoreProvider>
  );
}
