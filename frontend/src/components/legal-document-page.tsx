import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';

interface LegalDocumentPageProps {
  content?: string;
  /** Explicit page heading rendered as the semantic H1. When omitted the
   *  component falls back to extracting a markdown `# Title` first-line. */
  title?: string;
  /** When provided, rendered instead of the raw-text <pre>. Use this for
   *  pages that need proper semantic HTML (links, lists, definition lists)
   *  rather than preformatted Markdown text. */
  children?: React.ReactNode;
}

export function LegalDocumentPage({ content, title, children }: LegalDocumentPageProps) {
  // Extract the first markdown heading (# Title) and render it as a
  // semantic <h1> so search engines (Bing, Google) can identify the page
  // heading. The remaining body stays inside the <pre> for layout parity.
  const lines = (content ?? '').split('\n');
  const firstLine = lines[0] ?? '';
  const hasMarkdownH1 = !title && firstLine.startsWith('# ');
  const h1Text = title ?? (hasMarkdownH1 ? firstLine.slice(2).trim() : null);
  const bodyContent = hasMarkdownH1 ? lines.slice(1).join('\n').replace(/^\n+/, '') : content;

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
            {h1Text && <h1 className="legal-pre" style={{ margin: 0 }}>{h1Text}</h1>}
            {children ? (
              <div className="legal-pre" style={h1Text ? { paddingTop: 0 } : undefined}>{children}</div>
            ) : (
              <pre className="legal-pre" style={h1Text ? { paddingTop: 0 } : undefined}>{bodyContent}</pre>
            )}
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
