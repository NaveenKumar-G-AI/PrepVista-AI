import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { SectionCard, LoadingState, ErrorState } from '../components/shared/UI.jsx';

const PORTFOLIO_META = {
  TARGET: { label: 'Target', desc: 'Strong alignment, strong evidence -- your primary focus.' },
  STRETCH: { label: 'Stretch', desc: 'Strong direction, some real gaps -- worth the effort.' },
  ADJACENT: { label: 'Adjacent', desc: 'Related roles that may broaden your options.' },
  EXPLORATORY: { label: 'Exploratory', desc: 'A different direction, useful for discovering alternatives.' },
};

const FUNNEL_STEPS = [
  { key: 'applications', label: 'Applications' },
  { key: 'assessments', label: 'Assessments' },
  { key: 'interviews', label: 'Interviews' },
  { key: 'final_rounds', label: 'Final rounds' },
  { key: 'offers', label: 'Offers' },
];

export default function InsightsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.getFunnel(), api.getWeekly(), api.getGaps(), api.getPortfolio()])
      .then(([funnel, weekly, gaps, portfolio]) => setData({ funnel, weekly, gaps: gaps.gaps, portfolio }))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState label="Compiling your application intelligence" />;

  const maxCount = Math.max(1, ...FUNNEL_STEPS.map((s) => data.funnel.counts[s.key]));

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs text-ink-faint uppercase tracking-wide">Insights</p>
        <h1 className="font-display text-3xl mt-1">Weekly application intelligence</h1>
      </div>

      <SectionCard title="Application funnel">
        <div className="space-y-3">
          {FUNNEL_STEPS.map((s) => (
            <div key={s.key}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-ink-soft">{s.label}</span>
                <span className="font-mono text-ink">{data.funnel.counts[s.key]}</span>
              </div>
              <div className="h-2 rounded-full bg-ink/5 overflow-hidden">
                <div className="h-full rounded-full bg-denim-600" style={{ width: `${(data.funnel.counts[s.key] / maxCount) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        {data.funnel.bottleneck && <p className="text-sm text-ink-soft mt-4 pt-4 border-t border-border-soft">{data.funnel.bottleneck.message}</p>}
      </SectionCard>

      <SectionCard title="This week" subtitle="Last 7 days">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
          {[
            ['Applied', data.weekly.applications_submitted],
            ['Interviews', data.weekly.interviews],
            ['Final rounds', data.weekly.final_rounds],
            ['Offers', data.weekly.offers],
            ['No response', data.weekly.no_response],
            ['Rejections', data.weekly.rejections],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="font-mono text-xl text-ink tabular-nums">{value}</div>
              <div className="text-xs text-ink-faint mt-0.5">{label}</div>
            </div>
          ))}
        </div>
        {data.weekly.top_performing_positioning && (
          <p className="text-sm text-ink-soft mt-4 pt-4 border-t border-border-soft">{data.weekly.top_performing_positioning.note}</p>
        )}
      </SectionCard>

      <SectionCard title="Recurring gaps" subtitle="Skills that show up as gaps across multiple opportunities you've analyzed.">
        {data.gaps.length === 0 ? (
          <p className="text-sm text-ink-faint">Not enough analyzed opportunities yet to spot a recurring pattern.</p>
        ) : (
          <ul className="space-y-2">
            {data.gaps.map((g) => (
              <li key={g.skill} className="flex items-center justify-between text-sm">
                <span className="text-ink">{g.skill}</span>
                <span className="text-ink-faint font-mono text-xs">{g.count} of {g.total_opportunities_analyzed}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Opportunity portfolio">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Object.entries(PORTFOLIO_META).map(([key, meta]) => (
            <div key={key} className="rounded-xl border border-border-soft p-3">
              <div className="font-mono text-xl text-ink">{data.portfolio[key]}</div>
              <div className="text-xs font-medium text-ink mt-1">{meta.label}</div>
              <div className="text-xs text-ink-faint mt-1">{meta.desc}</div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
