'use client';

import React, { useEffect, useState } from 'react';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
        {/* Sidebar Navigation (with Mobile Drawer) */}
        <Sidebar mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

        {/* Main Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, backgroundColor: '#f8fafc', overflowX: 'hidden' }}>
          <Header onMenuClick={() => setMobileMenuOpen(true)} />
          <main
            style={{
              flex: 1,
              padding: '24px 20px 48px 20px',
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
