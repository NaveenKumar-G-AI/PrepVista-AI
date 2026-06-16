import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';

interface LegalDocumentPageProps {
  content: string;
}

export function LegalDocumentPage({ content }: LegalDocumentPageProps) {
  return (
    <div className="min-h-screen surface-primary">
      <nav className="border-b border-border px-6 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/" className="inline-flex">
            <BrandLogo size={32} priority nameClassName="text-lg font-bold text-primary" />
          </Link>
          <Link href="/" className="text-sm text-secondary transition-colors hover:text-brand">
            Back
          </Link>
        </div>
      </nav>

      <article className="mx-auto max-w-5xl px-6 py-12">
        <div className="card p-0 overflow-hidden">
          <pre className="legal-pre">{content}</pre>
        </div>
      </article>
    </div>
  );
}
