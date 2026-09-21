import type { Metadata } from 'next';
import './globals.css';
import { TopNav } from '@/components/TopNav';

export const metadata: Metadata = {
  title: 'ACEAPT · Readiness Simulator',
  description: 'Experience a realistic version of your target opportunity before the real one arrives.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink font-sans text-text-1 antialiased">
        <TopNav />
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
