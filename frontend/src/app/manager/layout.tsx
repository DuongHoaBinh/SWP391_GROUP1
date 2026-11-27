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
  Bus,
  Radio,
  ShieldAlert,
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
  /** Các tiền tố URL bổ sung thuộc workspace hợp nhất này. */
  matchPrefixes?: string[];
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

  // Portal hợp nhất sau review 11/2026: gom 26 trang con thành 12 workspace cốt lõi (vừa khít 1280x800).
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
          label: t('manager.nav.requests', 'Đơn Vận Chuyển'),
          href: '/manager/requests',
          icon: <Truck size={18} />,
        },
        {
          label: t('manager.navGroupCompliance', 'Hồ Sơ & Kiểm Dịch'),
          href: '/manager/compliance',
          icon: <ShieldCheck size={18} />,
          matchPrefixes: ['/manager/compliance'],
        },
        {
          label: t('manager.nav.planningHub', 'Lập Tuyến & Điều Phối'),
          href: '/manager/planning',
          icon: <MapPin size={18} />,
          matchPrefixes: ['/manager/planning', '/manager/dispatch'],
        },
        {
          label: t('nav.monitoring', 'Giám Sát Trực Tuyến'),
          href: '/manager/monitoring',
          icon: <Radio size={18} />,
          exact: true,
        },
        {
          label: t('manager.nav.incidents', 'Sự Cố & Cảnh Báo'),
          href: '/manager/incidents',
          icon: <AlertTriangle size={18} />,
          matchPrefixes: ['/manager/incidents', '/manager/monitoring/alerts'],
        },
      ],
    },
    {
      title: t('manager.navGroupResources', 'Tài Nguyên & Báo Cáo'),
      items: [
        {
          label: t('manager.nav.fleetHub', 'Đội Xe & Trạm Xe'),
          href: '/manager/fleet/vehicles',
          icon: <Bus size={18} />,
          matchPrefixes: ['/manager/fleet'],
        },
        {
          label: t('manager.nav.staff', 'Nhân Sự & Ca Trực'),
          href: '/manager/staff',
          icon: <Users size={18} />,
        },
        {
          label: t('manager.nav.claims', 'Bồi Thường Bảo Hiểm'),
          href: '/manager/insurance/claims',
          icon: <ShieldAlert size={18} />,
          matchPrefixes: ['/manager/insurance'],
        },
        {
          label: t('manager.nav.reports', 'Báo Cáo & Đối Soát'),
          href: '/manager/reports',
          icon: <BarChart3 size={18} />,
        },
      ],
    },
  ];

  const isNavActive = (item: NavItem) => {
    if (!pathname) return false;
    if (item.exact) return pathname === item.href;
    if (item.matchPrefixes && item.matchPrefixes.length > 0) {
      return item.matchPrefixes.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
      );
    }
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  const managementItems: NavItem[] = [
    {
      label: t('common.notifications', 'Thông Báo'),
      href: '/manager/notifications',
      icon: <Bell size={18} />,
      badge: unreadNotifs > 0 ? unreadNotifs : undefined,
      badgeColor: 'brand',
    },
    {
      label: t('common.settings', 'Cấu Hình & Cài Đặt'),
      href: '/manager/settings',
      icon: <Settings size={18} />,
      matchPrefixes: ['/manager/settings'],
    },
  ];

  const headerMeta = (() => {
    const p = pathname || '/manager';
    if (p.startsWith('/manager/requests')) {
      return {
        title: t('manager.nav.requests', 'Đơn Vận Chuyển'),
        subtitle: t('manager.header.requestsSub', 'Thẩm định khả thi, báo giá, hồ sơ và theo dõi vòng đời đơn'),
      };
    }
    if (p.startsWith('/manager/compliance')) {
      return {
        title: t('manager.navGroupCompliance', 'Hồ Sơ & Kiểm Dịch'),
        subtitle: t('manager.header.complianceSub', 'Thẩm định giấy tờ, hồ sơ còn thiếu và quy định cửa khẩu'),
      };
    }
    if (p.startsWith('/manager/planning') || p.startsWith('/manager/dispatch')) {
      return {
        title: t('manager.nav.planningHub', 'Lập Tuyến & Điều Phối'),
        subtitle: t('manager.header.planningSub', 'Lập khung tuyến, dựng lộ trình chi tiết và lịch xuất phát'),
      };
    }
    if (p.startsWith('/manager/fleet')) {
      return {
        title: t('manager.nav.fleetHub', 'Đội Xe & Trạm Xe'),
        subtitle: t('manager.header.fleetSub', 'Quản lý phương tiện chuyên dụng và trạm trung chuyển'),
      };
    }
    if (p.startsWith('/manager/monitoring/alerts') || p.startsWith('/manager/incidents')) {
      return {
        title: t('manager.nav.incidents', 'Sự Cố & Cảnh Báo'),
        subtitle: t('manager.header.incidentsSub', 'Cảnh báo trực tuyến, đề xuất đổi tuyến và tranh chấp bàn giao'),
      };
    }
    if (p.startsWith('/manager/monitoring')) {
      return {
        title: t('nav.monitoring', 'Giám Sát Trực Tuyến'),
        subtitle: t('manager.header.monitoringSub', 'Bản đồ định vị GPS, mốc hành trình và sinh hiệu ngựa'),
      };
    }
    if (p.startsWith('/manager/insurance')) {
      return {
        title: t('manager.nav.claims', 'Bồi Thường Bảo Hiểm'),
        subtitle: t('manager.header.claimsSub', 'Thẩm định hồ sơ bồi thường M1–M4 và đối soát hạn mức'),
      };
    }
    if (p.startsWith('/manager/reports')) {
      return {
        title: t('manager.nav.reports', 'Báo Cáo & Đối Soát'),
        subtitle: t('manager.header.reportsSub', 'Doanh thu thực thu, chi phí vận hành và chỉ số OTD'),
      };
    }
    if (p.startsWith('/manager/staff')) {
      return {
        title: t('manager.nav.staff', 'Nhân Sự & Ca Trực'),
        subtitle: t('manager.header.staffSub', 'Quản lý tài xế, bác sĩ thú y áp tải và lịch trực'),
      };
    }
    if (p.startsWith('/manager/notifications')) {
      return {
        title: t('common.notifications', 'Thông Báo Hệ Thống'),
        subtitle: t('manager.header.notificationsSub', 'Cập nhật đơn hàng, thanh toán và cảnh báo mới nhất'),
      };
    }
    if (p.startsWith('/manager/settings')) {
      return {
        title: t('common.settings', 'Cấu Hình & Cài Đặt'),
        subtitle: t('manager.header.settingsSub', 'Tài khoản, bảng giá cước, giờ cấm nội đô và định vị GPS'),
      };
    }
    return {
      title: t('manager.title', 'Tổng Quan Vận Hành'),
      subtitle: t('manager.header.dashboardSub', 'Theo dõi chỉ số vận tải ngựa đua và yêu cầu cần xử lý'),
    };
  })();

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
              padding: !isExpanded ? '16px 8px' : '16px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: !isExpanded ? '12px' : '18px',
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
                      className={`no-underline flex items-center justify-between px-3 py-2 rounded-lg text-[13px] transition-colors whitespace-nowrap ${
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
                      className={`no-underline flex items-center justify-between px-3 py-2 rounded-lg text-[13px] transition-colors whitespace-nowrap ${
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

          {/* Bottom Area (User Profile & Logout — Settings lives in Hệ Thống nav group) */}
          <div style={{ padding: !isExpanded ? '12px 8px' : '12px 14px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
              <p className="text-[15px] sm:text-[16px] font-bold text-[#181A17] m-0 leading-tight truncate">
                {headerMeta.title}
              </p>
            </div>
          </div>

          {/* Center: Search */}
          <div className="hidden lg:flex items-center bg-white/80 border border-[#E5DFD3] rounded-lg px-3 py-1.5 w-60 xl:w-72 relative focus-within:border-[#A67C2E] focus-within:ring-2 focus-within:ring-[#A67C2E]/20 transition-all">
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
                <div className="hidden sm:flex items-center gap-1.5 text-left leading-tight">
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#181A17', margin: 0 }}>
                      {currentUser?.name || t('manager.roleLabel', 'Logistics Manager')}
                    </p>
                    {currentUser?.name && currentUser.name.trim().toLowerCase() !== t('manager.roleLabel', 'Logistics Manager').trim().toLowerCase() && (
                      <p style={{ fontSize: '10px', color: '#5C6658', margin: 0, fontWeight: 500 }}>
                        {t('manager.roleLabel', 'Logistics Manager')}
                      </p>
                    )}
                  </div>
                  <ChevronDown size={12} className="text-[#5C6658]" />
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
