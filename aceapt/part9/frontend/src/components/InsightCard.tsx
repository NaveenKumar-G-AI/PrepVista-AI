import { SimulationInsight } from '../types';

const SEVERITY_COLOR: Record<SimulationInsight['severity'], string> = {
  HIGH: 'border-rust text-rustlight',
  MEDIUM: 'border-brass text-brasslight',
  LOW: 'border-inkline text-slate',
};

export function InsightCard({ insight }: { insight: SimulationInsight }) {
  return (
    <div className={`rounded-lg border bg-ink/40 px-4 py-3 ${SEVERITY_COLOR[insight.severity]}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="readout text-[10px] uppercase tracking-widest">{insight.signalType.replace(/_/g, ' ')}</span>
        <span className="readout text-[10px] text-slate">confidence {Math.round(insight.confidence * 100)}%</span>
      </div>
      <p className="mt-1.5 font-body text-sm text-bone">{insight.message}</p>
    </div>
  );
}
