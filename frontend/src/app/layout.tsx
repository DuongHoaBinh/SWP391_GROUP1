import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import { LanguageProvider } from '@/lib/i18n/LanguageContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'EquiTransit Logistics — International Equine Transport',
  description: 'Cross-border racehorse transport management & dispatch platform compliant with IATA LAR and FEI / WOAH standards.',
  icons: {
    icon: [
      { url: '/icon.png', type: 'image/png' },
      { url: '/favicon.ico' },
    ],
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className="antialiased bg-page-bg text-text-primary" suppressHydrationWarning>
        <LanguageProvider>
          {children}
        </LanguageProvider>
        <Toaster
          position="top-right"
          containerStyle={{ zIndex: 10050 }}
          toastOptions={{
            duration: 4000,
            style: {
              background: '#181A17',
              color: '#FAF8F4',
              borderRadius: '12px',
              border: '1px solid #C4B38E',
              fontSize: '13px',
              fontWeight: 600,
              boxShadow: '0 10px 25px rgba(24, 26, 23, 0.22)',
            },
          }}
        />
      </body>
    </html>
  );
}
