'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
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
} from 'lucide-react';
import { getAuthToken, setAuthSession, clearAuthSession } from '@/lib/auth';

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

  useEffect(() => {
    // Ensure active specialist session exists
    const token = getAuthToken();
    if (!token) {
      setAuthSession('mock-jwt-token-specialist', {
        id: 'usr-spec-01',
        name: 'Alex Morgan',
        email: 'alex.m@racehorse.logistics',
        role: 'TRANSPORT_SPECIALIST',
        organization: 'RaceHorse Logistics',
        initials: 'AM',
      });
    }
  }, []);

  const navItems: NavItem[] = [
    {
      label: 'Dashboard',
      href: '/specialist',
      icon: <LayoutDashboard size={18} />,
    },
    {
      label: 'Regulations',
      href: '/specialist/regulations',
      icon: <Scale size={18} />,
    },
    {
      label: 'Transport Documents',
      href: '/specialist/documents',
      icon: <FolderOpen size={18} />,
    },
    {
      label: 'Document Approval',
      href: '/specialist/approval',
      icon: <FileSignature size={18} />,
      badge: 12,
      badgeColor: 'brand',
    },
    {
      label: 'Missing Documents',
      href: '/specialist/missing',
      icon: <FileX size={18} />,
      badge: 5,
      badgeColor: 'danger',
    },
  ];

  const managementItems: NavItem[] = [
    {
      label: 'Notifications',
      href: '/specialist/notifications',
      icon: <Bell size={18} />,
    },
    {
      label: 'Settings',
      href: '/specialist/settings',
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
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f9fafb', fontFamily: "'Inter', sans-serif" }}>
      {/* LEFT SIDEBAR */}
      <aside
        style={{
          width: '260px',
          backgroundColor: '#0f172a',
          color: '#94a3b8',
          display: 'flex',
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
            <p style={{ padding: '0 12px', fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
              Overview
            </p>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {navItems.map((item) => {
                const isActive = item.href === '/specialist' ? pathname === '/specialist' : pathname?.startsWith(item.href);

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
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Bottom Area */}
        <div style={{ padding: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Link
            href="/specialist/support"
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
                  Transport Specialist
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
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
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
          {/* Left: Title */}
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#111827', margin: 0, lineHeight: 1.2 }}>Dashboard</h2>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '2px 0 0 0', fontWeight: 500 }}>
              Overview of medical, quarantine and customs compliance.
            </p>
          </div>

          {/* Center: Search */}
          <div
            style={{
              display: 'flex',
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
              placeholder="Search horses, documents, requests..."
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
                  Transport Specialist <ChevronDown size={10} />
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
