import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import { DocumentStoreProvider } from '@/lib/document-store';
import { FleetRouteStoreProvider } from '@/lib/fleet-route-store';
import { LanguageProvider } from '@/lib/i18n/LanguageContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'EquiTransit Logistics - Cross-Border Racehorse Transport',
  description: 'Specialized international racehorse transportation management system.',
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
      <head>
        <link rel="icon" href="/icon.png" type="image/png" sizes="any" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icon.png" />
      </head>
      <body suppressHydrationWarning>
        <LanguageProvider>
          <DocumentStoreProvider>
            <FleetRouteStoreProvider>
              {children}
            </FleetRouteStoreProvider>
          </DocumentStoreProvider>
        </LanguageProvider>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
