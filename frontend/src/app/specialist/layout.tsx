'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ClipboardCheck,
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
  Menu,
  X,
} from 'lucide-react';
import { getAuthToken, setAuthSession, clearAuthSession } from '@/lib/auth';
import { LogoutConfirmModal } from '@/components/layout/LogoutConfirmModal';
import { apiClient } from '@/lib/api-client';

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
    // Ensure active specialist session exists
    const token = getAuthToken();
    if (!token) {
      setAuthSession('mock-jwt-token-specialist', {
        id: 'usr-spec-01',
        name: 'Sarah Jenkins',
        email: 'sarah.j@racehorse.logistics',
        role: 'TRANSPORT_SPECIALIST',
        organization: 'RaceHorse Logistics',
        initials: 'SJ',
      });
    }

    fetchUnread();

    const handleNotificationsUpdated = () => {
      fetchUnread();
    };
    window.addEventListener('notifications-updated', handleNotificationsUpdated);
    window.addEventListener('auth-user-updated', handleNotificationsUpdated);
    const interval = setInterval(fetchUnread, 10000);

    return () => {
      window.removeEventListener('notifications-updated', handleNotificationsUpdated);
      window.removeEventListener('auth-user-updated', handleNotificationsUpdated);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    fetchUnread();
  }, [pathname]);

  const navItems: NavItem[] = [
    {
      label: 'Dashboard',
      href: '/specialist',
      icon: <LayoutDashboard size={18} />,
    },
    {
      label: 'Compliance Orders',
      href: '/specialist/compliance-orders',
      icon: <ClipboardCheck size={18} />,
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
    },
    {
      label: 'Missing Documents',
      href: '/specialist/missing',
      icon: <FileX size={18} />,
    },
  ];

  const managementItems: NavItem[] = [
    {
      label: 'Notifications',
      href: '/specialist/notifications',
      icon: <Bell size={18} />,
      badge: unreadNotifs > 0 ? unreadNotifs : undefined,
      badgeColor: 'brand',
    },
    {
      label: 'Settings',
      href: '/specialist/settings',
      icon: <Settings size={18} />,
    },
  ];

  const handleLogoutConfirm = () => {
    setShowLogoutModal(false);
    clearAuthSession();
    router.push('/login');
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans overflow-hidden">
      {/* Logout confirmation modal */}
      <LogoutConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleLogoutConfirm}
      />

      {/* LEFT SIDEBAR (DESKTOP) */}
      <aside className="hidden md:flex w-[260px] bg-slate-900 text-slate-400 flex-col h-full z-40 border-r border-white/5 shrink-0">
        {/* Logo */}
        <div className="h-[72px] flex items-center px-6 border-b border-white/5 shrink-0">
          <div className="w-[34px] h-[34px] rounded-lg overflow-hidden flex items-center justify-center mr-3 shadow-[0_0_15px_rgba(37,99,235,0.5)] bg-[#0c1a2e]">
            <img src="/logo.png" alt="RaceHorse" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-white font-extrabold text-sm tracking-[0.02em] leading-tight m-0">
              RaceHorse
              <br />
              <span className="text-[10px] text-slate-400 font-medium">Logistics</span>
            </h1>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-7">
          {/* OVERVIEW GROUP */}
          <div>
            <p className="px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
              Overview
            </p>
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => {
                const isActive = item.href === '/specialist' ? pathname === '/specialist' : pathname?.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors ${
                      isActive 
                        ? 'font-semibold text-white bg-white/10 border border-white/5' 
                        : 'text-slate-400 border border-transparent hover:bg-white/5 hover:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={isActive ? 'text-slate-300' : 'text-slate-500'}>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>

                    {item.badge !== undefined && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${
                          item.badgeColor === 'danger' ? 'bg-red-500' : 'bg-blue-600'
                        }`}
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
            <p className="px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
              Management
            </p>
            <nav className="flex flex-col gap-1">
              {managementItems.map((item) => {
                const isActive = pathname?.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors ${
                      isActive 
                        ? 'font-semibold text-white bg-white/10 border border-white/5' 
                        : 'text-slate-400 border border-transparent hover:bg-white/5 hover:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={isActive ? 'text-slate-300' : 'text-slate-500'}>{item.icon}</span>
                      <span>{item.label}</span>
                    </div>

                    {item.badge !== undefined && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${
                          item.badgeColor === 'danger' ? 'bg-red-500' : 'bg-blue-600'
                        }`}
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
        <div className="p-4 border-t border-white/5 flex flex-col gap-2.5">
          <div className="bg-white/5 rounded-xl px-3 py-2.5 flex items-center justify-between border border-white/10">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-[34px] h-[34px] rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                SJ
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-white m-0 truncate">
                  Sarah Jenkins
                </p>
                <p className="text-[10px] text-slate-400 m-0 truncate">
                  Transport Specialist
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowLogoutModal(true)}
              title="Log out"
              aria-label="Log out"
              className="text-slate-500 hover:text-red-400 p-1 bg-transparent border-none cursor-pointer transition-colors"
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
          <aside className="w-[260px] bg-slate-900 text-slate-400 flex flex-col h-screen relative z-50">
            {/* Logo + Close */}
            <div className="h-[72px] flex items-center justify-between px-5 border-b border-white/5 shrink-0">
              <div className="flex items-center">
                <div className="w-[34px] h-[34px] rounded-lg overflow-hidden flex items-center justify-center mr-3 bg-[#0c1a2e]">
                  <img src="/logo.png" alt="RaceHorse" className="w-full h-full object-cover" />
                </div>
                <h1 className="text-white font-extrabold text-sm m-0">
                  RaceHorse <span className="text-[10px] text-slate-400 font-medium">Logistics</span>
                </h1>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation"
                className="bg-transparent border-none text-slate-400 p-1 cursor-pointer hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Nav links */}
            <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-6">
              <div>
                <p className="px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Overview</p>
                <nav className="flex flex-col gap-1">
                  {navItems.map((item) => {
                    const isActive = item.href === '/specialist' ? pathname === '/specialist' : pathname?.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-[13.5px] font-medium ${
                          isActive ? 'text-white bg-white/10' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {item.icon}
                          <span>{item.label}</span>
                        </div>
                        {item.badge !== undefined && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${item.badgeColor === 'danger' ? 'bg-red-500' : 'bg-blue-600'}`}>
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </nav>
              </div>

              <div>
                <p className="px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Management</p>
                <nav className="flex flex-col gap-1">
                  {managementItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-between px-3 py-2 rounded-lg text-[13.5px] font-medium text-slate-400 hover:text-white"
                    >
                      <div className="flex items-center gap-3">
                        {item.icon}
                        <span>{item.label}</span>
                      </div>
                      {item.badge !== undefined && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${
                            item.badgeColor === 'danger' ? 'bg-red-500' : 'bg-blue-600'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  ))}
                </nav>
              </div>
            </div>

            {/* Mobile Logout */}
            <div className="p-4 border-t border-white/5">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShowLogoutModal(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-red-500/10 text-red-400 border-none cursor-pointer font-semibold text-[13.5px]"
              >
                <LogOut size={16} />
                <span>Log out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* TOP HEADER */}
        <header className="h-[72px] bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-30">
          {/* Left: Mobile Menu Toggle & Title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open mobile menu"
              className="md:hidden bg-transparent border-none cursor-pointer p-1 text-slate-700 flex items-center justify-center"
            >
              <Menu size={22} />
            </button>
            <div>
              <h2 className="text-[17px] font-bold text-slate-900 m-0 leading-tight">Specialist Workspace</h2>
              <p className="text-[13px] text-slate-500 mt-0.5 mb-0 font-medium hidden sm:block">
                Medical, quarantine, and customs compliance operations.
              </p>
            </div>
          </div>

          {/* Center: Search */}
          <div className="hidden sm:flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 w-[380px] relative focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-all">
            <Search size={15} className="text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search horses, documents, requests..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchTerm.trim()) {
                  router.push(`/specialist/documents?search=${encodeURIComponent(searchTerm.trim())}`);
                }
              }}
              className="border-none outline-none bg-transparent text-[13.5px] text-slate-800 w-full placeholder-slate-400"
            />
            <span className="text-[10.5px] font-bold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded shrink-0 shadow-sm">
              ⌘K
            </span>
          </div>

          {/* Right: Actions & User */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/specialist/notifications')}
              aria-label="Notifications"
              title="Notifications"
              className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 bg-white relative cursor-pointer hover:bg-slate-50 transition-colors"
            >
              <Bell size={16} />
              {unreadNotifs > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    minWidth: '18px',
                    height: '18px',
                    padding: '0 4px',
                    borderRadius: '999px',
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                    fontSize: '10px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid #ffffff',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  }}
                >
                  {unreadNotifs > 99 ? '99+' : unreadNotifs}
                </span>
              )}
            </button>

            <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-full pl-1 pr-3 py-1 cursor-pointer hover:bg-slate-100 transition-colors">
              <div className="w-[30px] h-[30px] rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shadow-inner">
                SJ
              </div>
              <div className="text-left leading-tight">
                <p className="text-[13px] font-semibold text-slate-900 m-0">Sarah Jenkins</p>
                <p className="text-[10px] text-slate-500 m-0 font-medium flex items-center gap-1">
                  Specialist <ChevronDown size={10} />
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Content Container */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-[1400px] mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
