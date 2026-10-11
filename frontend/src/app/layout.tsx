import type { Metadata } from 'next';

import './globals.css';
import { AwakeKeeper } from '@/components/awake-keeper';
import { AmbientEffects } from '@/components/ambient-effects';
import { LazySupportChat } from '@/components/lazy-support-chat';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-context';

export const metadata: Metadata = {
  metadataBase: new URL('https://prepvistaai.com'),

  title: {
    default: 'PrepVista AI — AI-Powered Placement Readiness',
    template: '%s | PrepVista AI',
  },

  description:
    'PrepVista AI is an AI-powered placement-readiness platform helping college students, freshers, and early-career candidates prepare for interviews, coding, aptitude, communication, assessments, personalized feedback, and career readiness.',

  keywords: [
    'PrepVista AI',
    'placement readiness',
    'placement preparation',
    'AI placement preparation',
    'interview preparation',
    'AI mock interviews',
    'resume-based interview practice',
    'coding preparation',
    'aptitude preparation',
    'aptitude training',
    'communication skills',
    'career readiness',
    'student employability',
    'fresher placement preparation',
    'personalized learning',
    'AI interview feedback',
    'career preparation',
    'EdTech',
    'AI education platform',
  ],

  applicationName: 'PrepVista AI',

  authors: [
    {
      name: 'Naveen Kumar G',
      url: 'https://www.linkedin.com/in/naveenkumar-ai',
    },
  ],

  creator: 'PrepVista AI',
  publisher: 'PrepVista AI',

  alternates: {
    canonical: '/',
  },

  openGraph: {
    title: 'PrepVista AI — AI-Powered Placement Readiness',
    description:
      'PrepVista AI helps college students, freshers, and early-career candidates prepare for placements through AI-powered interview practice, coding, aptitude, communication, assessments, personalized feedback, and career readiness.',
    url: 'https://prepvistaai.com',
    siteName: 'PrepVista AI',
    type: 'website',
    locale: 'en_IN',
  },

  twitter: {
    card: 'summary_large_image',
    title: 'PrepVista AI — AI-Powered Placement Readiness',
    description:
      'AI-powered placement readiness for interviews, coding, aptitude, communication, assessments, personalized feedback, and career preparation.',
  },

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },

  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },

  category: 'Education Technology',
};

const structuredData = {
  '@context': 'https://schema.org',

  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://prepvistaai.com/#organization',

      name: 'PrepVista AI',

      url: 'https://prepvistaai.com',

      logo: {
        '@type': 'ImageObject',
        url: 'https://prepvistaai.com/prepvista.png',
      },

      description:
        'PrepVista AI is an AI-powered placement-readiness platform for college students, freshers, and early-career candidates, focused on interviews, coding, aptitude, communication, assessments, personalized feedback, and career readiness.',

      foundingDate: '2026-03-03',

      founder: {
        '@id': 'https://prepvistaai.com/#founder',
      },

      email: 'founder@prepvistaai.com',

      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Dindigul',
        addressRegion: 'Tamil Nadu',
        addressCountry: 'IN',
      },

      areaServed: {
        '@type': 'Country',
        name: 'India',
      },

      knowsAbout: [
        'Artificial Intelligence',
        'Placement Readiness',
        'Interview Preparation',
        'Coding Preparation',
        'Aptitude Preparation',
        'Communication Skills',
        'Career Readiness',
        'Personalized Learning',
        'EdTech',
      ],

      sameAs: [
        'https://www.linkedin.com/company/prepvista-ai',
        'https://www.crunchbase.com/organization/prepvista-ai',
        'https://wellfound.com/company/prepvista-ai',
      ],
    },

    {
      '@type': 'Person',
      '@id': 'https://prepvistaai.com/#founder',

      name: 'Naveen Kumar G',

      jobTitle: 'Founder',

      worksFor: {
        '@id': 'https://prepvistaai.com/#organization',
      },

      url: 'https://prepvistaai.com',

      sameAs: [
        'https://www.linkedin.com/in/naveenkumar-ai',
        'https://github.com/Devil-nkp',
      ],

      knowsAbout: [
        'Artificial Intelligence',
        'Python',
        'FastAPI',
        'Retrieval-Augmented Generation',
        'Natural Language Processing',
        'AI Product Development',
        'Prompt Engineering',
      ],
    },

    {
      '@type': 'WebSite',
      '@id': 'https://prepvistaai.com/#website',

      url: 'https://prepvistaai.com',

      name: 'PrepVista AI',

      description:
        'AI-powered placement readiness for interviews, coding, aptitude, communication, personalized feedback, and career preparation.',

      publisher: {
        '@id': 'https://prepvistaai.com/#organization',
      },

      inLanguage: 'en-IN',
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
          }}
        />

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

            <div className="page-shell">{children}</div>

            <LazySupportChat />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}