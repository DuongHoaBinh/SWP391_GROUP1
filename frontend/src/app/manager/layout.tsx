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
} from 'lucide-react';
import { getAuthToken, setAuthSession, clearAuthSession, getCurrentUser } from '@/lib/auth';
import { LogoutConfirmModal } from '@/components/layout/LogoutConfirmModal';
import { apiClient } from '@/lib/api-client';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
  badgeColor?: 'danger' | 'brand';
}

export default function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [unreadNotifs, setUnreadNotifs] = useState(0);

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

  useEffect(() => {
    // Ensure active manager session exists
    const token = getAuthToken();
    const user = getCurrentUser();
    if (!token || (user.role !== 'LOGISTICS_MANAGER' && user.role !== 'ADMIN')) {
      setAuthSession('mock-jwt-token-manager', {
        id: '2',
        name: 'Alex Morgan',
        email: 'alex.m@racehorse.logistics',
        role: 'LOGISTICS_MANAGER',
        organization: 'RaceHorse Logistics',
        initials: 'AM',
      });
    }

    fetchUnread();

    const handleNotificationsUpdated = () => {
      fetchUnread();
    };
    window.addEventListener('notifications-updated', handleNotificationsUpdated);
    window.addEventListener('auth-user-updated', handleNotificationsUpdated);
    return () => {
      window.removeEventListener('notifications-updated', handleNotificationsUpdated);
      window.removeEventListener('auth-user-updated', handleNotificationsUpdated);
    };
  }, []);

  const navItems: NavItem[] = [
    {
      label: 'Dashboard',
      href: '/manager',
      icon: <LayoutDashboard size={18} />,
    },
    {
      label: 'Transport Requests',
      href: '/manager/requests',
      icon: <Truck size={18} />,
    },
    {
      label: 'Trip Planning',
      href: '/manager/planning',
      icon: <MapPin size={18} />,
    },
    {
      label: 'Staff Assignment',
      href: '/manager/staff',
      icon: <Users size={18} />,
    },
    {
      label: 'Incident Management',
      href: '/manager/incidents',
      icon: <AlertTriangle size={18} />,
      badge: 2,
      badgeColor: 'danger',
    },
  ];

  const managementItems: NavItem[] = [
    {
      label: 'Reports',
      href: '/manager/reports',
      icon: <BarChart3 size={18} />,
    },
    {
      label: 'Notifications',
      href: '/manager/notifications',
      icon: <Bell size={18} />,
      badge: unreadNotifs > 0 ? unreadNotifs : undefined,
      badgeColor: 'brand',
    },
    {
      label: 'Settings',
      href: '/manager/settings',
      icon: <Settings size={18} />,
    },
  ];

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const handleConfirmLogout = () => {
    setShowLogoutModal(false);
    clearAuthSession();
    router.push('/login');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', maxHeight: '100vh', backgroundColor: '#f9fafb', fontFamily: "'Inter', sans-serif", overflow: 'hidden' }}>
      <LogoutConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleConfirmLogout}
      />

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside
            style={{
              width: '260px',
              backgroundColor: '#0f172a',
              color: '#94a3b8',
              display: 'flex',
              flexDirection: 'column',
              height: '100vh',
              position: 'relative',
              zIndex: 51,
              borderRight: '1px solid rgba(255, 255, 255, 0.05)',
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
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '12px',
                    boxShadow: '0 0 15px rgba(37, 99, 235, 0.5)',
                    backgroundColor: '#0c1a2e',
                  }}
                >
                  <img src="/logo.png" alt="RaceHorse" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div>
                  <h1 style={{ color: '#ffffff', fontWeight: 800, fontSize: '14px', letterSpacing: '0.02em', lineHeight: 1.2, margin: 0 }}>
                    RaceHorse
                    <br />
                    <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500 }}>Logistics</span>
                  </h1>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                aria-label="Close navigation menu"
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
              <div>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px 12px' }}>
                  Main Operations
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {navItems.map((item) => {
                    const isActive = item.href === '/manager' ? pathname === '/manager' : pathname?.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: '10px',
                          backgroundColor: isActive ? '#1e3a8a' : 'transparent',
                          color: isActive ? '#ffffff' : '#94a3b8',
                          fontWeight: isActive ? 600 : 500,
                          fontSize: '13.5px',
                          textDecoration: 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ color: isActive ? '#60a5fa' : '#64748b' }}>{item.icon}</span>
                          {item.label}
                        </div>
                        {item.badge && (
                          <span style={{ backgroundColor: item.badgeColor === 'danger' ? '#ef4444' : '#2563eb', color: '#ffffff', fontSize: '10.5px', fontWeight: 700, padding: '2px 7px', borderRadius: '999px' }}>
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>

              <div>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px 12px' }}>
                  Management
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {managementItems.map((item) => {
                    const isActive = pathname?.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: '10px',
                          backgroundColor: isActive ? '#1e3a8a' : 'transparent',
                          color: isActive ? '#ffffff' : '#94a3b8',
                          fontWeight: isActive ? 600 : 500,
                          fontSize: '13.5px',
                          textDecoration: 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ color: isActive ? '#60a5fa' : '#64748b' }}>{item.icon}</span>
                          {item.label}
                        </div>
                        {item.badge && (
                          <span style={{ backgroundColor: '#2563eb', color: '#ffffff', fontSize: '10.5px', fontWeight: 700, padding: '2px 7px', borderRadius: '999px' }}>
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

      {/* LEFT SIDEBAR (Desktop) */}
      <aside
        className="hidden md:flex"
        style={{
          width: '260px',
          backgroundColor: '#0f172a',
          color: '#94a3b8',
          flexDirection: 'column',
          height: '100%',
          zIndex: 40,
          borderRight: '1px solid rgba(255, 255, 255, 0.05)',
          flexShrink: 0,
        }}
      >
        {/* Logo */}
        <div
          style={{
            height: '72px',
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '12px',
              boxShadow: '0 0 15px rgba(37, 99, 235, 0.5)',
              backgroundColor: '#0c1a2e',
            }}
          >
            <img src="/logo.png" alt="RaceHorse" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <h1 style={{ color: '#ffffff', fontWeight: 800, fontSize: '14px', letterSpacing: '0.02em', lineHeight: 1.2, margin: 0 }}>
              RaceHorse
              <br />
              <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500 }}>Logistics</span>
            </h1>
          </div>
        </div>

        {/* Navigation Groups */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '28px',
          }}
        >
          {/* NAVIGATION GROUP */}
          <div>
            <p
              style={{
                padding: '0 12px',
                fontSize: '10px',
                fontWeight: 600,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '8px',
              }}
            >
              Navigation
            </p>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {navItems.map((item) => {
                const isActive =
                  item.href === '/manager'
                    ? pathname === '/manager'
                    : pathname?.startsWith(item.href);

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
                      color: isActive ? '#ffffff' : '#94a3b8',
                      backgroundColor: isActive ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                      border: isActive ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid transparent',
                      textDecoration: 'none',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                        (e.currentTarget as HTMLElement).style.color = '#ffffff';
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
                      <span style={{ color: isActive ? '#cbd5e1' : '#64748b' }}>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>

                    {item.badge !== undefined && (
                      <span
                        style={{
                          backgroundColor: item.badgeColor === 'danger' ? '#ef4444' : '#2563eb',
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

          {/* MANAGEMENT GROUP */}
          <div>
            <p
              style={{
                padding: '0 12px',
                fontSize: '10px',
                fontWeight: 600,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '8px',
              }}
            >
              Management
            </p>
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
                      justifyContent: 'space-between',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      fontSize: '13.5px',
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? '#ffffff' : '#94a3b8',
                      backgroundColor: isActive ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                      textDecoration: 'none',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                        (e.currentTarget as HTMLElement).style.color = '#ffffff';
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
                      <span style={{ color: isActive ? '#cbd5e1' : '#64748b' }}>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>

                    {item.badge !== undefined && (
                      <span
                        style={{
                          backgroundColor: '#2563eb',
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
        <div style={{ padding: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Link
            href="/manager/support"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '8px 12px',
              fontSize: '13px',
              color: '#94a3b8',
              textDecoration: 'none',
              borderRadius: '8px',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#ffffff')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#94a3b8')}
          >
            <HelpCircle size={17} color="#64748b" />
            <span>Help & Support</span>
          </Link>

          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '12px',
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  backgroundColor: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#ffffff',
                  flexShrink: 0,
                }}
              >
                AM
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  Alex Morgan
                </p>
                <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  alex.m@racehorse.logistics
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              title="Log out"
              style={{
                color: '#64748b',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#ffffff')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#64748b')}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', overflow: 'hidden' }}>
        {/* TOP HEADER */}
        <header
          style={{
            height: '72px',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            position: 'sticky',
            top: 0,
            zIndex: 30,
            flexShrink: 0,
          }}
        >
          {/* Left: Mobile Menu Toggle & Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open mobile menu"
              className="md:hidden"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#374151',
              }}
            >
              <Menu size={22} />
            </button>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#111827', margin: 0, lineHeight: 1.2 }}>Dashboard</h2>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: '2px 0 0 0', fontWeight: 500 }} className="hidden sm:block">
                Overview of your racehorse transportation activities.
              </p>
            </div>
          </div>

          {/* Center: Search */}
          <div
            className="hidden sm:flex"
            style={{
              alignItems: 'center',
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '8px 14px',
              width: '380px',
              position: 'relative',
            }}
          >
            <Search size={15} color="#9ca3af" style={{ marginRight: '10px', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search requests, horses, documents..."
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
                color: '#1f2937',
                width: '100%',
              }}
            />
            <span
              style={{
                fontSize: '10.5px',
                fontWeight: 700,
                color: '#9ca3af',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                padding: '2px 5px',
                borderRadius: '4px',
                flexShrink: 0,
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
              }}
            >
              ⌘K
            </span>
          </div>

          {/* Right: Actions & User */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={() => router.push('/manager/notifications')}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: '1px solid #e5e7eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6b7280',
                backgroundColor: '#ffffff',
                position: 'relative',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
              }}
              title="Notifications"
            >
              <Bell size={16} />
              {unreadNotifs > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '9px',
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: '#ef4444',
                    border: '1px solid #ffffff',
                  }}
                />
              )}
            </button>

            <div
              onClick={() => setShowUserMenu(!showUserMenu)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '999px',
                padding: '3px 12px 3px 4px',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                AM
              </div>
              <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: 0 }}>Alex Morgan</p>
                <p style={{ fontSize: '10px', color: '#6b7280', margin: 0, fontWeight: 500, display: 'flex', alignItems: 'center', gap: '3px' }}>
                  Logistics Manager <ChevronDown size={10} />
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Content Container */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
          <div style={{ maxWidth: '1400px', margin: '0 auto' }}>{children}</div>
        </div>
      </main>
    </div>
  );
}
