import { useEffect, useState } from 'react';
import { api, DEMO_STUDENT_ID } from '../api/client';
import type { MemoryPrioritiesResult, MemoryProfile } from '../types';
import { RetentionTrace } from '../components/RetentionTrace';
import { pct, reasonLabel } from '../components/shared';

export function Dashboard({ onSelectSkill }: { onSelectSkill: (skillId: string, skillName: string) => void }) {
  const [priorities, setPriorities] = useState<MemoryPrioritiesResult | null>(null);
  const [profile, setProfile] = useState<MemoryProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [p, prof] = await Promise.all([api.getMemoryPriorities(DEMO_STUDENT_ID), api.getMemoryProfile(DEMO_STUDENT_ID)]);
      setPriorities(p);
      setProfile(prof);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="max-w-xl mx-auto px-5 py-16 text-text-muted font-mono text-sm">Reading retention evidence…</div>
    );
  }

  if (error || !priorities || !profile) {
    return (
      <div className="max-w-xl mx-auto px-5 py-16">
        <p className="text-rose font-mono text-sm mb-3">Could not reach the backend.</p>
        <p className="text-text-muted text-sm">
          Make sure the backend is running (<code className="text-text">npm run dev</code> in <code className="text-text">/backend</code>) on
          the URL set in <code className="text-text">VITE_API_BASE_URL</code>.
        </p>
        {error && <p className="text-text-faint text-xs mt-4 font-mono">{error}</p>}
      </div>
    );
  }

  const findAssessment = (skillId: string) => profile.assessments.find((a) => a.skillId === skillId);

  return (
    <div className="max-w-xl mx-auto px-5 py-10 sm:py-14">
      <div className="mb-8">
        <p className="font-mono text-[11px] tracking-[0.2em] text-text-faint uppercase mb-3">Today's memory</p>
        {priorities.priorities.length > 0 ? (
          <h1 className="font-display text-3xl sm:text-4xl font-semibold leading-tight">
            <span className="font-mono text-signal">{priorities.estimatedTotalMinutes}</span> minutes to protect your progress
          </h1>
        ) : (
          <h1 className="font-display text-3xl sm:text-4xl font-semibold leading-tight text-sage">
            Everything you've learned is holding up.
          </h1>
        )}
        {priorities.totalNeedingAttention > priorities.priorities.length && (
          <p className="text-text-muted text-sm mt-3">
            You have {priorities.totalNeedingAttention} concepts needing attention. ACEAPT selected the{' '}
            {priorities.priorities.length} with the highest impact on your current target.
          </p>
        )}
      </div>

      {priorities.priorities.length === 0 ? (
        <div className="rounded-lg border border-hairline bg-panel px-5 py-6 mb-10">
          <p className="text-text text-sm">No review required right now.</p>
          <p className="text-text-muted text-sm mt-1">
            ACEAPT keeps checking quietly in the background — it only interrupts you when there's real evidence something needs attention.
          </p>
        </div>
      ) : (
        <div className="mb-10">
          {priorities.priorities.map((p, i) => {
            const a = findAssessment(p.skillId);
            return (
              <button
                key={p.skillId}
                onClick={() => onSelectSkill(p.skillId, p.skillName)}
                className="w-full text-left group flex items-center gap-4 py-4 border-b border-hairline last:border-b-0 hover:bg-panel/60 transition-colors -mx-2 px-2 rounded-md"
              >
                <span className="font-mono text-text-faint text-sm w-5 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-base font-medium truncate">{p.skillName}</p>
                  <p className="text-xs text-text-muted mt-0.5">{reasonLabel(p.reason)}</p>
                </div>
                {a && (
                  <RetentionTrace skillId={p.skillId} memoryState={a.memoryState} trend={a.trend} retentionRisk={a.retentionRisk} />
                )}
                <span className="font-mono text-xs text-text-faint w-14 text-right shrink-0">{p.estimatedMinutes} min</span>
              </button>
            );
          })}
        </div>
      )}

      {priorities.stable.length > 0 && (
        <div className="mb-10">
          <div className="trace-divider mb-5" />
          <p className="font-mono text-[11px] tracking-[0.2em] text-sage uppercase mb-3">Stable</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {priorities.stable.map((s) => (
              <span key={s.skillId} className="text-sm text-text-muted">
                {s.skillName} <span className="text-sage">✓</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="trace-divider mb-5" />
      <div className="grid grid-cols-4 gap-3 font-mono text-center">
        <HealthStat label="Strong" value={profile.memoryHealth.strong} colorClass="text-sage" />
        <HealthStat label="Attention" value={profile.memoryHealth.needsAttention} colorClass="text-amber" />
        <HealthStat label="Recurring" value={profile.memoryHealth.recurring} colorClass="text-amber" />
        <HealthStat label="At risk" value={profile.memoryHealth.atRiskCritical} colorClass="text-rose" />
      </div>

      <p className="text-text-faint text-xs mt-10 text-center">
        Mastery {pct(avg(profile.assessments.map((a) => a.masteryScore)))} overall · this is a demo student, not a real learner
      </p>
    </div>
  );
}

function HealthStat({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div>
      <p className={`text-2xl font-semibold ${colorClass}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-text-faint mt-1">{label}</p>
    </div>
  );
}

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
