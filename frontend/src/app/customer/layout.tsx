'use client';

import React, { useEffect } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { CustomerStoreProvider } from '@/lib/customer-store';
import { getAuthToken, setAuthSession } from '@/lib/auth';
import { mockCurrentUser } from '@/lib/mock-data';

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Ensure active session exists so user never gets blocked or stuck
    const token = getAuthToken();
    if (!token) {
      setAuthSession('mock-jwt-token-customer', mockCurrentUser);
    }
  }, []);

  return (
    <CustomerStoreProvider>
      <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-page)' }}>
        {/* Sidebar Navigation */}
        <Sidebar />

        {/* Main Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, backgroundColor: '#f8fafc' }}>
          <Header />
          <main
            style={{
              flex: 1,
              padding: '28px 32px 48px 32px',
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
