'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Truck,
  FolderClosed,
  Navigation,
  Bell,
  HelpCircle,
  LogOut,
  BarChart3,
  Settings,
  X,
} from 'lucide-react';
import { clearAuthSession, getCurrentUser } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { mockCurrentUser } from '@/lib/mock-data';
import { UserProfile } from '@/lib/types';
import { LogoutConfirmModal } from './LogoutConfirmModal';
import { useLanguage } from '@/lib/i18n/LanguageContext';

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
  const router = useRouter();
  const { t } = useLanguage();
  const [currentUser, setCurrentUser] = useState<UserProfile>(mockCurrentUser);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  useEffect(() => {
    setCurrentUser(getCurrentUser());

    const fetchUnread = async () => {
      try {
        const notifs = await apiClient<any[]>('/notifications');
        if (Array.isArray(notifs)) {
          setUnreadNotifs(notifs.filter((n) => !n.isRead).length);
        }
      } catch {
        // ignore
      }
    };
    fetchUnread();

    const handleUserUpdate = () => {
      setCurrentUser(getCurrentUser());
      fetchUnread();
    };
    window.addEventListener('auth-user-updated', handleUserUpdate);
    window.addEventListener('notifications-updated', fetchUnread);
    return () => {
      window.removeEventListener('auth-user-updated', handleUserUpdate);
      window.removeEventListener('notifications-updated', fetchUnread);
    };
  }, []);

  const navItems: NavItem[] = [
    {
      label: t('nav.dashboard', 'Dashboard'),
      href: '/customer',
      icon: <LayoutDashboard size={18} />,
    },
    {
      label: t('nav.requests', 'Transport Requests'),
      href: '/customer/requests',
      icon: <Truck size={18} />,
    },
    {
      label: t('nav.horses', 'My Horses'),
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
        >
          <path d="M22 17v-1c0-4-3-7-7-7H9l-2-3H3l1 5-2 3v3h10" />
          <path d="M12 12v5" />
          <path d="M17 12v5" />
          <circle cx="8" cy="7" r="1" />
        </svg>
      ),
    },
    {
      label: t('nav.documents', 'Documents'),
      href: '/customer/documents',
      icon: <FolderClosed size={18} />,
      badge: 2,
    },
    {
      label: t('nav.tracking', 'Trip Tracking'),
      href: '/customer/tracking',
      icon: <Navigation size={18} />,
    },
    {
      label: t('common.notifications', 'Notifications'),
      href: '/customer/notifications',
      icon: <Bell size={18} />,
      badge: unreadNotifs > 0 ? unreadNotifs : undefined,
    },
  ];

  const managementItems: NavItem[] = [
    {
      label: t('nav.reports', 'Reports'),
      href: '/customer/reports',
      icon: <BarChart3 size={18} />,
    },
    {
      label: t('common.settings', 'Settings'),
      href: '/customer/settings',
      icon: <Settings size={18} />,
    },
  ];

  const handleLogoutClick = () => {
    setShowLogoutModal(true);
  };

  const handleConfirmLogout = () => {
    setShowLogoutModal(false);
    clearAuthSession();
    router.push('/login');
  };

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
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={onClose}
          />
          <aside
            style={{
              width: '260px',
              backgroundColor: '#0c121e',
              color: '#94a3b8',
              display: 'flex',
              flexDirection: 'column',
              height: '100vh',
              position: 'relative',
              zIndex: 51,
              borderRight: '1px solid #192233',
            }}
            className="animate-fade-in shadow-2xl"
          >
            <div
              style={{
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #162030',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    backgroundColor: '#0c1a2e',
                  }}
                >
                  <img src="/logo.png" alt="RaceHorse Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', lineHeight: 1.1 }}>RaceHorse</div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, letterSpacing: '0.06em', marginTop: '2px' }}>Logistics</div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                aria-label="Close navigation menu"
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: '#475569', textTransform: 'uppercase', padding: '0 10px', marginBottom: '8px' }}>
                  Navigation
                </div>
                <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {navItems.map((item) => {
                    const isActive = item.href === '/customer' ? pathname === '/customer' : pathname?.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          fontSize: '13.5px',
                          fontWeight: isActive ? 600 : 500,
                          color: isActive ? '#ffffff' : '#94a3b8',
                          backgroundColor: isActive ? '#1c283c' : 'transparent',
                          textDecoration: 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ color: isActive ? '#3b82f6' : '#64748b' }}>{item.icon}</span>
                          <span>{item.label}</span>
                        </div>
                        {item.badge !== undefined && (
                          <span style={{ padding: '2px 7px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, backgroundColor: '#ef4444', color: '#ffffff' }}>
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </nav>
              </div>

              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: '#475569', textTransform: 'uppercase', padding: '0 10px', marginBottom: '8px' }}>
                  Management
                </div>
                <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {managementItems.map((item) => {
                    const isActive = pathname?.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          fontSize: '13.5px',
                          fontWeight: isActive ? 600 : 500,
                          color: isActive ? '#ffffff' : '#94a3b8',
                          backgroundColor: isActive ? '#1c283c' : 'transparent',
                          textDecoration: 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ color: isActive ? '#3b82f6' : '#64748b' }}>{item.icon}</span>
                          <span>{item.label}</span>
                        </div>
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside
        className="hidden md:flex"
        style={{
          width: '260px',
          backgroundColor: '#0c121e',
          color: '#94a3b8',
          flexDirection: 'column',
          height: '100vh',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          borderRight: '1px solid #192233',
          flexShrink: 0,
        }}
      >
      {/* Brand Header */}
      <div
        style={{
          padding: '24px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          borderBottom: '1px solid #162030',
        }}
      >
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            backgroundColor: '#0c1a2e',
          }}
        >
          <img src="/logo.png" alt="RaceHorse Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', lineHeight: 1.1 }}>
            RaceHorse
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, letterSpacing: '0.06em', marginTop: '2px' }}>
            Logistics
          </div>
        </div>
      </div>

      {/* Navigation Groups */}
      <div
        style={{
          flex: 1,
          padding: '20px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          overflowY: 'auto',
        }}
      >
        {/* Section: NAVIGATION */}
        <div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: '#475569',
              textTransform: 'uppercase',
              padding: '0 10px',
              marginBottom: '8px',
            }}
          >
            Navigation
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {navItems.map((item) => {
              const isActive =
                item.href === '/customer'
                  ? pathname === '/customer'
                  : pathname?.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    fontSize: '13.5px',
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? '#ffffff' : '#94a3b8',
                    backgroundColor: isActive ? '#1c283c' : 'transparent',
                    textDecoration: 'none',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      (e.currentTarget as HTMLElement).style.color = '#f1f5f9';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                      (e.currentTarget as HTMLElement).style.color = '#94a3b8';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ color: isActive ? '#60a5fa' : '#64748b' }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </div>

                  {item.badge !== undefined && (
                    <span
                      style={{
                        padding: '2px 7px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: '#2563eb',
                        color: '#ffffff',
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

        {/* Section: MANAGEMENT */}
        <div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: '#475569',
              textTransform: 'uppercase',
              padding: '0 10px',
              marginBottom: '8px',
            }}
          >
            Management
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {managementItems.map((item) => {
              const isActive = pathname?.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    fontSize: '13.5px',
                    fontWeight: isActive ? 600 : 500,
                    color: isActive ? '#ffffff' : '#94a3b8',
                    backgroundColor: isActive ? '#1c283c' : 'transparent',
                    textDecoration: 'none',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      (e.currentTarget as HTMLElement).style.color = '#f1f5f9';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                      (e.currentTarget as HTMLElement).style.color = '#94a3b8';
                    }
                  }}
                >
                  <span style={{ color: isActive ? '#60a5fa' : '#64748b' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom Footer Section */}
      <div
        style={{
          padding: '16px 14px',
          borderTop: '1px solid #162030',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {/* User Card */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px',
            borderRadius: '10px',
            backgroundColor: '#121a29',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div
              suppressHydrationWarning
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '12px',
                flexShrink: 0,
              }}
            >
              {currentUser.initials || 'CU'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                suppressHydrationWarning
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#ffffff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {currentUser.name || currentUser.email}
              </div>
              <div
                suppressHydrationWarning
                style={{
                  fontSize: '11px',
                  color: '#64748b',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {currentUser.email}
              </div>
            </div>
          </div>

          <button
            onClick={handleLogoutClick}
            title="Log out"
            style={{
              padding: '6px',
              color: '#64748b',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '6px',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#f87171')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#64748b')}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
    </>
  );
};
