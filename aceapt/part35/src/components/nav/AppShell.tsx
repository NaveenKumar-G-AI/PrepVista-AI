import Link from 'next/link';
import { LinkButton } from '../ui/Button';

const NAV_LINKS = [
  { href: '/career', label: 'Overview' },
  { href: '/career/funnel', label: 'Funnel' },
  { href: '/career/journey', label: 'Journey' },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <a
        href="#main-content"
        className="absolute left-2 top-2 z-50 -translate-y-16 rounded bg-ink px-4 py-2 text-sm text-white transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>
      <header className="border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/career" className="flex items-baseline gap-2">
            <span className="font-display text-lg text-ink">ACEAPT</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              Career Conversion
            </span>
          </Link>
          <nav aria-label="Career conversion sections" className="hidden items-center gap-6 sm:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-mono text-xs uppercase tracking-[0.08em] text-muted hover:text-pine"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <LinkButton href="/career/outcomes/new" variant="primary" className="text-xs px-4 py-2">
            Record Outcome
          </LinkButton>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-5xl px-6 py-10">
        {children}
      </main>
    </div>
  );
}
