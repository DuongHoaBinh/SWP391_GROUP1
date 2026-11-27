'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Truck,
  Crosshair,
  Stethoscope,
  AlertTriangle,
  Bell,
  User,
  HelpCircle,
  LogOut,
  Menu,
  X,
  Pin,
  PinOff,
  ChevronDown,
  Search,
} from 'lucide-react';
import { getAuthToken, getCurrentUser, logout } from '@/lib/auth';
import { getDashboardRouteForRole } from '@/lib/auth-redirect';
import { LogoutConfirmModal } from '@/components/layout/LogoutConfirmModal';
import { HelpSupportModal } from '@/components/layout/HelpSupportModal';
import { PortalLoadingSkeleton } from '@/components/layout/PortalLoadingSkeleton';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { apiClient } from '@/lib/api-client';
import { AmbientCanvas } from '@/components/layout/AmbientCanvas';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
}

function computeStaffInitials(rawName: string, fallback: string): string {
  const cleaned = rawName
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(BS|TS|ThS|Dr|Mr|Ms|Mrs)\.?\b/gi, ' ')
    .trim();
  const words = cleaned
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w));
  if (words.length >= 2) {
    const firstChar = Array.from(words[0])[0] || '';
    const lastChar = Array.from(words[words.length - 1])[0] || '';
    return `${firstChar}${lastChar}`.toLocaleUpperCase('vi-VN');
  }
  if (words.length === 1) {
    return Array.from(words[0]).slice(0, 2).join('').toLocaleUpperCase('vi-VN');
  }
  return fallback;
}

