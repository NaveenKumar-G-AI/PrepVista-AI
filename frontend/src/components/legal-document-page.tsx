import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';

interface LegalDocumentPageProps {
  content: string;
}

export function LegalDocumentPage({ content }: LegalDocumentPageProps) {
  return (
    <div className="min-h-screen surface-primary flex flex-col justify-between">
      <div>
        <nav className="border-b border-border px-6 py-3">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <Link href="/" className="inline-flex">
              <BrandLogo size={32} priority nameClassName="text-lg font-bold text-primary" />
            </Link>
            <div className="flex items-center gap-4 text-sm text-secondary">
              <Link href="/" className="transition-colors hover:text-brand">
                Home
              </Link>
              <Link href="/company" className="transition-colors hover:text-brand">
                Company
              </Link>
            </div>
          </div>
        </nav>

        <article className="mx-auto max-w-5xl px-6 py-12">
          <div className="card p-0 overflow-hidden">
            <pre className="legal-pre">{content}</pre>
          </div>
        </article>
      </div>

      <footer className="border-t border-border py-8 text-center text-xs text-secondary">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-6 px-6">
          <Link href="/" className="hover:text-primary">Home</Link>
          <Link href="/company" className="hover:text-primary">Company Information</Link>
          <Link href="/about" className="hover:text-primary">About</Link>
          <Link href="/contact" className="hover:text-primary">Contact</Link>
          <Link href="/pricing" className="hover:text-primary">Pricing</Link>
          <Link href="/privacy" className="hover:text-primary">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-primary">Terms</Link>
        </div>
        <div className="mt-4 text-tertiary">
          © 2026 PREPVISTA AI · Udyam-registered MSME in India
        </div>
      </footer>
    </div>
  );
}
