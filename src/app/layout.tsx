import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LEPODER Portal',
  description: 'Personal gateway to all services',
  icons: { icon: '/favicon.ico' },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-portal-bg text-portal-text font-sans antialiased min-h-screen overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
