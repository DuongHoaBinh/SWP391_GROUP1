'use client';

import React, { useEffect, useState } from 'react';
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
  Plus,
} from 'lucide-react';
import { getAuthToken, setAuthSession, clearAuthSession, getCurrentUser } from '@/lib/auth';
import { LogoutConfirmModal } from '@/components/layout/LogoutConfirmModal';
import { apiClient } from '@/lib/api-client';
import toast from 'react-hot-toast';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
}

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [activeUser, setActiveUser] = useState(() => getCurrentUser());

  const currentPersona =
    activeUser?.persona === 'escort' ||
    activeUser?.specialization === 'escort' ||
    activeUser?.email?.toLowerCase().includes('escort')
      ? 'escort'
      : 'driver';

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
    // Preserve logged in driver session if exists
    const token = getAuthToken();
    const user = getCurrentUser();

    if (!token || !user || (user.role !== 'DRIVER_ESCORT' && !user.email?.includes('driver') && !user.email?.includes('escort'))) {
      setAuthSession('mock-jwt-token-driver', {
        id: '10',
        name: 'Trần Văn Lái (Tài xế 1)',
        email: 'driver1@example.com',
        role: 'DRIVER_ESCORT',
        organization: 'RaceHorse Logistics',
        initials: 'TL',
        persona: 'driver',
      });
      setActiveUser(getCurrentUser());
    } else {
      if (!user.persona) {
        user.persona = user.email?.includes('escort') ? 'escort' : 'driver';
        setAuthSession(token, user);
      }
      setActiveUser(user);
    }
    fetchUnread();
  }, [pathname]);

  const handleSwitchPersona = (target: 'driver' | 'escort') => {
    const existing = getCurrentUser();
    if (target === 'driver') {
      const isAlreadyDriver = existing?.email?.includes('driver');
      if (isAlreadyDriver && existing) {
        setAuthSession(getAuthToken() || 'mock-jwt-token-driver', {
          ...existing,
          persona: 'driver',
        });
      } else {
        setAuthSession('mock-jwt-token-driver', {
          id: '10',
          name: 'Trần Văn Lái (Tài xế 1)',
          email: 'driver1@example.com',
          role: 'DRIVER_ESCORT',
          organization: 'RaceHorse Logistics',
          initials: 'TL',
          persona: 'driver',
        });
      }
      toast.success('Đã chuyển sang vai trò: Tài xế lái xe (Driver)');
    } else {
      const isAlreadyEscort = existing?.email?.includes('escort');
      if (isAlreadyEscort && existing) {
        setAuthSession(getAuthToken() || 'mock-jwt-token-driver', {
          ...existing,
          persona: 'escort',
        });
      } else {
        setAuthSession('mock-jwt-token-driver', {
          id: '13',
          name: 'BS. Hoàng Văn Y (Bác sĩ thú y)',
          email: 'escort1@example.com',
          role: 'DRIVER_ESCORT',
          organization: 'RaceHorse Logistics',
          initials: 'HY',
          persona: 'escort',
        });
      }
      toast.success('Đã chuyển sang vai trò: Bác sĩ thú y / Hộ tống (Escort/Vet)');
    }
    setActiveUser(getCurrentUser());
    window.location.reload();
  };

  const navItems: NavItem[] = [
    {
      label: 'Dashboard',
      href: '/driver',
      icon: <LayoutDashboard size={18} />,
    },
    {
      label: 'My Trips',
      href: '/driver/trips',
      icon: <Truck size={18} />,
    },
    {
      label: 'Trip Status',
      href: '/driver/status',
      icon: <Crosshair size={18} />,
    },
    {
      label: 'Horse Health',
      href: '/driver/health',
      icon: <Stethoscope size={18} />,
    },
    {
      label: 'Incident Reports',
      href: '/driver/incidents',
      icon: <AlertTriangle size={18} />,
    },
  ];

  const managementItems: NavItem[] = [
    {
      label: 'Notifications',
      href: '/driver/notifications',
      icon: <Bell size={18} />,
      badge: unreadNotifs > 0 ? unreadNotifs : undefined,
    },
    {
      label: 'Profile',
      href: '/driver/profile',
      icon: <User size={18} />,
    },
  ];

  const handleLogoutConfirm = () => {
    setShowLogoutModal(false);
    clearAuthSession();
    router.push('/login');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', maxHeight: '100vh', overflow: 'hidden', backgroundColor: '#f9fafb', fontFamily: "'Inter', sans-serif" }}>
      {/* Logout confirmation modal */}
      <LogoutConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleLogoutConfirm}
      />

      {/* LEFT SIDEBAR (Desktop) */}
      <aside
        className="hidden lg:flex"
        style={{
          width: '260px',
          backgroundColor: '#0f172a',
          color: '#94a3b8',
          flexDirection: 'column',
          height: '100vh',
          position: 'sticky',
          top: 0,
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
              backgroundColor: '#2563eb',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '17px',
              marginRight: '12px',
              boxShadow: '0 0 15px rgba(37, 99, 235, 0.5)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4">
              <circle cx="5" cy="19" r="2" fill="#fff" />
              <path d="M5 17c0-5 4-9 9-9h5" />
              <polyline points="15 4 19 8 15 12" />
            </svg>
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
              Overview
            </p>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {navItems.map((item) => {
                const isActive = item.href === '/driver' ? pathname === '/driver' : pathname?.startsWith(item.href);

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
            href="/driver/support"
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
                  backgroundColor: currentPersona === 'escort' ? '#059669' : '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#ffffff',
                  flexShrink: 0,
                }}
              >
                {activeUser?.initials || activeUser?.name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'DR'}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={activeUser?.name}>
                  {activeUser?.name || 'Tài xế'}
                </p>
                <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {currentPersona === 'escort' ? 'Bác sĩ thú y / Hộ tống' : 'Tài xế lái xe'}
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
          className="fixed inset-0 z-50 flex lg:hidden"
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
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '17px',
                    marginRight: '12px',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4">
                    <circle cx="5" cy="19" r="2" fill="#fff" />
                    <path d="M5 17c0-5 4-9 9-9h5" />
                    <polyline points="15 4 19 8 15 12" />
                  </svg>
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
                  Account
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
          {/* Left: Mobile Menu + Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open mobile menu"
              className="lg:hidden"
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                backgroundColor: '#f9fafb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <Menu size={18} color="#4b5563" />
            </button>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#111827', margin: 0, lineHeight: 1.2 }}>Dashboard</h2>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: '2px 0 0 0', fontWeight: 500 }}>
                Overview of your assigned trips and horses.
              </p>
            </div>
          </div>

          {/* Right: Notification & User Profile */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>

            <button
              onClick={() => router.push('/driver/notifications')}
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
                  backgroundColor: currentPersona === 'escort' ? '#059669' : '#2563eb',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                {activeUser?.initials || (currentPersona === 'escort' ? 'HY' : 'TL')}
              </div>
              <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', margin: 0 }}>
                  {activeUser?.name || (currentPersona === 'escort' ? 'BS. Hoàng Văn Y' : 'Trần Văn Lái')}
                </p>
                <p style={{ fontSize: '10px', color: currentPersona === 'escort' ? '#059669' : '#2563eb', margin: 0, fontWeight: 700 }}>
                  {currentPersona === 'escort' ? 'Bác sĩ Thú y / Hộ tống' : 'Tài xế Lái xe'}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Content Container */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 40px 24px' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>{children}</div>
        </div>
      </main>
    </div>
  );
}
