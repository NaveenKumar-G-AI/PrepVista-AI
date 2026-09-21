import Link from 'next/link';
import { Button } from './ui';
import type { NextBestAction as NextBestActionT } from '@/lib/db/schema';

export function NextBestAction({ action, href, hrefLabel }: { action: NextBestActionT; href?: string; hrefLabel?: string }) {
  return (
    <div className="rounded-lg border border-signal/30 bg-signal-dim/20 p-5">
      <div className="eyebrow mb-1 text-signal">NEXT BEST ACTION</div>
      <div className="text-base font-medium text-text-1">{action.title}</div>
      <p className="mt-1 text-sm text-text-2">{action.reason}</p>
      {href && (
        <Link href={href} className="mt-4 inline-block">
          <Button variant="secondary">{hrefLabel ?? 'Continue'}</Button>
        </Link>
      )}
    </div>
  );
}
