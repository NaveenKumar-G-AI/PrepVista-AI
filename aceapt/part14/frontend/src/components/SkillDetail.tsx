import { useEffect, useState } from 'react';

import { api } from '../lib/api';
import { deriveStrip, STRIP_DIMS } from '../lib/evidenceStrip';
import { InterventionPlan, MasteryTransition, Skill, SkillAnalysis } from '../lib/types';
import { EvidenceStrip, EvidenceStripLegend } from './EvidenceStrip';
import { Bar, Card, ConfidenceTag, ErrorState, LoadingRows, StateBadge } from './ui';

export function SkillDetail({
  studentId,
  skillId,
  onBack,
  onStartCheck,
}: {
  studentId: string;
  skillId: string;
  onBack: () => void;
  onStartCheck: () => void;
}) {
  const [skill, setSkill] = useState<Skill | null>(null);
  const [analysis, setAnalysis] = useState<SkillAnalysis | null>(null);
  const [explanation, setExplanation] = useState<string>('');
  const [transitions, setTransitions] = useState<MasteryTransition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [intervention, setIntervention] = useState<InterventionPlan | null>(null);
  const [loadingIntervention, setLoadingIntervention] = useState(false);

  const load = () => {
    setError(null);
    setSkill(null);
    setAnalysis(null);
    setIntervention(null);
    Promise.all([api.getSkillDetail(studentId, skillId), api.getSkillHistory(studentId, skillId)])
      .then(([detail, history]) => {
        setSkill(detail.skill);
        setAnalysis(detail.analysis);
        setExplanation(detail.explanation);
        setTransitions(history.transitions);
      })
      .catch((e) => setError(e.message));
  };

  useEffect(load, [studentId, skillId]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!skill || !analysis) return <LoadingRows count={4} />;

  const ev = analysis.evidence;
  const formatEntries = Object.entries(ev.byFormat).filter(([, b]) => b.attempts > 0);
  const contextEntries = Object.entries(ev.byContext).filter(([, b]) => b.attempts > 0);
  const openGaps = analysis.flags.filter((f) => f !== 'INSUFFICIENT_EVIDENCE');

  const loadIntervention = () => {
    setLoadingIntervention(true);
    api
      .intervene(studentId, skillId)
      .then((r) => setIntervention(r.plan))
      .finally(() => setLoadingIntervention(false));
  };

  return (
    <div className="max-w-3xl">
      <button onClick={onBack} className="mb-6 text-sm text-ink-600 hover:text-ink-900">
        ← Mastery map
      </button>

      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-ink-400">{skill.domain} · {skill.topic}</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold text-ink-900">{skill.name}</h2>
          <StateBadge state={analysis.state} label={analysis.displayLabel} />
        </div>
        <div className="mt-3">
          <ConfidenceTag confidence={analysis.confidence} />
        </div>
      </header>

      <Card className="mb-6 px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-widest text-ink-400">Evidence strip</span>
        </div>
        <EvidenceStrip dims={deriveStrip(analysis)} showLabels />
        <div className="mt-4 border-t border-line pt-3">
          <EvidenceStripLegend />
        </div>
      </Card>

      <Card className="mb-6 border-l-2 border-l-ink-700 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-ink-400">Why this state</p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-700">{explanation}</p>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Card className="px-5 py-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-400">Difficulty</p>
          <div className="space-y-3">
            <Bar label="Easy" value={ev.byDifficulty.easy.accuracy} />
            <Bar label="Medium" value={ev.byDifficulty.medium.accuracy} />
            <Bar label="Hard" value={ev.byDifficulty.hard.accuracy} />
          </div>
          <p className="mt-3 font-mono text-xs text-ink-400">Ceiling: {analysis.difficultyCeiling ?? 'not yet established'}</p>
        </Card>

        <Card className="px-5 py-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-400">Familiar vs. novel</p>
          <div className="space-y-3">
            <Bar label="Familiar questions" value={ev.familiarAccuracy} />
            <Bar label="Novel / unfamiliar questions" value={ev.novelAccuracy} />
          </div>
          <p className="mt-3 font-mono text-xs text-ink-400">{ev.novelIndependentAttempts} novel/varied attempt(s) on record</p>
        </Card>

        <Card className="px-5 py-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-400">Independence</p>
          <div className="space-y-3">
            <Bar label="With hints / guided" value={ev.guidedAccuracy} />
            <Bar label="Independent (recent)" value={ev.independentAccuracy} />
          </div>
          <p className="mt-3 font-mono text-xs text-ink-400">
            {ev.independentDistinctQuestions} distinct question(s) solved independently · lifetime {pct(ev.lifetimeIndependentAccuracy)}
          </p>
        </Card>

        <Card className="px-5 py-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-400">Retention</p>
          <div className="space-y-3">
            <Bar label="Immediately after practice" value={ev.retention.immediateAccuracy} />
            <Bar label="On a later, delayed check" value={ev.retention.delayedAccuracy} />
          </div>
          <p className="mt-3 font-mono text-xs text-ink-400">{ev.retention.delayedAttempts} delayed attempt(s) on record</p>
        </Card>
      </div>

      {(formatEntries.length > 0 || contextEntries.length > 0) && (
        <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {formatEntries.length > 0 && (
            <Card className="px-5 py-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-400">By format</p>
              <div className="space-y-3">
                {formatEntries.map(([format, b]) => (
                  <Bar key={format} label={format.replace('_', ' ')} value={b.accuracy} />
                ))}
              </div>
            </Card>
          )}
          {contextEntries.length > 0 && (
            <Card className="px-5 py-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-400">By context</p>
              <div className="space-y-3">
                {contextEntries.map(([ctx, b]) => (
                  <Bar key={ctx} label={ctx.replace('_', ' ')} value={b.accuracy} />
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {analysis.rootCauseSkillIds.length > 0 && (
        <Card className="mb-6 border-warn/30 bg-warn-soft px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-warn">Possible root cause</p>
          <p className="mt-1 text-sm text-ink-700">
            Performance here may be limited by a weaker prerequisite: <span className="font-medium">{analysis.rootCauseSkillIds.join(', ')}</span>. Consider
            strengthening that first.
          </p>
        </Card>
      )}

      {transitions.length > 0 && (
        <Card className="mb-6 px-5 py-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-400">Mastery timeline</p>
          <ol className="space-y-2">
            {transitions.map((t) => (
              <li key={t.id} className="flex items-baseline gap-3 text-sm">
                <span className="font-mono text-xs text-ink-400">{new Date(t.timestamp).toLocaleDateString()}</span>
                <span className="text-ink-700">
                  <span className="font-medium">{t.fromState.replace('_', ' ')}</span> → <span className="font-medium">{t.toState.replace('_', ' ')}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {openGaps.length > 0 && (
        <Card className="mb-6 px-5 py-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-400">Feature 12 — suggested intervention</p>
            {!intervention && (
              <button
                onClick={loadIntervention}
                disabled={loadingIntervention}
                className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-neutral-soft disabled:opacity-50"
              >
                {loadingIntervention ? 'Thinking…' : 'Generate suggestion'}
              </button>
            )}
          </div>
          {intervention && (
            <div className="mt-3">
              <p className="text-sm text-ink-700">{intervention.description}</p>
              <p className="mt-2 font-mono text-xs text-ink-400">
                type: {intervention.interventionType} · source: {intervention.generatedBy === 'feature14_fallback' ? 'Feature 14 fallback (Feature 12 not connected)' : 'Feature 12'}
              </p>
            </div>
          )}
        </Card>
      )}

      <div className="flex gap-3">
        <button onClick={onStartCheck} className="rounded-md bg-ink-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-ink-700">
          Start a mastery check
        </button>
      </div>
    </div>
  );
}

function pct(v: number | null) {
  return v == null ? 'n/a' : `${Math.round(v * 100)}%`;
}
