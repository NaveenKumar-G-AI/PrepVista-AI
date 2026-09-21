import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ACEAPT — Career Conversion Intelligence',
  description: 'Understand what happened, what is known, what is not, and what to do next.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body text-ink antialiased">{children}</body>
    </html>
  );
}
