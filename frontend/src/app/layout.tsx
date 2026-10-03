import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import { DocumentStoreProvider } from '@/lib/document-store';
import './globals.css';

export const metadata: Metadata = {
  title: 'EquiTransit Logistics - Cross-Border Racehorse Transport',
  description: 'Specialized international racehorse transportation management system.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <DocumentStoreProvider>
          {children}
        </DocumentStoreProvider>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
