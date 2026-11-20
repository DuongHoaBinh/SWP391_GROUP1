'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { AmbientCanvas } from '@/components/layout/AmbientCanvas';
import { PortalLoadingSkeleton } from '@/components/layout/PortalLoadingSkeleton';
import { CustomerStoreProvider } from '@/lib/customer-store';
import { getAuthToken, getCurrentUser } from '@/lib/auth';
import { getDashboardRouteForRole } from '@/lib/auth-redirect';

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      const target = pathname ? `?redirect=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${target}`);
      return;
    }

    const user = getCurrentUser();
    if (user?.role && user.role !== 'CUSTOMER' && user.role !== 'ADMIN') {
      const target =
        user.role === 'DRIVER_ESCORT'
          ? user.persona === 'escort' ||
            String(user.specialization || '').toLowerCase() === 'escort'
            ? '/escort'
            : '/driver'
          : getDashboardRouteForRole(user.role);
      router.replace(target);
      return;
    }

    setIsAuthorized(true);
  }, [router, pathname]);

  if (!isAuthorized) {
    return (
      <div
        className="min-h-screen p-6 sm:p-10"
        style={{ backgroundColor: 'var(--color-page-bg, #F4F1E9)' }}
      >
        <PortalLoadingSkeleton />
      </div>
    );
  }

  return (
    <CustomerStoreProvider>
      <div
        className="flex min-h-screen relative"
        style={{ backgroundColor: 'var(--color-page-bg, #F4F1E9)' }}
      >
        <AmbientCanvas />

        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

        <div className="flex-1 flex flex-col min-w-0">
          <Header onMenuClick={() => setMobileOpen(true)} />
          <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-8 pt-6 pb-12">
            {children}
          </main>
        </div>
      </div>
    </CustomerStoreProvider>
  );
}
