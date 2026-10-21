'use client';

import React, { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { getAuthToken, setAuthSession, clearAuthSession, getCurrentUser } from '@/lib/auth';
import { LogoutConfirmModal } from '@/components/layout/LogoutConfirmModal';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useLanguage } from '@/lib/i18n/LanguageContext';

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
  const { t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Ensure active coordinator session exists
    const token = getAuthToken();
    const user = getCurrentUser();
    if (!token || (user.role !== 'FLEET_ROUTE_COORDINATOR' && user.role !== 'ADMIN')) {
      setAuthSession('mock-jwt-token-coordinator', {
        id: '4',
        name: 'Alex Morgan',
        email: 'coordinator@example.com',
        role: 'FLEET_ROUTE_COORDINATOR',
        organization: 'RaceHorse Logistics',
        initials: 'AM',
      });
    }
  }, []);

  const navItems: NavItem[] = [
    {
      label: t('nav.dashboard', 'Dashboard'),
      href: '/coordinator',
      icon: <LayoutDashboard size={18} />,
    },
    {
      label: t('nav.routes', 'Route Planning'),
      href: '/coordinator/routes',
      icon: <Map size={18} />,
    },
    {
      label: t('nav.vehicles', 'Vehicle Management'),
      href: '/coordinator/vehicles',
      icon: <Truck size={18} />,
    },
    {
      label: t('nav.schedule', 'Trip Schedule'),
      href: '/coordinator/schedule',
      icon: <CalendarDays size={18} />,
    },
    {
      label: t('nav.monitoring', 'Trip Monitoring'),
      href: '/coordinator/monitoring',
      icon: <Radio size={18} />,
    },
  ];

  const managementItems: NavItem[] = [
    {
      label: t('nav.alerts', 'Alerts'),
      href: '/coordinator/alerts',
      icon: <AlertTriangle size={18} />,
      badge: 3,
    },
    {
      label: t('common.notifications', 'Notifications'),
      href: '/coordinator/notifications',
      icon: <Bell size={18} />,
    },
    {
      label: t('common.settings', 'Settings'),
      href: '/coordinator/settings',
      icon: <Settings size={18} />,
    },
  ];

  const handleLogoutConfirm = () => {
    setShowLogoutModal(false);
    clearAuthSession();
    router.push('/login');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', maxHeight: '100vh', backgroundColor: '#f9fafb', fontFamily: "'Inter', sans-serif", overflow: 'hidden' }}>
      {/* Logout confirmation modal */}
      <LogoutConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleLogoutConfirm}
      />

      {/* LEFT SIDEBAR (DESKTOP) */}
      <aside
        className="hidden md:flex"
        style={{
          width: '260px',
          backgroundColor: '#0f172a',
          color: '#94a3b8',
          display: 'flex',
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

        {/* Navigation */}
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
          {/* OVERVIEW GROUP */}
          <div>
            <p style={{ padding: '0 12px', fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              Overview
            </p>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {navItems.map((item) => {
                const isActive = item.href === '/coordinator' ? pathname === '/coordinator' : pathname?.startsWith(item.href);

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
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ color: isActive ? '#cbd5e1' : '#64748b' }}>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* MANAGEMENT GROUP */}
          <div>
            <p style={{ padding: '0 12px', fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
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
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ color: isActive ? '#cbd5e1' : '#64748b' }}>{item.icon}</span>
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
        <div style={{ padding: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Link
            href="/coordinator/support"
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
                  Route Coordinator
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowLogoutModal(true)}
              title="Log out"
              aria-label="Log out"
              style={{
                color: '#64748b',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* MOBILE DRAWER */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation"
          className="fixed inset-0 z-50 flex md:hidden"
        >
          <div
            className="fixed inset-0 bg-black/50 transition-opacity"
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
            }}
          >
            {/* Logo + Close */}
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
                    backgroundColor: '#0c1a2e',
                  }}
                >
                  <img src="/logo.png" alt="RaceHorse" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <h1 style={{ color: '#ffffff', fontWeight: 800, fontSize: '14px', margin: 0 }}>
                  RaceHorse <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500 }}>Logistics</span>
                </h1>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Nav links */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
              <div>
                <p style={{ padding: '0 12px', fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Overview
                </p>
                <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        fontSize: '13.5px',
                        color: pathname === item.href ? '#ffffff' : '#94a3b8',
                        backgroundColor: pathname === item.href ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {item.icon} {item.label}
                      </span>
                    </Link>
                  ))}
                </nav>
              </div>

              <div>
                <p style={{ padding: '0 12px', fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Management
                </p>
                <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {managementItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        fontSize: '13.5px',
                        color: pathname === item.href ? '#ffffff' : '#94a3b8',
                        backgroundColor: pathname === item.href ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {item.icon} {item.label}
                      </span>
                      {item.badge && (
                        <span style={{ backgroundColor: '#2563eb', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '999px' }}>
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  ))}
                </nav>
              </div>
            </div>

            {/* Logout button */}
            <div style={{ padding: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShowLogoutModal(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13.5px',
                  fontWeight: 600,
                }}
              >
                <LogOut size={16} />
                <span>Log out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

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
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#111827', margin: 0, lineHeight: 1.2 }}>
                {t('coordinator.title', 'Dashboard')}
              </h2>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: '2px 0 0 0', fontWeight: 500 }} className="hidden sm:block">
                {t('coordinator.subtitle', 'Overview of fleet, routes and transportation schedules.')}
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
              placeholder={t('common.search', 'Search trips, vehicles, routes...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchTerm.trim()) {
                  router.push(`/coordinator/routes?search=${encodeURIComponent(searchTerm.trim())}`);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {/* Language Switcher */}
            <LanguageSwitcher variant="pill" />

            <button
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
              }}
            >
              <Bell size={16} />
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
            </button>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '999px',
                padding: '3px 12px 3px 4px',
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
                  Route Coordinator <ChevronDown size={10} />
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Content Container */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
          <div style={{ maxWidth: '1400px', margin: '0 auto' }}>{children}</div>
        </div>
      </main>
    </div>
  );
}
