'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/simulations', label: 'Simulations' },
  { href: '/simulations/history', label: 'History' },
  { href: '/path', label: 'Path' },
];

export function TopNav() {
  const pathname = usePathname();
  const inRuntime = pathname?.startsWith('/attempts/') && pathname?.endsWith('/run');

  if (inRuntime) {
    // Focus principle (spec §11/§47): no navigation chrome while a
    // simulation is actually running.
    return (
      <header className="border-b border-line px-6 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="eyebrow">ACEAPT · FEATURE 31</span>
          <span className="eyebrow text-signal">SIMULATION IN PROGRESS</span>
        </div>
      </header>
    );
  }

  return (
    <header className="border-b border-line px-6 py-4">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold tracking-tightest text-text-1">ACEAPT</span>
          <span className="eyebrow">READINESS SIMULATOR</span>
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  active ? 'bg-raised text-text-1' : 'text-text-2 hover:text-text-1'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
