'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
export function CodingNavigation() {
  const path = usePathname();
  return <nav aria-label="Coding workspaces" className="mb-6 flex flex-wrap gap-2">{[['/coding','Practice'],['/coding/learn','Learn'],['/coding/diagnostic','Diagnostic'],['/coding/debug','Debug'],['/coding/projects','Projects'],['/coding/incidents','Incidents'],['/coding/explain','Explain'],['/coding/history','Practice history'],['/readiness','My journey'],['/coding/settings','Import and settings']].map(([href,label]) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined} className="rounded-full border border-border px-4 py-2 text-sm hover:bg-hover">{label}</Link>)}</nav>;
}
