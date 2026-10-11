import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';

export const metadata: Metadata = {
  title: 'PrepVista AI — Official Company Information',
  description:
    'Official information about PrepVista AI, an AI-powered placement-readiness platform founded by Naveen Kumar G in India on March 3, 2026.',
  alternates: {
    canonical: 'https://prepvistaai.com/company',
  },
  openGraph: {
    title: 'PrepVista AI — Official Company Information',
    description:
      'Official information about PrepVista AI, its founder, platform, focus areas and public company profiles.',
    url: 'https://prepvistaai.com/company',
    siteName: 'PrepVista AI',
    type: 'website',
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PrepVista AI — Official Company Information',
    description:
      'Official information about PrepVista AI, its founder, platform, focus areas and public company profiles.',
  },
};

const companyWebPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  '@id': 'https://prepvistaai.com/company#webpage',
  url: 'https://prepvistaai.com/company',
  name: 'PrepVista AI — Official Company Information',
  description:
    'Official information about PrepVista AI, an AI-powered placement-readiness platform founded by Naveen Kumar G in India on March 3, 2026.',
  about: {
    '@id': 'https://prepvistaai.com/#organization',
  },
  publisher: {
    '@id': 'https://prepvistaai.com/#organization',
  },
  inLanguage: 'en-IN',
};

