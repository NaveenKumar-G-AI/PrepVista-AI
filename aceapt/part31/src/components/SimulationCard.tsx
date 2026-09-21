import Link from 'next/link';
import { formatDuration } from '@/lib/format';

const LEVEL_LABEL: Record<number, string> = { 1: 'Practice', 2: 'Target', 3: 'Realistic', 4: 'Final Readiness' };

export function SimulationCard({
  id,
  title,
  description,
  level,
  stageCount,
  totalDurationSeconds,
}: {
  id: string;
  title: string;
  description: string;
  level: number;
  stageCount: number;
  totalDurationSeconds: number;
}) {
  return (
    <Link href={`/simulations/${id}`} className="card-rise block rounded-xl border border-line bg-panel p-6 transition-colors hover:border-signal/50">
      <div className="eyebrow mb-2">{LEVEL_LABEL[level] ?? 'Simulation'}</div>
      <h3 className="text-lg font-medium text-text-1">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-text-2">{description}</p>
      <div className="mt-5 flex items-center gap-4 font-data text-xs text-text-3">
        <span>{stageCount} stages</span>
        <span>·</span>
        <span>{formatDuration(totalDurationSeconds)}</span>
      </div>
    </Link>
  );
}