export default function DriverLayout({
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
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [activeUser, setActiveUser] = useState<ReturnType<typeof getCurrentUser> | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const leaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
        setShowUserMenu(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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

  const currentPersona =
    activeUser?.persona === 'escort' ||
    activeUser?.specialization === 'escort' ||
    activeUser?.email?.toLowerCase().includes('escort')
      ? 'escort'
      : 'driver';

  const fetchUnread = useCallback(async () => {
    try {
      const notifs = await apiClient<any[]>('/notifications');
      if (Array.isArray(notifs)) {
        setUnreadNotifs(notifs.filter((n) => !n.isRead).length);
      }
    } catch {
      // ignore background poll failures
    }
  }, []);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      const target = pathnameRef.current || '/driver';
      router.replace(`/login?redirect=${encodeURIComponent(target)}`);
      return;
    }

    const user = getCurrentUser();
    const roleUpper = String(user?.role || '').toUpperCase();
    if (roleUpper && roleUpper !== 'DRIVER_ESCORT' && roleUpper !== 'DRIVER' && roleUpper !== 'ADMIN') {
      router.replace(getDashboardRouteForRole(user?.role || ''));
      return;
    }

    if (user && !user.persona) {
      const fallbackPersona: 'escort' | 'driver' = user.email?.toLowerCase().includes('escort')
        ? 'escort'
        : 'driver';
      setActiveUser({ ...user, persona: fallbackPersona });
    } else {
      setActiveUser(user);
    }

    setIsAuthorized(true);
    void fetchUnread();

    const handleNotificationsUpdated = () => {
      void fetchUnread();
    };
    const handleAuthUpdated = () => {
      void fetchUnread();
      setActiveUser(getCurrentUser());
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

  const isEscortRole = currentPersona === 'escort' || Boolean(pathname?.startsWith('/escort'));
  const basePath = isEscortRole ? '/escort' : '/driver';

  const navItems: NavItem[] = [
    {
      label: t('nav.dashboard', language === 'en' ? 'Dashboard' : 'Tổng quan'),
      href: basePath,
      icon: <LayoutDashboard size={18} aria-hidden="true" />,
    },
    {
      label: t('driver.nav.myTrips', language === 'en' ? 'My Trips' : 'Chuyến đi'),
      href: `${basePath}/trips`,
      icon: <Truck size={18} aria-hidden="true" />,
    },
    {
      label: t('driver.nav.tripStatus', language === 'en' ? 'Check-in Console' : 'Điều hành chuyến'),
      href: `${basePath}/status`,
      icon: <Crosshair size={18} aria-hidden="true" />,
    },
    {
      label: t('driver.nav.health', language === 'en' ? 'Equine Health' : 'Sức khỏe ngựa'),
      href: `${basePath}/health`,
      icon: <Stethoscope size={18} aria-hidden="true" />,
    },
    {
      label: t('driver.nav.incidents', language === 'en' ? 'Incidents' : 'Báo cáo sự cố'),
      href: `${basePath}/incidents`,
      icon: <AlertTriangle size={18} aria-hidden="true" />,
    },
  ];

  const mobileBottomNavItems: NavItem[] = [
    {
      label: language === 'en' ? 'Home' : 'Tổng quan',
      href: basePath,
      icon: <LayoutDashboard size={19} aria-hidden="true" />,
    },
    {
      label: language === 'en' ? 'Trips' : 'Chuyến đi',
      href: `${basePath}/trips`,
      icon: <Truck size={19} aria-hidden="true" />,
    },
    {
      label: language === 'en' ? 'Check-in' : 'Check-in',
      href: `${basePath}/status`,
      icon: <Crosshair size={19} aria-hidden="true" />,
    },
    {
      label: language === 'en' ? 'Health' : 'Sức khỏe',
      href: `${basePath}/health`,
      icon: <Stethoscope size={19} aria-hidden="true" />,
    },
    {
      label: language === 'en' ? 'Incidents' : 'Sự cố',
      href: `${basePath}/incidents`,
      icon: <AlertTriangle size={19} aria-hidden="true" />,
    },
  ];

  const managementItems: NavItem[] = [
    {
      label: t('common.notifications', language === 'en' ? 'Notifications' : 'Thông báo'),
      href: `${basePath}/notifications`,
      icon: <Bell size={18} aria-hidden="true" />,
      badge: unreadNotifs > 0 ? unreadNotifs : undefined,
    },
    {
      label: t('common.settings', language === 'en' ? 'Profile' : 'Hồ sơ'),
      href: `${basePath}/profile`,
      icon: <User size={18} aria-hidden="true" />,
    },
  ];

  const isNavItemActive = (href: string) => {
    if (href === basePath || href === '/driver' || href === '/escort') {
      return pathname === '/driver' || pathname === '/escort';
    }
    const driverVariant = href.replace(/^\/escort/, '/driver');
    const escortVariant = href.replace(/^\/driver/, '/escort');
    return Boolean(
      pathname === href ||
        pathname?.startsWith(`${href}/`) ||
        pathname === driverVariant ||
        pathname?.startsWith(`${driverVariant}/`) ||
        pathname === escortVariant ||
        pathname?.startsWith(`${escortVariant}/`),
    );
  };

  const getDynamicHeaderMeta = (): { title: string; subtitle: string } => {
    const normalized = (pathname || '').replace(/^\/escort/, '/driver');
    const isEn = language === 'en';
    if (/^\/driver\/trips\/\d+/.test(normalized) || normalized.startsWith('/driver/status')) {
      return {
        title: isEn ? 'Field Trip Console' : 'Điều Hành Chuyến & Check-in',
        subtitle: isEn
          ? 'Live route milestones, GPS map, equine vitals & handover.'
          : 'Check-in mốc lộ trình, bản đồ GPS, sinh hiệu ngựa & bàn giao.',
      };
    }
    if (normalized.startsWith('/driver/trips')) {
      return {
        title: isEn ? 'Assigned Trips' : 'Danh Sách Chuyến Đi',
        subtitle: isEn
          ? 'Accept dispatch assignments and review transport itineraries.'
          : 'Xác nhận nhận chuyến và xem chi tiết các chặng vận chuyển.',
      };
    }
    if (normalized.startsWith('/driver/health')) {
      return {
        title: isEn ? 'Equine Health & Vitals' : 'Sức Khỏe & Sinh Hiệu Ngựa',
        subtitle: isEn
          ? 'Log temperature, heart rate, respiration and clinical observations.'
          : 'Ghi nhận thân nhiệt, nhịp tim, nhịp thở và quan sát lâm sàng.',
      };
    }
    if (normalized.startsWith('/driver/incidents')) {
      return {
        title: isEn ? 'Incident & Emergency Reports' : 'Báo Cáo Sự Cố Thực Địa',
        subtitle: isEn
          ? 'Report traffic delays, vehicle faults, border issues or equine emergencies.'
          : 'Khai báo kẹt xe, hỏng xe, cửa khẩu hoặc cấp cứu thú y khẩn cấp.',
      };
    }
    if (normalized.startsWith('/driver/notifications')) {
      return {
        title: isEn ? 'Dispatch Notifications' : 'Thông Báo Điều Phối',
        subtitle: isEn
          ? 'Trip assignments, schedule changes and urgent operational alerts.'
          : 'Lệnh phân công chuyến, cập nhật lịch trình và cảnh báo khẩn.',
      };
    }
    if (normalized.startsWith('/driver/profile')) {
      return {
        title: isEn ? 'Crew Profile & Security' : 'Hồ Sơ Nhân Sự',
        subtitle: isEn
          ? 'Contact information, field specialization and password settings.'
          : 'Thông tin liên hệ, chuyên môn thực địa và bảo mật tài khoản.',
      };
    }
    return {
      title: isEn ? 'Field Operations' : 'Tổng Quan Thực Địa',
      subtitle: isEn
        ? 'Assigned trips, active milestone check-ins, and equine care.'
        : 'Theo dõi chuyến được giao, check-in mốc và chăm sóc ngựa.',
    };
  };

  const headerMeta = getDynamicHeaderMeta();

  const roleTitleText = isEscortRole
    ? language === 'en'
      ? 'Equine Vet / Escort'
      : 'Bác sĩ thú y / Áp tải'
    : language === 'en'
    ? 'Driver'
    : 'Tài xế';

  const rawUserName = (activeUser?.fullName || activeUser?.name || '')
    .replace(/\s*\((Tài xế|Driver|Bác sĩ thú y|Áp tải|Escort|Vet|Equine Vet)\)\s*/gi, '')
    .trim();
  const userDisplayName = rawUserName || roleTitleText;
  const showRoleUnderName = userDisplayName.toLowerCase() !== roleTitleText.toLowerCase();
  const userInitials = computeStaffInitials(
    userDisplayName,
    isEscortRole ? 'BS' : 'TX',
  );

  const handleLogoutConfirm = () => {
    setShowLogoutModal(false);
    logout();
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100dvh',
        maxHeight: '100dvh',
        overflow: 'hidden',
        backgroundColor: '#F4F1E9',
        fontFamily: "'Inter', sans-serif",
        position: 'relative',
      }}
    >
      <AmbientCanvas />
      <CommandPalette />

        <LogoutConfirmModal
          isOpen={showLogoutModal}
          onClose={() => setShowLogoutModal(false)}
          onConfirm={handleLogoutConfirm}
        />

        {/* LEFT SIDEBAR (DESKTOP) */}
        <aside
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className="hidden lg:flex liquid-glass-sidebar shrink-0 flex-col"
          style={{
            width: isExpanded ? '260px' : '76px',
            color: '#94a3b8',
            height: '100%',
            position: 'sticky',
            top: 0,
            zIndex: 40,
            borderRight: '1px solid rgba(255, 255, 255, 0.06)',
            overflowX: isExpanded ? 'hidden' : 'visible',
            transition: 'width 0.28s cubic-bezier(0.2, 0, 0, 1)',
          }}
        >
          {/* Brand Header */}
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
                    ? t('coordinator.pinTooltip', language === 'en' ? 'Pin sidebar' : 'Ghim thanh điều hướng')
                    : t('coordinator.unpinTooltip', language === 'en' ? 'Unpin sidebar' : 'Bỏ ghim thanh điều hướng')
                }
                title={
                  !isPinned
                    ? t('coordinator.pinTooltip', language === 'en' ? 'Hover to auto-expand. Click to pin.' : 'Di chuột để mở rộng. Bấm để ghim.')
                    : t('coordinator.unpinTooltip', language === 'en' ? 'Pinned. Click to unpin.' : 'Đã ghim. Bấm để bỏ ghim.')
                }
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '9px',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: !isExpanded ? '0' : '12px',
                  boxShadow: '0 0 14px rgba(180, 154, 104, 0.25)',
                  backgroundColor: '#181A17',
                  border: '1px solid rgba(196, 179, 142, 0.35)',
                  padding: 0,
                  flexShrink: 0,
                  cursor: 'pointer',
                }}
              >
                <img src="/logo.png" alt="EquiTransit" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </button>
              {isExpanded && (
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  <p style={{ color: '#F7F7F4', fontWeight: 800, fontSize: '14px', letterSpacing: '0.02em', lineHeight: 1.2, margin: 0 }}>
                    EquiTransit
                    <br />
                    <span style={{ fontSize: '10px', color: '#C4B38E', fontWeight: 600 }}>
                      {isEscortRole ? 'ESCORT & VET' : 'DRIVER OPS'}
                    </span>
                  </p>
                </div>
              )}
            </div>

            {isExpanded && (
              <button
                type="button"
                onClick={togglePin}
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all cursor-pointer ${
                  isPinned
                    ? 'bg-[#C4B38E]/25 text-[#C4B38E] border border-[#C4B38E]/40 shadow-sm'
                    : 'text-[#94a3b8] hover:text-white hover:bg-white/10'
                }`}
                title={
                  isPinned
                    ? t('coordinator.unpinTooltip', language === 'en' ? 'Unpin sidebar' : 'Bỏ ghim thanh bên')
                    : t('coordinator.pinTooltip', language === 'en' ? 'Pin sidebar' : 'Ghim thanh bên')
                }
                aria-label={
                  isPinned
                    ? language === 'en'
                      ? 'Unpin sidebar'
                      : 'Bỏ ghim thanh bên'
                    : language === 'en'
                    ? 'Pin sidebar'
                    : 'Ghim thanh bên'
                }
              >
                {isPinned ? <Pin size={15} className="rotate-45 text-[#C4B38E]" aria-hidden="true" /> : <PinOff size={15} aria-hidden="true" />}
              </button>
            )}
          </div>

          {/* Navigation Groups */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
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
                <p style={{ padding: '0 12px', fontSize: '10px', fontWeight: 700, color: '#8A8478', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                  {t('nav.overview', language === 'en' ? 'Overview' : 'Tổng quan')}
                </p>
              )}
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {navItems.map((item) => {
                  const isActive = isNavItemActive(item.href);

                  if (!isExpanded) {
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-label={item.label}
                        className="relative group flex items-center justify-center py-1 no-underline"
                      >
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:bg-[#C4B38E]/20 group-hover:text-[#C4B38E] ${
                            isActive
                              ? 'bg-[#C4B38E]/25 text-[#C4B38E] border border-[#C4B38E]/40 shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {item.icon}
                        </div>

                        {item.badge !== undefined && (
                          <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-[#A67C2E] ring-2 ring-[#181A17] animate-pulse" />
                        )}

                        <div className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-[#181A17]/95 backdrop-blur-md text-[#F7F7F4] text-xs font-bold whitespace-nowrap shadow-2xl border border-[#C4B38E]/30 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50 flex items-center gap-2 -translate-x-1.5 group-hover:translate-x-0">
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
                        minHeight: '42px',
                        padding: '9px 12px',
                        borderRadius: '10px',
                        fontSize: '13.5px',
                        fontWeight: isActive ? 600 : 500,
                        color: isActive ? '#F7F7F4' : '#A8A39A',
                        backgroundColor: isActive ? 'rgba(196, 179, 142, 0.14)' : 'transparent',
                        border: isActive ? '1px solid rgba(196, 179, 142, 0.25)' : '1px solid transparent',
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ color: isActive ? '#C4B38E' : '#747D88' }}>{item.icon}</span>
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
                <p style={{ padding: '0 12px', fontSize: '10px', fontWeight: 700, color: '#8A8478', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                  {t('nav.management', language === 'en' ? 'Account & Operations' : 'Quản lý & Tài khoản')}
                </p>
              )}
              <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {managementItems.map((item) => {
                  const isActive = isNavItemActive(item.href);

                  if (!isExpanded) {
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-label={item.label}
                        className="relative group flex items-center justify-center py-1 no-underline"
                      >
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:bg-[#C4B38E]/20 group-hover:text-[#C4B38E] ${
                            isActive
                              ? 'bg-[#C4B38E]/25 text-[#C4B38E] border border-[#C4B38E]/40 shadow-sm'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {item.icon}
                        </div>

                        {item.badge !== undefined && (
                          <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-[#A67C2E] ring-2 ring-[#181A17] animate-pulse" />
                        )}

                        <div className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-[#181A17]/95 backdrop-blur-md text-[#F7F7F4] text-xs font-bold whitespace-nowrap shadow-2xl border border-[#C4B38E]/30 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50 flex items-center gap-2 -translate-x-1.5 group-hover:translate-x-0">
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
                        minHeight: '42px',
                        padding: '9px 12px',
                        borderRadius: '10px',
                        fontSize: '13.5px',
                        fontWeight: isActive ? 600 : 500,
                        color: isActive ? '#F7F7F4' : '#A8A39A',
                        backgroundColor: isActive ? 'rgba(196, 179, 142, 0.14)' : 'transparent',
                        border: isActive ? '1px solid rgba(196, 179, 142, 0.25)' : '1px solid transparent',
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ color: isActive ? '#C4B38E' : '#747D88' }}>{item.icon}</span>
                        <span>{item.label}</span>
                      </div>

                      {item.badge !== undefined && (
                        <span
                          style={{
                            backgroundColor: '#A67C2E',
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
          <div style={{ padding: !isExpanded ? '16px 8px' : '16px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {!isExpanded ? (
              <button
                type="button"
                aria-label={t('common.helpSupport', language === 'en' ? 'Help & Support' : 'Trợ Giúp & Hỗ Trợ')}
                onClick={() => setShowSupportModal(true)}
                className="relative group flex items-center justify-center py-1 bg-transparent border-0 cursor-pointer w-full"
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all duration-200 group-hover:scale-110">
                  <HelpCircle size={18} aria-hidden="true" />
                </div>
                <div className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-[#181A17]/95 backdrop-blur-md text-[#F7F7F4] text-xs font-bold whitespace-nowrap shadow-2xl border border-[#C4B38E]/30 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50 -translate-x-1.5 group-hover:translate-x-0">
                  <span>{t('common.helpSupport', language === 'en' ? 'Help & Support' : 'Trợ Giúp & Hỗ Trợ')}</span>
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowSupportModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  minHeight: '40px',
                  padding: '8px 12px',
                  fontSize: '13px',
                  color: '#A8A39A',
                  background: 'none',
                  border: 'none',
                  borderRadius: '8px',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                }}
              >
                <HelpCircle size={17} color="#8A8478" aria-hidden="true" />
                <span>{t('common.helpSupport', language === 'en' ? 'Help & Support' : 'Trợ Giúp & Hỗ Trợ')}</span>
              </button>
            )}

            {!isExpanded ? (
              <div className="flex flex-col items-center gap-2 pt-1">
                <div className="relative group cursor-pointer" title={userDisplayName}>
                  <div
                    className={`w-10 h-10 rounded-xl text-[#C4B38E] flex items-center justify-center font-bold text-xs shadow-md group-hover:scale-110 transition-all border border-[#C4B38E]/40 ${
                      isEscortRole ? 'bg-[#2D5A3F]' : 'bg-[#181A17]'
                    }`}
                  >
                    {userInitials}
                  </div>
                  <div className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-[#181A17]/95 backdrop-blur-md text-[#F7F7F4] text-xs font-bold whitespace-nowrap shadow-2xl border border-[#C4B38E]/30 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50 -translate-x-1.5 group-hover:translate-x-0">
                    <div className="font-extrabold text-white">{userDisplayName}</div>
                    <div className="text-[10px] text-[#C4B38E] font-normal">{roleTitleText}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowLogoutModal(true)}
                  className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-all cursor-pointer"
                  title={t('common.logout', language === 'en' ? 'Log out' : 'Đăng xuất')}
                  aria-label={t('common.logout', language === 'en' ? 'Log out' : 'Đăng xuất')}
                >
                  <LogOut size={16} aria-hidden="true" />
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
                  border: '1px solid rgba(196, 179, 142, 0.16)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      backgroundColor: isEscortRole ? '#2D5A3F' : '#A67C2E',
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
                    <p
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#F7F7F4',
                        margin: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={userDisplayName}
                    >
                      {userDisplayName}
                    </p>
                    <p
                      style={{
                        fontSize: '10px',
                        color: '#C4B38E',
                        margin: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {roleTitleText}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowLogoutModal(true)}
                  title={t('common.logout', language === 'en' ? 'Log out' : 'Đăng xuất')}
                  aria-label={t('common.logout', language === 'en' ? 'Log out' : 'Đăng xuất')}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-[#94a3b8] hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer shrink-0"
                >
                  <LogOut size={16} aria-hidden="true" />
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
            aria-label={language === 'en' ? 'Mobile Navigation' : 'Điều hướng di động'}
            className="fixed inset-0 z-50 flex lg:hidden"
          >
            <div
              className="fixed inset-0 bg-black/55 backdrop-blur-sm transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside
              style={{
                width: '272px',
                maxWidth: '85vw',
                backgroundColor: '#181A17',
                color: '#A8A39A',
                display: 'flex',
                flexDirection: 'column',
                height: '100dvh',
                position: 'relative',
                zIndex: 51,
              }}
            >
              {/* Logo + Close */}
              <div
                style={{
                  height: '72px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 16px',
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
                      marginRight: '10px',
                      backgroundColor: '#181A17',
                      border: '1px solid rgba(196, 179, 142, 0.35)',
                    }}
                  >
                    <img src="/logo.png" alt="EquiTransit" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <p style={{ color: '#F7F7F4', fontWeight: 800, fontSize: '14px', margin: 0, lineHeight: 1.2 }}>
                    EquiTransit{' '}
                    <span style={{ display: 'block', fontSize: '10px', color: '#C4B38E', fontWeight: 600 }}>
                      {isEscortRole ? 'ESCORT & VET' : 'DRIVER OPS'}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label={language === 'en' ? 'Close navigation' : 'Đóng menu điều hướng'}
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-[#A8A39A] hover:text-white hover:bg-white/10 cursor-pointer"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>

              {/* Drawer Nav links */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div>
                  <p style={{ padding: '0 12px', fontSize: '10px', fontWeight: 700, color: '#8A8478', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                    {t('nav.overview', language === 'en' ? 'Overview' : 'Tổng quan')}
                  </p>
                  <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {navItems.map((item) => {
                      const active = isNavItemActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            minHeight: '44px',
                            padding: '10px 12px',
                            borderRadius: '10px',
                            fontSize: '14px',
                            fontWeight: active ? 600 : 500,
                            color: active ? '#F7F7F4' : '#A8A39A',
                            backgroundColor: active ? 'rgba(196, 179, 142, 0.16)' : 'transparent',
                            border: active ? '1px solid rgba(196, 179, 142, 0.28)' : '1px solid transparent',
                            textDecoration: 'none',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ color: active ? '#C4B38E' : '#747D88' }}>{item.icon}</span>
                            {item.label}
                          </span>
                        </Link>
                      );
                    })}
                  </nav>
                </div>

                <div>
                  <p style={{ padding: '0 12px', fontSize: '10px', fontWeight: 700, color: '#8A8478', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                    {t('nav.management', language === 'en' ? 'Account & Operations' : 'Quản lý & Tài khoản')}
                  </p>
                  <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {managementItems.map((item) => {
                      const active = isNavItemActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            minHeight: '44px',
                            padding: '10px 12px',
                            borderRadius: '10px',
                            fontSize: '14px',
                            fontWeight: active ? 600 : 500,
                            color: active ? '#F7F7F4' : '#A8A39A',
                            backgroundColor: active ? 'rgba(196, 179, 142, 0.16)' : 'transparent',
                            border: active ? '1px solid rgba(196, 179, 142, 0.28)' : '1px solid transparent',
                            textDecoration: 'none',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ color: active ? '#C4B38E' : '#747D88' }}>{item.icon}</span>
                            {item.label}
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

                <div style={{ paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setShowSupportModal(true);
                    }}
                    className="w-full min-h-[44px] flex items-center gap-2.5 px-3 rounded-xl text-sm font-medium text-[#A8A39A] hover:text-white hover:bg-white/5 cursor-pointer"
                  >
                    <HelpCircle size={18} className="text-[#C4B38E]" aria-hidden="true" />
                    <span>{t('common.helpSupport', language === 'en' ? 'Help & Support' : 'Trợ Giúp & Hỗ Trợ')}</span>
                  </button>
                </div>
              </div>

              {/* Drawer User Identity + Logout */}
              <div style={{ padding: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    border: '1px solid rgba(196, 179, 142, 0.16)',
                  }}
                >
                  <div
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '50%',
                      backgroundColor: isEscortRole ? '#2D5A3F' : '#A67C2E',
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
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#F7F7F4', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {userDisplayName}
                    </p>
                    <p style={{ fontSize: '11px', color: '#C4B38E', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {roleTitleText}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setShowLogoutModal(true);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    width: '100%',
                    minHeight: '44px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(158, 59, 59, 0.16)',
                    color: '#FCA5A5',
                    border: '1px solid rgba(158, 59, 59, 0.35)',
                    cursor: 'pointer',
                    fontSize: '13.5px',
                    fontWeight: 600,
                  }}
                >
                  <LogOut size={16} aria-hidden="true" />
                  <span>{t('common.logout', language === 'en' ? 'Log out' : 'Đăng xuất')}</span>
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* MAIN CONTENT AREA */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
          {/* TOP HEADER */}
          <header
            className="liquid-glass-header px-3.5 sm:px-6"
            style={{
              height: '72px',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              borderBottom: '1px solid #EAE5DA',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              position: 'sticky',
              top: 0,
              zIndex: 30,
              flexShrink: 0,
            }}
          >
            {/* Left: Mobile Menu + Portal Subtitle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label={language === 'en' ? 'Open mobile navigation' : 'Mở menu điều hướng'}
                className="lg:hidden w-9 h-9 sm:w-11 sm:h-11 rounded-xl border border-[#D8CEBE] bg-[#FAF8F4] flex items-center justify-center cursor-pointer shrink-0 hover:bg-[#F3EFE4]"
              >
                <Menu size={18} className="text-[#181A17]" aria-hidden="true" />
              </button>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontWeight: 700, color: '#181A17', margin: 0, lineHeight: 1.2 }} className="text-[14px] sm:text-[15px] truncate">
                  {headerMeta.title}
                </p>
              </div>
            </div>

            {/* Right: Quick Search + Language Switcher + Bell + User Menu */}
            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
                aria-label={language === 'en' ? 'Quick search (Ctrl+K)' : 'Tìm nhanh (Ctrl+K)'}
                title={language === 'en' ? 'Quick search (Ctrl+K)' : 'Tìm nhanh (Ctrl+K)'}
                className="min-h-[36px] sm:min-h-[40px] px-2 sm:px-3 rounded-xl border border-[#D8CEBE] bg-[#FAF8F4] hover:bg-[#F3EFE4] text-[#57564E] hover:text-[#181A17] inline-flex items-center gap-2 text-xs font-semibold cursor-pointer transition-colors shrink-0"
              >
                <Search size={15} className="text-[#A67C2E]" aria-hidden="true" />
                <span className="hidden md:inline">{language === 'en' ? 'Quick search' : 'Tìm nhanh'}</span>
                <kbd className="hidden xl:inline-flex items-center px-1.5 py-0.5 rounded bg-white border border-[#D8CEBE] text-[10px] font-mono text-[#747D88]">
                  ⌘K
                </kbd>
              </button>

              <div className="hidden sm:block">
                <LanguageSwitcher variant="pill" />
              </div>

              <button
                type="button"
                onClick={() => router.push(`${basePath}/notifications`)}
                aria-label={t('common.notifications', language === 'en' ? 'Notifications' : 'Thông báo')}
                className="w-9 h-9 sm:w-11 sm:h-11 rounded-full border border-[#D8CEBE] flex items-center justify-center text-[#181A17] bg-white hover:bg-[#FAF8F4] relative cursor-pointer transition-colors shrink-0"
              >
                <Bell size={17} aria-hidden="true" />
                {unreadNotifs > 0 && (
                  <span className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 w-2 h-2 rounded-full bg-[#9E3B3B] ring-2 ring-white" />
                )}
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowUserMenu((v) => !v)}
                  aria-expanded={showUserMenu}
                  aria-haspopup="menu"
                  aria-label={t('common.accountMenu', language === 'en' ? 'Account menu' : 'Menu tài khoản')}
                  className="min-h-[36px] sm:min-h-[44px] flex items-center gap-1.5 sm:gap-2 bg-[#FAF8F4] hover:bg-[#F3EFE4] border border-[#D8CEBE] rounded-full py-0.5 sm:py-1 pl-1 sm:pl-1.5 pr-1.5 sm:pr-2.5 cursor-pointer transition-colors"
                >
                  <div
                    className={`w-8 h-8 rounded-full text-[#C4B38E] flex items-center justify-center text-xs font-bold shrink-0 ${
                      isEscortRole ? 'bg-[#2D5A3F]' : 'bg-[#181A17]'
                    }`}
                  >
                    {userInitials}
                  </div>
                  <div className="text-left leading-tight hidden md:block">
                    <p className="text-xs font-semibold text-[#181A17] m-0 max-w-[140px] truncate">
                      {userDisplayName}
                    </p>
                    {showRoleUnderName && (
                      <p className="text-[10px] font-bold m-0" style={{ color: isEscortRole ? '#2D5A3F' : '#A67C2E' }}>
                        {roleTitleText}
                      </p>
                    )}
                  </div>
                  <ChevronDown size={13} className="text-[#57564E]" aria-hidden="true" />
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
                        href={`${basePath}/profile`}
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-2 px-3 min-h-[40px] text-xs font-semibold text-[#181A17] rounded-lg hover:bg-[#FAF8F4] no-underline"
                      >
                        <User size={14} className="text-[#57564E]" aria-hidden="true" />
                        <span>{t('common.settings', language === 'en' ? 'Profile & Credentials' : 'Hồ sơ nhân sự')}</span>
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setShowUserMenu(false);
                          setShowSupportModal(true);
                        }}
                        className="flex items-center gap-2 px-3 min-h-[40px] text-xs font-semibold text-[#181A17] rounded-lg hover:bg-[#FAF8F4] text-left cursor-pointer w-full"
                      >
                        <HelpCircle size={14} className="text-[#57564E]" aria-hidden="true" />
                        <span>{t('common.helpSupport', language === 'en' ? 'Help & Support' : 'Trợ Giúp & Hỗ Trợ')}</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setShowUserMenu(false);
                          setShowLogoutModal(true);
                        }}
                        className="flex items-center gap-2 px-3 min-h-[40px] text-xs font-semibold text-[#9E3B3B] rounded-lg hover:bg-rose-50 text-left cursor-pointer w-full"
                      >
                        <LogOut size={14} aria-hidden="true" />
                        <span>{t('common.logout', language === 'en' ? 'Log out' : 'Đăng xuất')}</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          {/* Content Container */}
          <div
            style={{ flex: 1, overflowY: 'auto', backgroundColor: 'transparent' }}
            className="p-3.5 sm:p-5 lg:p-6 pb-24 lg:pb-6"
          >
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>{children}</div>
          </div>

          {/* STICKY MOBILE BOTTOM NAVIGATION BAR */}
          <nav
            aria-label={language === 'en' ? 'Mobile quick navigation' : 'Điều hướng nhanh di động'}
            className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#D8CEBE] shadow-[0_-4px_16px_rgba(24,26,23,0.08)] px-1.5 py-1"
            style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}
          >
            <div className="grid grid-cols-5 gap-0.5 max-w-lg mx-auto">
              {mobileBottomNavItems.map((item) => {
                const active = isNavItemActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 no-underline transition-colors ${
                      active
                        ? 'bg-[#181A17] text-[#C4B38E] font-bold'
                        : 'text-[#5F6977] hover:text-[#181A17] hover:bg-[#FAF8F4] font-medium'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span className="text-[10px] leading-tight truncate max-w-full">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </main>

        <HelpSupportModal isOpen={showSupportModal} onClose={() => setShowSupportModal(false)} />
      </div>
  );
}
