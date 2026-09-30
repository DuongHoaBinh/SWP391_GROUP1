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
        name: 'Sarah Jenkins',
        email: 'sarah.j@racehorse.logistics',
        role: 'TRANSPORT_SPECIALIST',
        organization: 'RaceHorse Logistics',
        initials: 'SJ',
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
    <div className="flex min-h-screen bg-slate-50 font-sans">
      {/* LEFT SIDEBAR */}
      <aside className="w-[260px] bg-slate-900 text-slate-400 flex flex-col h-screen sticky top-0 z-40 border-r border-white/5 shrink-0">
        {/* Logo */}
        <div className="h-[72px] flex items-center px-6 border-b border-white/5 shrink-0">
          <div className="w-[34px] h-[34px] rounded-lg bg-blue-600 text-white flex items-center justify-center font-extrabold text-[17px] mr-3 shadow-[0_0_15px_rgba(37,99,235,0.5)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4">
              <circle cx="5" cy="19" r="2" fill="#fff" />
              <path d="M5 17c0-5 4-9 9-9h5" />
              <polyline points="15 4 19 8 15 12" />
            </svg>
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
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Bottom Area */}
        <div className="p-4 border-t border-white/5 flex flex-col gap-2.5">
          <Link
            href="/specialist/support"
            className="flex items-center gap-3 px-3 py-2 text-[13px] text-slate-400 hover:text-white transition-colors rounded-lg"
          >
            <HelpCircle size={17} className="text-slate-500" />
            <span>Help & Support</span>
          </Link>

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
              onClick={handleLogout}
              title="Log out"
              className="text-slate-500 hover:text-red-400 p-1 bg-transparent border-none cursor-pointer transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* TOP HEADER */}
        <header className="h-[72px] bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-30 shrink-0">
          {/* Left: Title */}
          <div>
            <h2 className="text-[17px] font-bold text-slate-900 m-0 leading-tight">Specialist Workspace</h2>
            <p className="text-[13px] text-slate-500 mt-0.5 mb-0 font-medium">
              Medical, quarantine, and customs compliance operations.
            </p>
          </div>

          {/* Center: Search */}
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 w-[380px] relative focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-all">
            <Search size={15} className="text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search horses, documents, requests..."
              className="border-none outline-none bg-transparent text-[13.5px] text-slate-800 w-full placeholder-slate-400"
            />
            <span className="text-[10.5px] font-bold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded shrink-0 shadow-sm">
              ⌘K
            </span>
          </div>

          {/* Right: Actions & User */}
          <div className="flex items-center gap-4">
            <button className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 bg-white relative cursor-pointer hover:bg-slate-50 transition-colors">
              <Bell size={16} />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 border border-white" />
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
