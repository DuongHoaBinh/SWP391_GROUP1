'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Truck,
  MapPin,
  Users,
  AlertTriangle,
  BarChart3,
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
  ShieldCheck,
  ClipboardCheck,
  Scale,
  FolderOpen,
  FileSignature,
  FileX,
  Navigation,
  Map as MapIcon,
  Bus,
  Building2,
  Radio,
  Coins,
} from 'lucide-react';
import { getAuthToken, clearAuthSession, getCurrentUser, logout } from '@/lib/auth';
import { getDashboardRouteForRole } from '@/lib/auth-redirect';
import { HelpSupportModal } from '@/components/layout/HelpSupportModal';
import { LogoutConfirmModal } from '@/components/layout/LogoutConfirmModal';
import { PortalLoadingSkeleton } from '@/components/layout/PortalLoadingSkeleton';
import { apiClient } from '@/lib/api-client';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { AmbientCanvas } from '@/components/layout/AmbientCanvas';
import { FleetRouteStoreProvider } from '@/lib/fleet-route-store';
import { DocumentStoreProvider } from '@/lib/document-store';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
  badgeColor?: 'danger' | 'brand';
  /** Chỉ active khi đúng đường dẫn (trang tổng quan của một nhóm có trang con). */
  exact?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export default function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
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
      const saved = localStorage.getItem('equitransit_sidebar_pinned') ?? localStorage.getItem('equiroute_sidebar_pinned');
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
    return () => window.removeEventListener('keydown', onKeyDown);
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

  useEffect(() => {
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/manager';
    const token = getAuthToken();
    if (!token) {
      router.replace(`/login?redirect=${encodeURIComponent(currentPath || '/manager')}`);
      return;
    }

    const user = getCurrentUser();
    if (!user) {
      clearAuthSession();
      router.replace(`/login?redirect=${encodeURIComponent(currentPath || '/manager')}`);
      return;
    }

    if (user.role && user.role !== 'LOGISTICS_MANAGER' && user.role !== 'ADMIN') {
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
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
      window.removeEventListener('notifications-updated', handleNotificationsUpdated);
      window.removeEventListener('auth-user-updated', handleAuthUpdated);
    };
  }, [router]);

  // Portal hợp nhất sau review 11/2026: Manager đảm nhận luôn việc của Specialist (hồ sơ) và Coordinator (điều phối).
  const navGroups: NavGroup[] = [
    {
      title: t('manager.navGroupOps', 'Điều Hành Vận Tải'),
      items: [
        {
          label: t('nav.dashboard', 'Tổng Quan'),
          href: '/manager',
          icon: <LayoutDashboard size={18} />,
          exact: true,
        },
        {
          label: t('manager.nav.requests', 'Yêu Cầu Vận Chuyển'),
          href: '/manager/requests',
          icon: <Truck size={18} />,
        },
        {
          label: t('manager.nav.planning', 'Kế Hoạch Chuyến Đi'),
          href: '/manager/planning',
          icon: <MapPin size={18} />,
        },
        {
          label: t('manager.nav.incidents', 'Xử Lý Sự Cố'),
          href: '/manager/incidents',
          icon: <AlertTriangle size={18} />,
        },
      ],
    },
    {
      title: t('manager.navGroupCompliance', 'Hồ Sơ & Kiểm Dịch'),
      items: [
        {
          label: t('manager.nav.complianceOverview', 'Tổng Quan Hồ Sơ'),
          href: '/manager/compliance',
          icon: <ShieldCheck size={18} />,
          exact: true,
        },
        {
          label: t('specialist.nav.complianceOrders', 'Đơn Kiểm Định Pháp Lý'),
          href: '/manager/compliance/orders',
          icon: <ClipboardCheck size={18} />,
        },
        {
          label: t('specialist.nav.regulations', 'Quy Định Kiểm Dịch'),
          href: '/manager/compliance/regulations',
          icon: <Scale size={18} />,
        },
        {
          label: t('specialist.nav.documents', 'Hồ Sơ Vận Chuyển'),
          href: '/manager/compliance/documents',
          icon: <FolderOpen size={18} />,
        },
        {
          label: t('specialist.nav.approval', 'Thẩm Định Giấy Tờ'),
          href: '/manager/compliance/approval',
          icon: <FileSignature size={18} />,
        },
        {
          label: t('specialist.nav.missing', 'Hồ Sơ Còn Thiếu'),
          href: '/manager/compliance/missing',
          icon: <FileX size={18} />,
        },
      ],
    },
    {
      title: t('manager.navGroupDispatch', 'Đội Xe & Điều Phối'),
      items: [
        {
          label: t('manager.nav.dispatchOverview', 'Tổng Quan Điều Phối'),
          href: '/manager/dispatch',
          icon: <Navigation size={18} />,
          exact: true,
        },
        {
          label: t('nav.routes', 'Lập lộ trình tuyến'),
          href: '/manager/dispatch/routes',
          icon: <MapIcon size={18} />,
        },
        {
          label: t('nav.vehicles', 'Quản lý đội xe'),
          href: '/manager/fleet/vehicles',
          icon: <Bus size={18} />,
        },
        {
          label: t('manager.nav.depots', 'Trạm xe'),
          href: '/manager/fleet/depots',
          icon: <Building2 size={18} />,
        },
        {
          label: t('manager.nav.staff', 'Phân Bổ Ca Trực & Nhân Sự'),
          href: '/manager/staff',
          icon: <Users size={18} />,
        },
        {
          label: t('nav.monitoring', 'Giám sát'),
          href: '/manager/monitoring',
          icon: <Radio size={18} />,
        },
      ],
    },
  ];

  const isNavActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || Boolean(pathname?.startsWith(`${item.href}/`));

  const managementItems: NavItem[] = [
    {
      label: t('common.notifications', 'Thông Báo'),
      href: '/manager/notifications',
      icon: <Bell size={18} />,
      badge: unreadNotifs > 0 ? unreadNotifs : undefined,
      badgeColor: 'brand',
    },
    {
      label: t('manager.nav.pricing', 'Bảng Giá & Định Mức'),
      href: '/manager/settings/pricing',
      icon: <Coins size={18} />,
    },
    {
      label: t('common.settings', 'Cài Đặt Hệ Thống'),
      href: '/manager/settings',
      icon: <Settings size={18} />,
    },
  ];

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const handleConfirmLogout = () => {
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
    'LM';

  return (
    <FleetRouteStoreProvider>
      <DocumentStoreProvider>
      <div className="flex h-[100dvh] max-h-[100dvh] bg-[#F4F1E9] overflow-hidden relative font-sans">
      <AmbientCanvas />
      <LogoutConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleConfirmLogout}
      />

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-[#181A17]/65 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={t('common.openMenu', 'Menu điều hướng')}
            style={{
              width: '268px',
              backgroundColor: '#181A17',
              color: '#A5ACA1',
              display: 'flex',
              flexDirection: 'column',
              height: '100dvh',
              position: 'relative',
              zIndex: 51,
              borderRight: '1px solid rgba(180, 154, 104, 0.2)',
            }}
            className="animate-fade-in shadow-2xl"
          >
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
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '12px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
                    border: '1px solid rgba(180, 154, 104, 0.45)',
                    backgroundColor: '#181A17',
                  }}
                >
                  <img src="/logo.png" alt="EquiTransit" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div>
                  <p style={{ color: '#FAF8F4', fontWeight: 700, fontSize: '15px', letterSpacing: '0.01em', lineHeight: 1.2, margin: 0 }}>
                    EquiTransit
                  </p>
                  <span style={{ fontSize: '10px', color: '#B49A68', fontWeight: 700, letterSpacing: '0.08em' }}>MANAGER</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="w-10 h-10 flex items-center justify-center text-[#A5ACA1] hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
                aria-label={t('common.closeMenu', 'Đóng menu điều hướng')}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
              {navGroups.map((group) => (
              <div key={group.title}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#7E867B', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px 12px' }}>
                  {group.title}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {group.items.map((item) => {
                    const isActive = isNavActive(item);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => setMobileMenuOpen(false)}
                        className="no-underline transition-colors hover:bg-white/5 hover:text-white"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: '10px',
                          backgroundColor: isActive ? 'rgba(166, 124, 46, 0.2)' : 'transparent',
                          border: isActive ? '1px solid rgba(166, 124, 46, 0.4)' : '1px solid transparent',
                          color: isActive ? '#FAF8F4' : '#A5ACA1',
                          fontWeight: isActive ? 600 : 500,
                          fontSize: '13.5px',
                          textDecoration: 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ color: isActive ? '#D8CEBE' : '#7E867B' }}>{item.icon}</span>
                          {item.label}
                        </div>
                        {item.badge !== undefined && (
                          <span style={{ backgroundColor: item.badgeColor === 'danger' ? '#B33E3E' : '#A67C2E', color: '#ffffff', fontSize: '10.5px', fontWeight: 700, padding: '2px 7px', borderRadius: '999px' }}>
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
              ))}

              <div>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#7E867B', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px 12px' }}>
                  {t('manager.navGroupAdmin', 'Quản Trị Hệ Thống')}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {managementItems.map((item) => {
                    const isActive = pathname?.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => setMobileMenuOpen(false)}
                        className="no-underline transition-colors hover:bg-white/5 hover:text-white"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: '10px',
                          backgroundColor: isActive ? 'rgba(166, 124, 46, 0.2)' : 'transparent',
                          border: isActive ? '1px solid rgba(166, 124, 46, 0.4)' : '1px solid transparent',
                          color: isActive ? '#FAF8F4' : '#A5ACA1',
                          fontWeight: isActive ? 600 : 500,
                          fontSize: '13.5px',
                          textDecoration: 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ color: isActive ? '#D8CEBE' : '#7E867B' }}>{item.icon}</span>
                          {item.label}
                        </div>
                        {item.badge !== undefined && (
                          <span style={{ backgroundColor: '#A67C2E', color: '#ffffff', fontSize: '10.5px', fontWeight: 700, padding: '2px 7px', borderRadius: '999px' }}>
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* LEFT SIDEBAR (Desktop Push-Content & Sticky Viewport) */}
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
                aria-label={!isPinned ? t('manager.pinSidebar', 'Ghim cố định thanh menu (260px)') : t('manager.unpinSidebar', 'Bỏ ghim thanh menu')}
                title={!isPinned ? t('manager.pinSidebar', 'Ghim cố định thanh menu (260px)') : t('manager.unpinSidebar', 'Bỏ ghim thanh menu')}
              >
                <img src="/logo.png" alt="EquiTransit" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </button>
              {isExpanded && (
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  <p style={{ color: '#FAF8F4', fontWeight: 700, fontSize: '15px', letterSpacing: '0.01em', lineHeight: 1.2, margin: 0 }}>
                    EquiTransit
                  </p>
                  <span style={{ fontSize: '10px', color: '#B49A68', fontWeight: 700, letterSpacing: '0.08em' }}>MANAGER</span>
                </div>
              )}
            </div>

            {/* Pin / Lock Toggle Button */}
            {isExpanded && (
              <button
                type="button"
                onClick={togglePin}
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all cursor-pointer ${
                  isPinned
                    ? 'bg-[#C4B38E]/25 text-[#D8CEBE] border border-[#C4B38E]/45 shadow-sm'
                    : 'text-[#A5ACA1] hover:text-white hover:bg-white/10'
                }`}
                title={isPinned ? t('manager.unpinSidebar', 'Bỏ ghim (tự động thu gọn, rê chuột để mở)') : t('manager.pinSidebar', 'Ghim cố định thanh menu (260px)')}
                aria-label={isPinned ? t('manager.unpinSidebar', 'Unpin sidebar') : t('manager.pinSidebar', 'Pin sidebar')}
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
            {/* NAVIGATION GROUPS: Điều hành · Hồ sơ & Kiểm dịch · Đội xe & Điều phối */}
            {navGroups.map((group) => (
            <div key={group.title}>
              {isExpanded ? (
                <p
                  style={{
                    padding: '0 12px',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#7E867B',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: '8px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {group.title}
                </p>
              ) : (
                <div className="w-8 h-[1px] bg-white/10 mx-auto my-2" />
              )}

              <nav style={{ display: 'flex', flexDirection: 'column', gap: !isExpanded ? '6px' : '3px' }}>
                {group.items.map((item) => {
                  const isActive = isNavActive(item);

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
                          <span
                            className={`absolute top-1.5 right-3 w-2 h-2 rounded-full ring-2 ring-[#181A17] animate-pulse ${
                              item.badgeColor === 'danger' ? 'bg-[#B33E3E]' : 'bg-[#A67C2E]'
                            }`}
                          />
                        )}

                        {/* Floating Tooltip */}
                        <div className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-[#181A17]/95 backdrop-blur-md text-[#FAF8F4] text-xs font-bold whitespace-nowrap shadow-xl border border-[#B49A68]/30 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50 flex items-center gap-2 -translate-x-1.5 group-hover:translate-x-0">
                          <span>{item.label}</span>
                          {item.badge !== undefined && (
                            <span
                              className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold text-white ${
                                item.badgeColor === 'danger' ? 'bg-[#B33E3E]' : 'bg-[#A67C2E]'
                              }`}
                            >
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
                          style={{
                            backgroundColor: item.badgeColor === 'danger' ? '#B33E3E' : '#A67C2E',
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
            ))}

            {/* MANAGEMENT GROUP */}
            <div>
              {isExpanded ? (
                <p
                  style={{
                    padding: '0 12px',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#7E867B',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: '8px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t('manager.navGroupAdmin', 'Quản Trị Hệ Thống')}
                </p>
              ) : (
                <div className="w-8 h-[1px] bg-white/10 mx-auto my-2" />
              )}

              <nav style={{ display: 'flex', flexDirection: 'column', gap: !isExpanded ? '6px' : '3px' }}>
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

                        {/* Floating Tooltip */}
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
              <Link
                href="/manager/settings"
                title={t('common.settings', 'Cài đặt hệ thống')}
                className="relative group flex items-center justify-center py-1 no-underline"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[#A5ACA1] hover:text-white hover:bg-white/10 transition-all duration-200 group-hover:scale-110">
                  <Settings size={18} />
                </div>
                <div className="absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-[#181A17]/95 backdrop-blur-md text-[#FAF8F4] text-xs font-bold whitespace-nowrap shadow-xl border border-[#B49A68]/30 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-150 z-50 -translate-x-1.5 group-hover:translate-x-0">
                  <span>{t('common.settings', 'Cài đặt hệ thống')}</span>
                </div>
              </Link>
            ) : (
              <Link
                href="/manager/settings"
                className="no-underline flex items-center gap-3 px-3 py-2 text-[13px] text-[#A5ACA1] hover:text-white hover:bg-white/5 rounded-lg whitespace-nowrap transition-colors"
              >
                <Settings size={17} className="text-[#7E867B]" />
                <span>{t('common.settings', 'Cài đặt hệ thống')}</span>
              </Link>
            )}

            {!isExpanded ? (
              <div className="flex flex-col items-center gap-2 pt-1">
                <div
                  className="relative group cursor-default"
                  title={`${currentUser?.name || t('manager.roleLabel', 'Logistics Manager')}${currentUser?.email ? ` (${currentUser.email})` : ''}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-[#A67C2E] text-white flex items-center justify-center font-bold text-xs shadow-md group-hover:scale-105 transition-all">
                    {userInitials}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
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
                      {currentUser?.name || t('manager.roleLabel', 'Logistics Manager')}
                    </p>
                    <p style={{ fontSize: '10.5px', color: '#A5ACA1', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {currentUser?.email || t('manager.roleLabel', 'Logistics Manager')}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
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

      {/* MAIN CONTENT AREA */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        {/* TOP HEADER */}
        <header
          className="liquid-glass-header px-4 sm:px-6"
          style={{
            height: '72px',
            backgroundColor: 'rgba(250, 248, 244, 0.88)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: '1px solid #E5DFD3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 30,
            flexShrink: 0,
          }}
        >
          {/* Left: Mobile Menu Toggle & Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label={t('common.openMenu', 'Mở menu điều hướng')}
              className="md:hidden w-10 h-10 flex items-center justify-center rounded-xl text-[#242722] hover:bg-[#F0EEE8] border-0 bg-transparent cursor-pointer shrink-0"
            >
              <Menu size={22} />
            </button>
            <div className="min-w-0">
              <p className="text-[15px] sm:text-[17px] font-bold text-[#181A17] m-0 leading-tight truncate">
                {t('manager.title', 'Bảng Điều Khiển Quản Lý')}
              </p>
              <p className="hidden sm:block text-[13px] text-[#5C6658] m-0 mt-0.5 font-medium truncate">
                {t('manager.subtitle', 'Tổng quan các hoạt động vận tải ngựa đua quốc tế và phân công vận hành.')}
              </p>
            </div>
          </div>

          {/* Center: Search */}
          <div className="hidden lg:flex items-center bg-white/80 border border-[#E5DFD3] rounded-lg px-3.5 py-2 w-72 xl:w-96 relative focus-within:border-[#A67C2E] focus-within:ring-2 focus-within:ring-[#A67C2E]/20 transition-all">
            <Search size={15} className="text-[#7E867B] mr-2.5 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              aria-label={t('common.search', 'Tìm kiếm yêu cầu, mã ngựa, hồ sơ...')}
              placeholder={t('common.search', 'Tìm kiếm yêu cầu, mã ngựa, hồ sơ...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchTerm.trim()) {
                  router.push(`/manager/requests?search=${encodeURIComponent(searchTerm.trim())}`);
                }
              }}
              style={{
                border: 'none',
                outline: 'none',
                backgroundColor: 'transparent',
                fontSize: '13.5px',
                color: '#181A17',
                width: '100%',
              }}
            />
            <span
              aria-hidden="true"
              style={{
                fontSize: '10.5px',
                fontWeight: 700,
                color: '#7E867B',
                backgroundColor: '#FAF8F4',
                border: '1px solid #E5DFD3',
                padding: '2px 5px',
                borderRadius: '4px',
                flexShrink: 0,
              }}
            >
              ⌘K
            </span>
          </div>

          {/* Right: Actions & User */}
          <div className="flex items-center gap-3 shrink-0">
            <LanguageSwitcher variant="pill" />

            <button
              type="button"
              aria-label={
                unreadNotifs > 0
                  ? `${t('common.notifications', 'Thông báo')} (${unreadNotifs})`
                  : t('common.notifications', 'Thông báo')
              }
              onClick={() => router.push('/manager/notifications')}
              className="w-9 h-9 rounded-full border border-[#E5DFD3] flex items-center justify-center text-[#5C6658] hover:text-[#181A17] hover:border-[#C4B38E] bg-[#FAF8F4]/90 relative cursor-pointer shadow-sm transition-colors"
              title={t('common.notifications', 'Thông báo')}
            >
              <Bell size={16} />
              {unreadNotifs > 0 && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: '7px',
                    right: '8px',
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: '#B33E3E',
                    border: '1px solid #ffffff',
                  }}
                />
              )}
            </button>

            <div style={{ position: 'relative' }}>
              <button
                type="button"
                aria-expanded={showUserMenu}
                aria-haspopup="menu"
                onClick={() => setShowUserMenu((prev) => !prev)}
                className="flex items-center gap-2.5 bg-[#FAF8F4] border border-[#E5DFD3] hover:border-[#C4B38E] rounded-full py-1 pl-1 pr-3 cursor-pointer select-none transition-colors"
              >
                <div
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    backgroundColor: '#A67C2E',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 700,
                  }}
                >
                  {userInitials}
                </div>
                <div className="hidden sm:block text-left leading-tight">
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#181A17', margin: 0 }}>
                    {currentUser?.name || t('manager.roleLabel', 'Logistics Manager')}
                  </p>
                  <p style={{ fontSize: '10px', color: '#5C6658', margin: 0, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '3px' }}>
                    {t('manager.roleLabel', 'Logistics Manager')} <ChevronDown size={10} />
                  </p>
                </div>
              </button>

              {showUserMenu && (
                <>
                  <div
                    onClick={() => setShowUserMenu(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 50 }}
                  />
                  <div
                    role="menu"
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      right: 0,
                      backgroundColor: '#ffffff',
                      border: '1px solid #E5DFD3',
                      borderRadius: '12px',
                      boxShadow: '0 10px 25px -5px rgba(24, 26, 23, 0.12), 0 8px 10px -6px rgba(24, 26, 23, 0.08)',
                      width: '220px',
                      padding: '6px',
                      zIndex: 60,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                    }}
                  >
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid #F0EEE8', marginBottom: '4px' }}>
                      <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#181A17' }}>
                        {currentUser?.name || t('manager.roleLabel', 'Logistics Manager')}
                      </p>
                      {currentUser?.email && (
                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#5C6658', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {currentUser.email}
                        </p>
                      )}
                    </div>
                    <Link
                      role="menuitem"
                      href="/manager/settings"
                      onClick={() => setShowUserMenu(false)}
                      className="no-underline flex items-center gap-2 px-3 py-2 text-[13px] text-[#2C2F2A] hover:bg-[#F0EEE8] rounded-lg cursor-pointer transition-colors"
                    >
                      <Settings size={15} className="text-[#5C6658]" />
                      <span>{t('common.accountSettings', 'Cài đặt tài khoản')}</span>
                    </Link>
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setShowUserMenu(false);
                        setShowSupportModal(true);
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-[13px] text-[#2C2F2A] hover:bg-[#F0EEE8] rounded-lg border-0 bg-transparent cursor-pointer w-full text-left transition-colors"
                    >
                      <HelpCircle size={15} className="text-[#5C6658]" />
                      <span>{t('common.helpSupport', 'Trợ Giúp & Hỗ Trợ')}</span>
                    </button>
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setShowUserMenu(false);
                        handleLogout();
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-[13px] text-[#B33E3E] hover:bg-rose-50 rounded-lg border-0 bg-transparent cursor-pointer w-full text-left transition-colors"
                    >
                      <LogOut size={15} className="text-[#B33E3E]" />
                      <span>{t('common.logout', 'Đăng xuất')}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable Content Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-transparent">
          <div style={{ maxWidth: '1400px', margin: '0 auto' }}>{children}</div>
        </div>
      </main>
      <HelpSupportModal isOpen={showSupportModal} onClose={() => setShowSupportModal(false)} />
    </div>
      </DocumentStoreProvider>
    </FleetRouteStoreProvider>
  );
}
