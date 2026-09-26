'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { CustomerStoreProvider } from '@/lib/customer-store';
import { getAuthToken } from '@/lib/auth';

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      const redirectUrl = pathname ? `/login?redirect=${encodeURIComponent(pathname)}` : '/login';
      router.push(redirectUrl);
    } else {
      setIsAuthenticated(true);
    }
  }, [router, pathname]);

  if (isAuthenticated === null) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0c182b',
          color: '#94a3b8',
          fontSize: '14px',
          fontWeight: 500,
        }}
      >
        Verifying authorization...
      </div>
    );
  }

  return (
    <CustomerStoreProvider>
      <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-page)' }}>
        {/* Sidebar Navigation */}
        <Sidebar />

        {/* Main Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Header />
          <main
            style={{
              flex: 1,
              padding: '32px',
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
