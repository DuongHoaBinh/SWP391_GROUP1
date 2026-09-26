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
  Sparkles,
} from 'lucide-react';
import { clearAuthSession, getCurrentUser } from '@/lib/auth';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
  badgeColor?: 'red' | 'blue';
}

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const user = getCurrentUser();

  const navItems: NavItem[] = [
    {
      label: 'Dashboard',
      href: '/customer',
      icon: <LayoutDashboard size={20} />,
    },
    {
      label: 'Transport Requests',
      href: '/customer/requests',
      icon: <Truck size={20} />,
    },
    {
      label: 'My Horses',
      href: '/customer/horses',
      icon: (
        <svg
          width="20"
          height="20"
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
      icon: <FolderClosed size={20} />,
      badge: 2,
      badgeColor: 'red',
    },
    {
      label: 'Trip Tracking',
      href: '/customer/tracking',
      icon: <Navigation size={20} />,
    },
    {
      label: 'Notifications',
      href: '/customer/notifications',
      icon: <Bell size={20} />,
      badge: 4,
      badgeColor: 'blue',
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
        backgroundColor: 'var(--sidebar-bg)',
        color: 'var(--sidebar-text)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
        flexShrink: 0,
        zIndex: 100,
        borderRight: '1px solid var(--sidebar-border)',
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          padding: '24px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            backgroundColor: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)',
            flexShrink: 0,
          }}
        >
          {/* Horse Silhouette Logo */}
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 16v-1c0-4-3-6-7-6H9l-2-3H3l1 5-2 3v3h10" />
            <circle cx="8" cy="7" r="1" />
          </svg>
        </div>
        <div>
          <h1
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.2,
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            EquiTransit
          </h1>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#94a3b8',
              letterSpacing: '0.01em',
            }}
          >
            Logistics
          </span>
        </div>
      </div>

      {/* Main Nav Items */}
      <nav
        style={{
          flex: 1,
          padding: '16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          overflowY: 'auto',
        }}
      >
        {navItems.map((item) => {
          const isActive =
            item.href === '/customer'
              ? pathname === '/customer'
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#ffffff' : 'var(--sidebar-text)',
                backgroundColor: isActive ? 'var(--primary)' : 'transparent',
                transition: 'all 0.15s ease-in-out',
                boxShadow: isActive ? '0 4px 12px rgba(37, 99, 235, 0.35)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ display: 'flex', alignItems: 'center', opacity: isActive ? 1 : 0.85 }}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </div>

              {item.badge !== undefined && (
                <span
                  style={{
                    backgroundColor: item.badgeColor === 'red' ? '#ef4444' : '#2563eb',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '999px',
                    minWidth: '20px',
                    height: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 5px',
                  }}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      <div
        style={{
          padding: '16px 14px',
          borderTop: '1px solid var(--sidebar-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* Help & Support */}
        <Link
          href="/customer/support"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 10px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--sidebar-text)',
            transition: 'background-color 0.15s ease',
          }}
        >
          <HelpCircle size={18} />
          <span>Help & Support</span>
        </Link>

        {/* User Card */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 10px',
            borderRadius: '10px',
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: '#ffffff',
                color: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '13px',
              }}
            >
              {user.initials}
            </div>
            <div>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#ffffff',
                  lineHeight: 1.2,
                }}
              >
                {user.name}
              </div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#64748b',
                  letterSpacing: '0.04em',
                }}
              >
                {user.role}
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            title="Log Out"
            style={{
              padding: '6px',
              color: '#94a3b8',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s ease',
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
};
