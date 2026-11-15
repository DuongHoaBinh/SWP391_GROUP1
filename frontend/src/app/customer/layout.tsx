'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { CustomerStoreProvider } from '@/lib/customer-store';
import { getAuthToken } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pageTitle = [
    ['/customer/requests', t('nav.requests', 'Transport Requests')],
    ['/customer/horses', t('nav.horses', 'My Horses')],
    ['/customer/documents', t('nav.documents', 'Documents & Compliance')],
    ['/customer/tracking', t('nav.tracking', 'Trip Tracking')],
    ['/customer/notifications', t('nav.notifications', 'Notifications')],
    ['/customer/reports', t('nav.reports', 'Reports & Analytics')],
    ['/customer/settings', t('nav.settings', 'Settings')],
  ].find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + '/'))?.[1] ?? t('nav.dashboard', 'Dashboard');

  useEffect(() => { setMobileMenuOpen(false); }, [pathname]);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login?redirect=/customer');
    }
  }, [router]);

  return (
    <CustomerStoreProvider>
      <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-page)' }}>
        {/* Sidebar Navigation */}
        <Sidebar mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

        {/* Main Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, backgroundColor: '#f8fafc' }}>
          <Header title={pageTitle} subtitle={pathname === '/customer' ? 'Overview of your racehorse transportation activities.' : ''} onMenuClick={() => setMobileMenuOpen(true)} />
          <main
            className="px-4 pb-12 pt-6 sm:px-6 xl:px-8"
            style={{
              flex: 1,
              maxWidth: '1600px',
              width: '100%',
              margin: '0 auto',
            }}
          >
            {children}
          </main>
        </div>
      </div>
    </CustomerStoreProvider>
  );
}
