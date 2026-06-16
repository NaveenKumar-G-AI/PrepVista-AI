import type { Metadata } from 'next';

import './globals.css';
import { AwakeKeeper } from '@/components/awake-keeper';
import { AmbientEffects } from '@/components/ambient-effects';
import { LazySupportChat } from '@/components/lazy-support-chat';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-context';

export const metadata: Metadata = {
  title: 'PrepVista - Resume-Based AI Interview Practice',
  description:
    'PrepVista helps final-year students, freshers, and early-career candidates practice resume-based mock interviews with voice-first simulation and actionable AI feedback.',
  keywords:
    'interview prep, mock interview, resume-based interview practice, AI interview feedback, voice interview practice, fresher interview prep',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('pv_theme') || 'dark';
                  if (t !== 'light' && t !== 'dark') t = 'dark';
                  document.documentElement.setAttribute('data-theme', t);
                  if (t === 'dark') document.documentElement.classList.add('dark');
                  else document.documentElement.classList.remove('dark');
                } catch(e) {
                  document.documentElement.setAttribute('data-theme', 'dark');
                  document.documentElement.classList.add('dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body className="font-sans">
        <ThemeProvider>
          <AuthProvider>
            <AwakeKeeper />
            <AmbientEffects />
            <div className="page-shell">
              {children}
            </div>
            <LazySupportChat />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