export default function CompanyPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-level-0)] text-[var(--text-primary)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(companyWebPageJsonLd).replace(/</g, '\\u003c'),
        }}
      />

      <nav className="border-b border-[var(--border-color)] bg-[var(--bg-level-1)] px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/" className="inline-flex">
            <BrandLogo size={34} priority nameClassName="text-lg font-bold text-primary" />
          </Link>
          <div className="flex items-center gap-6 text-sm text-[var(--text-secondary)]">
            <Link href="/" className="transition-colors hover:text-[var(--text-primary)]">
              Home
            </Link>
            <Link href="/about" className="transition-colors hover:text-[var(--text-primary)]">
              About
            </Link>
            <Link href="/pricing" className="transition-colors hover:text-[var(--text-primary)]">
              Pricing
            </Link>
            <Link href="/contact" className="transition-colors hover:text-[var(--text-primary)]">
              Contact
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-10">
          <div className="mb-2 text-xs font-semibold tracking-wider text-[var(--pv-blue)] uppercase">
            Official Source of Truth
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-[var(--text-primary)]">
            PrepVista AI — Official Company Information
          </h1>
          <p className="mt-3 text-base text-[var(--text-secondary)]">
            Authoritative public facts, entity details, verified profiles, and core platform focus areas for PrepVista AI.
          </p>
        </header>

        {/* Section 1: Official Company Information */}
        <section className="mb-12 rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 shadow-sm sm:p-8">
          <h2 className="mb-6 text-xl font-bold tracking-tight text-[var(--text-primary)]">
            OFFICIAL COMPANY INFORMATION
          </h2>

          <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">Company / Brand</dt>
              <dd className="mt-1 text-base font-medium text-[var(--text-primary)]">PrepVista AI</dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">Founder</dt>
              <dd className="mt-1 text-base font-medium text-[var(--text-primary)]">Naveen Kumar G</dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">Founded</dt>
              <dd className="mt-1 text-base font-medium text-[var(--text-primary)]">March 3, 2026</dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">Country</dt>
              <dd className="mt-1 text-base font-medium text-[var(--text-primary)]">India</dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">Location</dt>
              <dd className="mt-1 text-base font-medium text-[var(--text-primary)]">Dindigul, Tamil Nadu, India</dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">Official Website</dt>
              <dd className="mt-1 text-base font-medium text-[var(--text-primary)]">
                <a
                  href="https://prepvistaai.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--pv-blue)] hover:underline"
                >
                  https://prepvistaai.com
                </a>
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">Official Contact</dt>
              <dd className="mt-1 text-base font-medium text-[var(--text-primary)]">
                <a
                  href="mailto:founder@prepvistaai.com"
                  className="text-[var(--pv-blue)] hover:underline"
                >
                  founder@prepvistaai.com
                </a>
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">Business</dt>
              <dd className="mt-1 text-base font-medium text-[var(--text-primary)]">
                AI-powered placement-readiness platform
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">Entity Status</dt>
              <dd className="mt-1 text-base font-medium text-[var(--text-primary)]">
                Udyam-registered MSME in India
              </dd>
            </div>

            <div>
              <dt className="text-xs font-semibold uppercase text-[var(--text-tertiary)]">Business Structure</dt>
              <dd className="mt-1 text-base font-medium text-[var(--text-primary)]">
                Sole proprietorship / proprietary enterprise
              </dd>
            </div>
          </dl>

          <div className="mt-8 border-t border-[var(--border-color)] pt-6">
            <h3 className="text-sm font-semibold uppercase text-[var(--text-tertiary)]">Description</h3>
            <p className="mt-2 text-base leading-relaxed text-[var(--text-secondary)]">
              PrepVista AI is an AI-powered placement-readiness platform for college students, freshers, and early-career candidates. It brings together interview preparation, coding preparation, aptitude, communication development, assessments, personalized feedback, and career-readiness support.
            </p>
          </div>

          <div className="mt-6 border-t border-[var(--border-color)] pt-6">
            <h3 className="text-sm font-semibold uppercase text-[var(--text-tertiary)]">Core Areas</h3>
            <ul className="mt-3 grid grid-cols-1 gap-2 text-sm text-[var(--text-secondary)] sm:grid-cols-2">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--pv-blue)]" />
                Interview preparation
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--pv-blue)]" />
                Coding preparation
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--pv-blue)]" />
                Aptitude preparation
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--pv-blue)]" />
                Communication development
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--pv-blue)]" />
                Assessments
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--pv-blue)]" />
                Personalized feedback
              </li>
              <li className="flex items-center gap-2 sm:col-span-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--pv-blue)]" />
                Career readiness / placement readiness
              </li>
            </ul>
          </div>

          <div className="mt-6 border-t border-[var(--border-color)] pt-6">
            <h3 className="text-sm font-semibold uppercase text-[var(--text-tertiary)]">Broad Categories</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-[var(--neutral-bg)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                Artificial Intelligence
              </span>
              <span className="rounded-full bg-[var(--neutral-bg)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                EdTech
              </span>
              <span className="rounded-full bg-[var(--neutral-bg)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                SaaS
              </span>
              <span className="rounded-full bg-[var(--neutral-bg)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                Career Readiness
              </span>
            </div>
          </div>
        </section>

        {/* Section 2: Official Profiles */}
        <section className="mb-12 rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 shadow-sm sm:p-8">
          <h2 className="mb-6 text-xl font-bold tracking-tight text-[var(--text-primary)]">
            OFFICIAL PROFILES
          </h2>
          <p className="mb-6 text-sm text-[var(--text-secondary)]">
            Verified external entity profiles representing PrepVista AI and its founder:
          </p>

          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border-color)] pb-3">
              <span className="text-sm font-medium text-[var(--text-primary)]">LinkedIn Company</span>
              <a
                href="https://www.linkedin.com/company/prepvista-ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--pv-blue)] hover:underline break-all sm:break-normal"
              >
                https://www.linkedin.com/company/prepvista-ai
              </a>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border-color)] pb-3">
              <span className="text-sm font-medium text-[var(--text-primary)]">Crunchbase</span>
              <a
                href="https://www.crunchbase.com/organization/prepvista-ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--pv-blue)] hover:underline break-all sm:break-normal"
              >
                https://www.crunchbase.com/organization/prepvista-ai
              </a>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border-color)] pb-3">
              <span className="text-sm font-medium text-[var(--text-primary)]">Wellfound</span>
              <a
                href="https://wellfound.com/company/prepvista-ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--pv-blue)] hover:underline break-all sm:break-normal"
              >
                https://wellfound.com/company/prepvista-ai
              </a>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border-color)] pb-3">
              <span className="text-sm font-medium text-[var(--text-primary)]">Founder LinkedIn</span>
              <a
                href="https://www.linkedin.com/in/naveenkumar-ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--pv-blue)] hover:underline break-all sm:break-normal"
              >
                https://www.linkedin.com/in/naveenkumar-ai
              </a>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-1">
              <span className="text-sm font-medium text-[var(--text-primary)]">Founder GitHub</span>
              <a
                href="https://github.com/Devil-nkp"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--pv-blue)] hover:underline break-all sm:break-normal"
              >
                https://github.com/Devil-nkp
              </a>
            </div>
          </div>
        </section>

        {/* Section 3: Entity Resolution & Natural Q&A */}
        <section className="mb-12 rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 shadow-sm sm:p-8">
          <h2 className="mb-6 text-xl font-bold tracking-tight text-[var(--text-primary)]">
            COMMON QUESTIONS ABOUT PREPVISTA AI
          </h2>

          <div className="space-y-6">
            <article>
              <h3 className="text-base font-semibold text-[var(--text-primary)]">
                What is PrepVista AI?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                PrepVista AI is an AI-powered placement-readiness platform for college students, freshers, and early-career candidates.
              </p>
            </article>

            <article className="border-t border-[var(--border-color)] pt-4">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">
                Who founded PrepVista AI?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                PrepVista AI was founded by Naveen Kumar G.
              </p>
            </article>

            <article className="border-t border-[var(--border-color)] pt-4">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">
                When was PrepVista AI founded?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                PrepVista AI was founded on March 3, 2026.
              </p>
            </article>

            <article className="border-t border-[var(--border-color)] pt-4">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">
                Where is PrepVista AI based?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                PrepVista AI is based in Dindigul, Tamil Nadu, India.
              </p>
            </article>

            <article className="border-t border-[var(--border-color)] pt-4">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">
                What does PrepVista AI provide?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                PrepVista AI focuses on interview preparation, coding preparation, aptitude, communication development, assessments, personalized feedback, and career readiness.
              </p>
            </article>

            <article className="border-t border-[var(--border-color)] pt-4">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">
                Is PrepVista AI an MSME?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                PrepVista AI is an Udyam-registered MSME in India.
              </p>
            </article>
          </div>
        </section>

        {/* Section 4: Public Compliance & Transparency */}
        <section className="mb-12 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-level-1)] p-6 sm:p-8">
          <h2 className="mb-3 text-base font-bold text-[var(--text-primary)]">
            COMPLIANCE & TRUTH BOUNDARIES
          </h2>
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
            PrepVista AI is an Udyam-registered MSME in India, operating as a sole proprietorship / proprietary enterprise. PrepVista AI is not currently incorporated as a Private Limited (Pvt Ltd), One Person Company (OPC), or Limited Liability Partnership (LLP), nor is it a venture-funded entity or recipient of government grants. In strict adherence to privacy and compliance guidelines, confidential credentials such as Udyam registration numbers, Aadhaar, PAN, bank records, and personal home addresses are not published publicly.
          </p>
        </section>
      </main>

      <footer className="border-t border-[var(--border-color)] bg-[var(--bg-level-1)] py-8 text-center text-xs text-[var(--text-secondary)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-6 px-6">
          <Link href="/" className="hover:text-[var(--text-primary)]">Home</Link>
          <Link href="/about" className="hover:text-[var(--text-primary)]">About</Link>
          <Link href="/contact" className="hover:text-[var(--text-primary)]">Contact</Link>
          <Link href="/pricing" className="hover:text-[var(--text-primary)]">Pricing</Link>
          <Link href="/privacy" className="hover:text-[var(--text-primary)]">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-[var(--text-primary)]">Terms</Link>
        </div>
        <div className="mt-4 text-[var(--text-tertiary)]">
          © 2026 PREPVISTA AI · Udyam-registered MSME in India
        </div>
      </footer>
    </div>
  );
}
