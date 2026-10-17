import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

const SITE_URL = process.env.SITE_URL ?? 'http://localhost:3021';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Library catalogue', template: '%s · Library' },
  description: 'Search the library catalogue: see what we hold and whether a copy is on the shelf.',
  openGraph: { type: 'website', siteName: 'Library' },
};

export const viewport: Viewport = { themeColor: '#2f56c9' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
