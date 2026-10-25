import React from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-main, #f8fafc)' }}>
      <Sidebar role="manager" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: '260px' }}>
        <Header />
        <main style={{ flex: 1, padding: '28px 32px' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
