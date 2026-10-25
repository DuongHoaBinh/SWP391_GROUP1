'use client';

import React, { useEffect } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { CustomerStoreProvider } from '@/lib/customer-store';
import { getAuthToken, getCurrentUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  useEffect(() => {
    const token = getAuthToken();
    if (!token || token.startsWith('mock-') || getCurrentUser().role !== 'CUSTOMER') router.replace('/login');
  }, [router]);

  return (
    <CustomerStoreProvider>
      <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-page)' }}>
        {/* Sidebar Navigation */}
        <Sidebar />

        {/* Main Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, backgroundColor: '#f8fafc' }}>
          <Header />
          <main className="px-4 py-6 sm:px-8 sm:py-7"
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
