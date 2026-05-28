import type { Metadata, Viewport } from 'next';
import './globals.css';
import ClientProviders from '@/components/ClientProviders';
import { THEME_INIT_SCRIPT } from '@/lib/themes';

export const metadata: Metadata = {
  title: 'LEPODER Portal',
  description: 'Personal gateway to all services',
  icons: { icon: '/favicon.ico' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" data-theme="default">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-portal-bg text-portal-text font-sans antialiased min-h-dvh overflow-x-hidden">
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
