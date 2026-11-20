'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ClipboardCheck,
  Scale,
  FolderOpen,
  FileSignature,
  FileX,
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
import { getAuthToken, clearAuthSession, getCurrentUser, logout } from '@/lib/auth';
import { getDashboardRouteForRole } from '@/lib/auth-redirect';
import { LogoutConfirmModal } from '@/components/layout/LogoutConfirmModal';
import { HelpSupportModal } from '@/components/layout/HelpSupportModal';
import { PortalLoadingSkeleton } from '@/components/layout/PortalLoadingSkeleton';
import { apiClient } from '@/lib/api-client';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { AmbientCanvas } from '@/components/layout/AmbientCanvas';
import { DocumentStoreProvider } from '@/lib/document-store';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
  badgeColor?: 'brand' | 'danger';
}

export default function SpecialistLayout({
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
  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const leaveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

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
      } else if (e.key === 'Escape') {
        setMobileMenuOpen(false);
        setShowUserMenu(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
    setShowUserMenu(false);
  }, [pathname]);

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
      const notifs = await apiClient<Array<{ isRead?: boolean }>>('/notifications');
      if (Array.isArray(notifs)) {
        setUnreadNotifs(notifs.filter((n) => !n.isRead).length);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/specialist';
    const token = getAuthToken();
    if (!token) {
      router.replace(`/login?redirect=${encodeURIComponent(currentPath || '/specialist')}`);
      return;
    }

    const user = getCurrentUser();
    if (!user) {
      clearAuthSession();
      router.replace(`/login?redirect=${encodeURIComponent(currentPath || '/specialist')}`);
      return;
    }

    if (user.role && user.role !== 'TRANSPORT_SPECIALIST' && user.role !== 'ADMIN') {
      router.replace(getDashboardRouteForRole(user.role));
      return;
    }

    setCurrentUser(user);
    setIsAuthorized(true);
    fetchUnread();

    const handleNotificationsUpdated = () => {
      fetchUnread();
    };
    const handleAuthUpdated = () => {
      fetchUnread();
      setCurrentUser(getCurrentUser());
    };
    window.addEventListener('notifications-updated', handleNotificationsUpdated);
    window.addEventListener('auth-user-updated', handleAuthUpdated);
    const interval = setInterval(fetchUnread, 10000);

    return () => {
      window.removeEventListener('notifications-updated', handleNotificationsUpdated);
      window.removeEventListener('auth-user-updated', handleAuthUpdated);
      clearInterval(interval);
    };
  }, [router, fetchUnread]);

  useEffect(() => {
    if (isAuthorized) {
      fetchUnread();
    }
  }, [pathname, isAuthorized, fetchUnread]);

  const navItems: NavItem[] = [
    {
      label: t('nav.dashboard', 'Tổng Quan'),
      href: '/specialist',
      icon: <LayoutDashboard size={18} />,
    },
    {
      label: t('specialist.nav.complianceOrders', 'Đơn Kiểm Định Pháp Lý'),
      href: '/specialist/compliance-orders',
      icon: <ClipboardCheck size={18} />,
    },
    {
      label: t('specialist.nav.regulations', 'Quy Định Kiểm Dịch'),
      href: '/specialist/regulations',
      icon: <Scale size={18} />,
    },
    {
      label: t('specialist.nav.documents', 'Hồ Sơ Vận Chuyển'),
      href: '/specialist/documents',
      icon: <FolderOpen size={18} />,
    },
    {
      label: t('specialist.nav.approval', 'Thẩm Định Giấy Tờ'),
      href: '/specialist/approval',
      icon: <FileSignature size={18} />,
    },
    {
      label: t('specialist.nav.missing', 'Hồ Sơ Còn Thiếu'),
      href: '/specialist/missing',
      icon: <FileX size={18} />,
    },
  ];

  const managementItems: NavItem[] = [
    {
      label: t('common.notifications', 'Thông Báo'),
      href: '/specialist/notifications',
      icon: <Bell size={18} />,
      badge: unreadNotifs > 0 ? unreadNotifs : undefined,
      badgeColor: 'brand',
    },
    {
      label: t('common.settings', 'Cài Đặt Hệ Thống'),
      href: '/specialist/settings',
      icon: <Settings size={18} />,
    },
  ];

  const handleLogoutConfirm = () => {
    setShowLogoutModal(false);
    logout();
  };

  if (!isAuthorized) {
    return <PortalLoadingSkeleton />;
  }

  const userInitials =
    currentUser?.initials ||
    currentUser?.name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() ||
    'TS';

  return (
    <DocumentStoreProvider>
      <div className="flex h-[100dvh] max-h-[100dvh] w-full bg-[#F4F1E9] font-sans overflow-hidden relative">
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
            overflowX: 'hidden',
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
              >
                <img src="/logo.png" alt="EquiTransit" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </button>
              {isExpanded && (
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  <p style={{ color: '#FAF8F4', fontWeight: 700, fontSize: '15px', letterSpacing: '0.01em', lineHeight: 1.2, margin: 0 }}>
                    EquiTransit
                  </p>
                  <span style={{ fontSize: '10px', color: '#B49A68', fontWeight: 700, letterSpacing: '0.08em' }}>
                    SPECIALIST
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
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: !isExpanded ? '20px 8px' : '24px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: !isExpanded ? '16px' : '28px',
            }}
          >
            {/* OVERVIEW GROUP */}
            <div>
              {isExpanded ? (
                <p style={{ padding: '0 12px', fontSize: '10px', fontWeight: 600, color: '#7E867B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                  {t('common.mainNav', 'Điều Hướng Chính')}
                </p>
              ) : (
                <div className="w-8 h-[1px] bg-white/10 mx-auto my-2" />
              )}
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {navItems.map((item) => {
                  const isActive =
                    item.href === '/specialist' ? pathname === '/specialist' : pathname?.startsWith(item.href);

                  if (!isExpanded) {
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={isActive ? 'page' : undefined}
                        title={item.label}
                        className="relative group flex items-center justify-center py-1 no-underline"
                      >
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:bg-[#C4B38E]/20 group-hover:text-[#D8CEBE] ${
                            isActive
                              ? 'bg-[#C4B38E]/25 text-[#D8CEBE] border border-[#C4B38E]/45 shadow-sm shadow-[#A67C2E]/25'
                              : 'text-[#A5ACA1] hover:text-white'
                          }`}
                        >
                          {item.icon}
                        </div>

                        {item.badge !== undefined && (
                          <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-[#A67C2E] ring-2 ring-[#181A17] animate-pulse" />
                        )}

                        <div className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-[#181A17]/95 backdrop-blur-md text-[#FAF8F4] text-xs font-bold whitespace-nowrap shadow-xl border border-[#B49A68]/30 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50 flex items-center gap-2 -translate-x-1.5 group-hover:translate-x-0">
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
                      aria-current={isActive ? 'page' : undefined}
                      className={`no-underline flex items-center justify-between px-3 py-2.5 rounded-lg text-[13.5px] transition-colors whitespace-nowrap ${
                        isActive
                          ? 'bg-[#A67C2E]/20 text-[#FAF8F4] border border-[#A67C2E]/35 font-semibold'
                          : 'text-[#A5ACA1] border border-transparent font-medium hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={isActive ? 'text-[#B49A68]' : 'text-[#7E867B]'}>{item.icon}</span>
                        <span>{item.label}</span>
                      </div>

                      {item.badge !== undefined && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${
                            item.badgeColor === 'danger' ? 'bg-[#B33E3E]' : 'bg-[#A67C2E]'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* MANAGEMENT GROUP */}
            <div>
              {isExpanded ? (
                <p style={{ padding: '0 12px', fontSize: '10px', fontWeight: 600, color: '#7E867B', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                  {t('coordinator.nav.systemAdmin', 'Quản Trị Hệ Thống')}
                </p>
              ) : (
                <div className="w-8 h-[1px] bg-white/10 mx-auto my-2" />
              )}
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {managementItems.map((item) => {
                  const isActive = pathname?.startsWith(item.href);

                  if (!isExpanded) {
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={isActive ? 'page' : undefined}
                        title={item.label}
                        className="relative group flex items-center justify-center py-1 no-underline"
                      >
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:bg-[#C4B38E]/20 group-hover:text-[#D8CEBE] ${
                            isActive
                              ? 'bg-[#C4B38E]/25 text-[#D8CEBE] border border-[#C4B38E]/45 shadow-sm shadow-[#A67C2E]/25'
                              : 'text-[#A5ACA1] hover:text-white'
                          }`}
                        >
                          {item.icon}
                        </div>

                        {item.badge !== undefined && (
                          <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-[#A67C2E] ring-2 ring-[#181A17] animate-pulse" />
                        )}

                        <div className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-[#181A17]/95 backdrop-blur-md text-[#FAF8F4] text-xs font-bold whitespace-nowrap shadow-xl border border-[#B49A68]/30 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50 flex items-center gap-2 -translate-x-1.5 group-hover:translate-x-0">
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
                      aria-current={isActive ? 'page' : undefined}
                      className={`no-underline flex items-center justify-between px-3 py-2.5 rounded-lg text-[13.5px] transition-colors whitespace-nowrap ${
                        isActive
                          ? 'bg-[#A67C2E]/20 text-[#FAF8F4] border border-[#A67C2E]/35 font-semibold'
                          : 'text-[#A5ACA1] border border-transparent font-medium hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={isActive ? 'text-[#B49A68]' : 'text-[#7E867B]'}>{item.icon}</span>
                        <span>{item.label}</span>
                      </div>

                      {item.badge !== undefined && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${
                            item.badgeColor === 'danger' ? 'bg-[#B33E3E]' : 'bg-[#A67C2E]'
                          }`}
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
          <div style={{ padding: !isExpanded ? '16px 8px' : '16px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {!isExpanded ? (
              <button
                type="button"
                onClick={() => setShowSupportModal(true)}
                title={t('common.helpSupport', 'Trợ Giúp & Hỗ Trợ')}
                aria-label={t('common.helpSupport', 'Trợ Giúp & Hỗ Trợ')}
                className="relative group flex items-center justify-center py-1 bg-transparent border-0 cursor-pointer w-full"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[#A5ACA1] hover:text-white hover:bg-white/10 transition-all duration-200 group-hover:scale-110">
                  <HelpCircle size={18} />
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowSupportModal(true)}
                className="flex items-center gap-3 px-3 py-2 text-[13px] text-[#A5ACA1] hover:text-white hover:bg-white/5 rounded-lg whitespace-nowrap transition-colors bg-transparent border-0 cursor-pointer text-left w-full"
              >
                <HelpCircle size={17} className="text-[#7E867B]" />
                <span>{t('common.helpSupport', 'Trợ Giúp & Hỗ Trợ')}</span>
              </button>
            )}

            {!isExpanded ? (
              <div className="flex flex-col items-center gap-2 pt-1">
                <div
                  className="relative group cursor-default"
                  title={`${currentUser?.name || t('role.specialist', 'Chuyên viên Kiểm dịch')}${currentUser?.email ? ` (${currentUser.email})` : ''}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-[#A67C2E] text-white flex items-center justify-center font-bold text-xs shadow-md group-hover:scale-105 transition-all">
                    {userInitials}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowLogoutModal(true)}
                  className="p-2 text-[#A5ACA1] hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-all cursor-pointer bg-transparent border-0"
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
                  border: '1px solid rgba(180, 154, 104, 0.16)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      backgroundColor: '#A67C2E',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#ffffff',
                      flexShrink: 0,
                    }}
                  >
                    {userInitials}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#FAF8F4', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {currentUser?.name || t('role.specialist', 'Chuyên viên Kiểm dịch')}
                    </p>
                    <p style={{ fontSize: '10.5px', color: '#A5ACA1', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {currentUser?.email || t('role.specialist', 'Chuyên viên Kiểm dịch')}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowLogoutModal(true)}
                  title={t('common.logout', 'Đăng xuất')}
                  aria-label={t('common.logout', 'Đăng xuất')}
                  className="p-1.5 text-[#A5ACA1] hover:text-rose-400 rounded-lg hover:bg-white/10 transition-colors cursor-pointer bg-transparent border-0"
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
            className="fixed inset-0 z-50 flex md:hidden"
          >
            <div
              className="fixed inset-0 bg-[#181A17]/65 backdrop-blur-sm transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="w-[268px] bg-[#181A17] text-[#A5ACA1] flex flex-col h-[100dvh] relative z-50 border-r border-[#B49A68]/20 shadow-2xl">
              {/* Logo + Close */}
              <div className="h-[72px] flex items-center justify-between px-5 border-b border-white/10 shrink-0">
                <div className="flex items-center">
                  <div className="w-[36px] h-[36px] rounded-[10px] overflow-hidden flex items-center justify-center mr-3 bg-[#181A17] border border-[#B49A68]/45 shadow-md">
                    <img src="/logo.png" alt="EquiTransit" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <p className="text-[#FAF8F4] font-bold text-[15px] m-0 leading-tight">EquiTransit</p>
                    <span className="text-[10px] text-[#B49A68] font-bold tracking-widest">SPECIALIST</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label={t('common.closeMenu', 'Đóng menu điều hướng')}
                  className="w-10 h-10 flex items-center justify-center bg-transparent border-none text-[#A5ACA1] rounded-xl hover:bg-white/10 hover:text-white cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Nav links */}
              <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-6">
                <div>
                  <p className="px-3 text-[10px] font-semibold text-[#7E867B] uppercase tracking-widest mb-2">
                    {t('common.mainNav', 'Điều Hướng Chính')}
                  </p>
                  <nav className="flex flex-col gap-1">
                    {navItems.map((item) => {
                      const isActive =
                        item.href === '/specialist'
                          ? pathname === '/specialist'
                          : pathname?.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={isActive ? 'page' : undefined}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`no-underline flex items-center justify-between px-3 py-2.5 rounded-lg text-[13.5px] transition-colors ${
                            isActive
                              ? 'text-[#FAF8F4] bg-[#A67C2E]/20 border border-[#A67C2E]/40 font-semibold'
                              : 'text-[#A5ACA1] border border-transparent font-medium hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={isActive ? 'text-[#B49A68]' : 'text-[#7E867B]'}>{item.icon}</span>
                            <span>{item.label}</span>
                          </div>
                          {item.badge !== undefined && (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${
                                item.badgeColor === 'danger' ? 'bg-[#B33E3E]' : 'bg-[#A67C2E]'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </nav>
                </div>

                <div>
                  <p className="px-3 text-[10px] font-semibold text-[#7E867B] uppercase tracking-widest mb-2">
                    {t('coordinator.nav.systemAdmin', 'Quản Trị Hệ Thống')}
                  </p>
                  <nav className="flex flex-col gap-1">
                    {managementItems.map((item) => {
                      const isActive = pathname?.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={isActive ? 'page' : undefined}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`no-underline flex items-center justify-between px-3 py-2.5 rounded-lg text-[13.5px] transition-colors ${
                            isActive
                              ? 'text-[#FAF8F4] bg-[#A67C2E]/20 border border-[#A67C2E]/40 font-semibold'
                              : 'text-[#A5ACA1] border border-transparent font-medium hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={isActive ? 'text-[#B49A68]' : 'text-[#7E867B]'}>{item.icon}</span>
                            <span>{item.label}</span>
                          </div>
                          {item.badge !== undefined && (
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${
                                item.badgeColor === 'danger' ? 'bg-[#B33E3E]' : 'bg-[#A67C2E]'
                              }`}
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

              {/* Mobile Footer */}
              <div className="p-4 border-t border-white/10 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setShowSupportModal(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/5 text-[#FAF8F4] border-none cursor-pointer font-semibold text-[13px] hover:bg-white/10"
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
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-rose-500/10 text-rose-400 border-none cursor-pointer font-semibold text-[13px]"
                >
                  <LogOut size={16} />
                  <span>{t('common.logout', 'Đăng xuất')}</span>
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden relative z-10">
          {/* TOP HEADER */}
          <header className="liquid-glass-header h-[72px] bg-[#FAF8F4]/90 backdrop-blur-md border-b border-[#E5DFD3] flex items-center justify-between px-4 sm:px-6 shrink-0 z-30 gap-3">
            {/* Left: Mobile Menu Toggle & Title */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label={t('common.openMenu', 'Mở menu điều hướng')}
                className="md:hidden w-10 h-10 rounded-xl bg-transparent border-none cursor-pointer text-[#242722] hover:bg-[#F0EEE8] flex items-center justify-center shrink-0"
              >
                <Menu size={22} />
              </button>
              <div className="min-w-0">
                <p className="text-[15px] sm:text-[17px] font-bold text-[#181A17] m-0 leading-tight truncate">
                  {t('specialist.workbenchTitle', 'Không Gian Kiểm Dịch & Pháp Lý')}
                </p>
                <p className="text-[13px] text-[#5C6658] mt-0.5 mb-0 font-medium hidden sm:block truncate">
                  {t(
                    'specialist.workbenchSubtitle',
                    'Nghiệp vụ y tế, kiểm dịch sinh học và hải quan xuất nhập cảnh ngựa đua.'
                  )}
                </p>
              </div>
            </div>

            {/* Center: Search */}
            <div className="hidden lg:flex items-center bg-white/80 border border-[#E5DFD3] rounded-lg px-3 py-2 w-72 xl:w-96 relative focus-within:ring-2 focus-within:ring-[#A67C2E]/20 focus-within:border-[#A67C2E] transition-all">
              <Search size={15} className="text-[#7E867B] mr-2 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                aria-label={t('specialist.searchPlaceholder', 'Tìm kiếm hồ sơ, đơn hàng, mã ngựa...')}
                placeholder={t('specialist.searchPlaceholder', 'Tìm kiếm hồ sơ, đơn hàng, mã ngựa...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchTerm.trim()) {
                    router.push(`/specialist/documents?search=${encodeURIComponent(searchTerm.trim())}`);
                  }
                }}
                className="border-none outline-none bg-transparent text-[13.5px] text-[#181A17] w-full placeholder-[#7E867B]"
              />
              <span
                aria-hidden="true"
                className="text-[10.5px] font-bold text-[#7E867B] bg-[#FAF8F4] border border-[#E5DFD3] px-1.5 py-0.5 rounded shrink-0"
              >
                ⌘K
              </span>
            </div>

            {/* Right: Actions & User */}
            <div className="flex items-center gap-3 shrink-0">
              <LanguageSwitcher variant="pill" />

              <button
                type="button"
                onClick={() => router.push('/specialist/notifications')}
                aria-label={
                  unreadNotifs > 0
                    ? `${t('common.notifications', 'Thông báo')} (${unreadNotifs})`
                    : t('common.notifications', 'Thông báo')
                }
                title={t('common.notifications', 'Thông báo')}
                className="w-9 h-9 rounded-full border border-[#E5DFD3] flex items-center justify-center text-[#5C6658] hover:text-[#181A17] hover:border-[#C4B38E] bg-[#FAF8F4] relative cursor-pointer transition-colors shadow-sm"
              >
                <Bell size={16} />
                {unreadNotifs > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#B33E3E] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-sm"
                  >
                    {unreadNotifs > 99 ? '99+' : unreadNotifs}
                  </span>
                )}
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowUserMenu((v) => !v)}
                  aria-expanded={showUserMenu}
                  aria-haspopup="menu"
                  className="flex items-center gap-2.5 bg-[#FAF8F4] border border-[#E5DFD3] hover:border-[#C4B38E] rounded-full pl-1 pr-3 py-1 cursor-pointer transition-colors"
                >
                  <div className="w-[30px] h-[30px] rounded-full bg-[#A67C2E] text-white flex items-center justify-center text-xs font-bold">
                    {userInitials}
                  </div>
                  <div className="hidden sm:block text-left leading-tight">
                    <p className="text-[13px] font-semibold text-[#181A17] m-0">
                      {currentUser?.name || t('role.specialist', 'Chuyên viên Kiểm dịch')}
                    </p>
                    <p className="text-[10px] text-[#5C6658] m-0 font-medium flex items-center gap-1">
                      {language === 'en' ? 'Specialist' : 'Chuyên viên'} <ChevronDown size={10} />
                    </p>
                  </div>
                </button>

                {showUserMenu && (
                  <>
                    <div onClick={() => setShowUserMenu(false)} className="fixed inset-0 z-50" />
                    <div
                      role="menu"
                      className="absolute right-0 mt-2 w-56 bg-white border border-[#E5DFD3] rounded-xl shadow-xl p-1.5 z-[60] flex flex-col gap-0.5"
                    >
                      <div className="px-3 py-2 border-b border-[#F0EEE8] mb-1">
                        <p className="text-xs font-bold text-[#181A17] m-0 truncate">
                          {currentUser?.name || t('role.specialist', 'Chuyên viên Kiểm dịch')}
                        </p>
                        {currentUser?.email && (
                          <p className="text-[11px] text-[#5C6658] m-0 mt-0.5 truncate">{currentUser.email}</p>
                        )}
                      </div>
                      <Link
                        role="menuitem"
                        href="/specialist/settings"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#2C2F2A] rounded-lg hover:bg-[#FAF8F4] no-underline"
                      >
                        <Settings size={14} className="text-[#5C6658]" />
                        <span>{t('common.accountSettings', 'Cài đặt tài khoản')}</span>
                      </Link>
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          setShowUserMenu(false);
                          setShowSupportModal(true);
                        }}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#2C2F2A] rounded-lg hover:bg-[#FAF8F4] text-left cursor-pointer w-full border-0 bg-transparent"
                      >
                        <HelpCircle size={14} className="text-[#5C6658]" />
                        <span>{t('common.helpSupport', 'Trợ Giúp & Hỗ Trợ')}</span>
                      </button>
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          setShowUserMenu(false);
                          setShowLogoutModal(true);
                        }}
                        className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[#B33E3E] rounded-lg hover:bg-rose-50 text-left cursor-pointer w-full border-0 bg-transparent"
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
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="max-w-[1400px] mx-auto">{children}</div>
          </div>
        </main>
        <HelpSupportModal isOpen={showSupportModal} onClose={() => setShowSupportModal(false)} />
      </div>
    </DocumentStoreProvider>
  );
}
