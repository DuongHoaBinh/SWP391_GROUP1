'use client';

import React from 'react';
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
} from 'lucide-react';
import { clearAuthSession, getCurrentUser } from '@/lib/auth';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
}

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const user = getCurrentUser();

  const navItems: NavItem[] = [
    {
      label: 'Dashboard',
      href: '/customer',
      icon: <LayoutDashboard size={18} />,
    },
    {
      label: 'Transport Requests',
      href: '/customer/requests',
      icon: <Truck size={18} />,
    },
    {
      label: 'My Horses',
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
      label: 'Documents',
      href: '/customer/documents',
      icon: <FolderClosed size={18} />,
      badge: 2,
    },
    {
      label: 'Trip Tracking',
      href: '/customer/tracking',
      icon: <Navigation size={18} />,
    },
    {
      label: 'Notifications',
      href: '/customer/notifications',
      icon: <Bell size={18} />,
      badge: 3,
    },
  ];

  const managementItems: NavItem[] = [
    {
      label: 'Reports',
      href: '/customer/reports',
      icon: <BarChart3 size={18} />,
    },
    {
      label: 'Settings',
      href: '/customer/settings',
      icon: <Settings size={18} />,
    },
  ];

  const handleLogout = () => {
    if (confirm('Are you sure you want to log out?')) {
      clearAuthSession();
      router.push('/login');
    }
  };

  return (
    <aside
      style={{
        width: '260px',
        backgroundColor: '#0c121e',
        color: '#94a3b8',
        display: 'flex',
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
            background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5" cy="19" r="2" fill="#fff" />
            <path d="M5 17c0-5 4-9 9-9h5" />
            <polyline points="15 4 19 8 15 12" />
          </svg>
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
        {/* Help & Support */}
        <Link
          href="/customer/support"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '9px 12px',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#94a3b8',
            textDecoration: 'none',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#ffffff')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#94a3b8')}
        >
          <HelpCircle size={17} color="#64748b" />
          <span>Help & Support</span>
        </Link>

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
              AM
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#ffffff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Alex Morgan
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: '#64748b',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                alex@stablesco.com
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
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
  );
};
