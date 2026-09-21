import type { Discovery } from '../types';

export function DiscoveryBanner({ discoveries }: { discoveries: Discovery[] }) {
  const ready = discoveries.filter((d) => d.status === 'CANDIDATE_READY');
  if (ready.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-focus/30 bg-focusbg p-5">
      {ready.map((d) => {
        const evidence = JSON.parse(d.evidence) as { count: number; successCount: number };
        return (
          <div key={d.id} className="flex items-center justify-between gap-4">
            <div>
              <p className="font-display text-lg text-ink">A pattern showed up in your solving</p>
              <p className="mt-0.5 text-sm text-inksoft">
                {d.method_signature} — used on {evidence.count} similar questions, correct {evidence.successCount} times. Worth
                testing whether it's reliable.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-focus px-4 py-1.5 text-sm text-paper">Test it</span>
          </div>
        );
      })}
    </div>
  );
}
