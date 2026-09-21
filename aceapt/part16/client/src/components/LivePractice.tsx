import { useEffect, useState } from 'react';
import { api, AuthContext } from '../api/client';
import { AttemptOutcome, ErrorDeconstructionResult, InterventionHistoryRow, RecoverySession, ReassessmentOutcome, StuckReason } from '../types';
import { AttemptResultPanel } from './AttemptResultPanel';
import { ErrorDeconstructionView } from './ErrorDeconstructionView';
import { InterventionCard } from './InterventionCard';
import { ProgressiveHints } from './ProgressiveHints';
import { ExplainDifferentlyPanel } from './ExplainDifferentlyPanel';
import { StuckMenu } from './StuckMenu';
import { RecoverySessionView } from './RecoverySessionView';
import { InterventionHistoryList } from './InterventionHistoryList';

type SolutionStep = { stepNumber: number; description: string; stepType: string; correct: boolean };

interface Preset {
  id: string;
  label: string;
  build: () => Record<string, unknown>;
}

const SKILL_ID = 'skill_profit_loss';
// All presets here simulate the same micro-skill so effectiveness tracking
// (before/after accuracy) stays clean across repeated tries in one sitting —
// see store.getRecentAccuracyForMicroSkill and Section 22 (micro-skill diagnosis).
const MICRO_SKILL_ID = 'ms_reverse';

const PRESETS: Preset[] = [
  {
    id: 'concept',
    label: 'Wrong — concept gap',
    build: () => ({
      microSkillId: MICRO_SKILL_ID,
      solutionPath: [{ stepNumber: 1, description: "Couldn't identify which relationship the question was testing.", stepType: 'concept', correct: false }] as SolutionStep[],
    }),
  },
  {
    id: 'strategy',
    label: 'Wrong — strategy gap',
    build: () => ({
      microSkillId: MICRO_SKILL_ID,
      solutionPath: [
        { stepNumber: 1, description: 'Identified the concept correctly.', stepType: 'concept', correct: true },
        { stepNumber: 2, description: 'Picked the wrong formula direction.', stepType: 'strategy', correct: false },
      ] as SolutionStep[],
    }),
  },
  {
    id: 'procedural',
    label: 'Wrong — procedural gap',
    build: () => ({
      microSkillId: MICRO_SKILL_ID,
      solutionPath: [
        { stepNumber: 1, description: 'Identified the concept correctly.', stepType: 'concept', correct: true },
        { stepNumber: 2, description: 'Chose the right formula.', stepType: 'strategy', correct: true },
        { stepNumber: 3, description: 'Lost track of the steps partway through the procedure.', stepType: 'procedure', correct: false },
      ] as SolutionStep[],
      hintsUsed: 3,
    }),
  },
  {
    id: 'calculation',
    label: 'Wrong — calculation error',
    build: () => ({
      microSkillId: MICRO_SKILL_ID,
      solutionPath: [
        { stepNumber: 1, description: 'Identified the concept correctly.', stepType: 'concept', correct: true },
        { stepNumber: 2, description: 'Chose the right formula.', stepType: 'strategy', correct: true },
        { stepNumber: 3, description: 'Made an arithmetic slip while substituting.', stepType: 'calculation', correct: false },
      ] as SolutionStep[],
    }),
  },
  {
    id: 'interpretation',
    label: 'Wrong — misread the question',
    build: () => ({
      microSkillId: MICRO_SKILL_ID,
      solutionPath: [{ stepNumber: 1, description: 'Solved for profit instead of loss — misread the question.', stepType: 'interpretation', correct: false }] as SolutionStep[],
      responseTimeSeconds: 20,
      expectedTimeSeconds: 55,
    }),
  },
  {
    id: 'speed',
    label: 'Wrong — very slow response (speed gap)',
    build: () => ({ microSkillId: MICRO_SKILL_ID, responseTimeSeconds: 190, expectedTimeSeconds: 55 }),
  },
  {
    id: 'correct',
    label: 'Correct answer',
    build: () => ({ microSkillId: MICRO_SKILL_ID, correct: true }),
  },
];

export function LivePractice({ auth }: { auth: AuthContext }) {
  const [presetId, setPresetId] = useState(PRESETS[1].id);
  const [outcome, setOutcome] = useState<AttemptOutcome | null>(null);
  const [lastSolutionPath, setLastSolutionPath] = useState<SolutionStep[] | undefined>(undefined);
  const [errorResult, setErrorResult] = useState<ErrorDeconstructionResult | null>(null);
  const [showExplain, setShowExplain] = useState(false);
  const [started, setStarted] = useState(false);
  const [reassessResult, setReassessResult] = useState<ReassessmentOutcome | null>(null);
  const [recovery, setRecovery] = useState<RecoverySession | null>(null);
  const [reasons, setReasons] = useState<StuckReason[]>([]);
  const [history, setHistory] = useState<InterventionHistoryRow[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.stuckReasons(auth).then(setReasons).catch(() => setReasons([]));
    refreshHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshHistory() {
    api.history(auth).then(setHistory).catch(() => {});
  }

  function resetResultState() {
    setErrorResult(null);
    setShowExplain(false);
    setStarted(false);
    setReassessResult(null);
    setRecovery(null);
  }

  async function submitPreset() {
    const preset = PRESETS.find((p) => p.id === presetId)!;
    const fields = preset.build();
    setBusy(true);
    try {
      const body = {
        studentId: auth.studentId,
        skillId: SKILL_ID,
        questionId: `live_${Date.now()}`,
        correct: false,
        difficulty: 'medium',
        questionType: 'standard',
        hintsUsed: 0,
        prerequisiteSkillIds: [],
        ...fields,
      };
      setLastSolutionPath((fields as any).solutionPath);
      const res = await api.submitAttempt(auth, body);
      resetResultState();
      setOutcome(res);
      refreshHistory();
    } finally {
      setBusy(false);
    }
  }

  async function handleStuckReason(code: string) {
    setBusy(true);
    try {
      const res = await api.submitStuck(auth, {
        studentId: auth.studentId,
        skillId: SKILL_ID,
        microSkillId: MICRO_SKILL_ID,
        questionId: `live_stuck_${Date.now()}`,
        reasonCode: code,
        prerequisiteSkillIds: [],
      });
      setLastSolutionPath(undefined);
      resetResultState();
      setOutcome(res);
      refreshHistory();
    } finally {
      setBusy(false);
    }
  }

  async function handleSeeWhy() {
    if (!outcome?.intervention) return;
    const result = await api.errorDeconstruction(auth, outcome.intervention.id, lastSolutionPath);
    setErrorResult(result);
  }

  async function handlePracticeThis() {
    if (!outcome?.intervention) return;
    await api.startIntervention(auth, outcome.intervention.id);
    setStarted(true);
  }

  async function handleReassess(correct: boolean) {
    if (!outcome?.intervention) return;
    setBusy(true);
    try {
      const res = await api.reassess(auth, outcome.intervention.id, {
        correct,
        questionId: `reassess_${Date.now()}`,
        difficulty: 'medium',
      });
      setReassessResult(res);
      refreshHistory();
    } finally {
      setBusy(false);
    }
  }

  async function handleStartRecovery() {
    if (!outcome?.diagnosis) return;
    const session = await api.startRecoverySession(auth, {
      studentId: auth.studentId,
      skillId: SKILL_ID,
      rootCause: outcome.diagnosis.primary.cause,
      triggeringPattern: 'Manually triggered from the live-practice sandbox.',
    });
    setRecovery(session);
  }

  async function handleCompleteRecoveryStep(index: number) {
    if (!recovery) return;
    const updated = await api.completeRecoveryStep(auth, recovery.id, index);
    setRecovery(updated);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-line bg-surface p-5 shadow-panel">
        <p className="font-display text-[13px] font-medium uppercase tracking-[0.14em] text-muted">Submit a practice attempt</p>
        <p className="mt-1 text-[12px] text-muted">
          Every option below sends real evidence to the diagnostic engine — nothing here is pre-scripted.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
            className="rounded-sm border border-line bg-surface px-3 py-2 font-body text-[13px] text-ink"
          >
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            onClick={submitPreset}
            disabled={busy}
            className="rounded-sm bg-ink px-3.5 py-2 font-body text-[13px] font-medium text-porcelain transition hover:bg-ink-soft disabled:opacity-50"
          >
            Submit attempt
          </button>
        </div>
      </div>

      <StuckMenu reasons={reasons} onSelect={handleStuckReason} disabled={busy} />

      {outcome && (
        <>
          <AttemptResultPanel
            diagnosis={outcome.diagnosis}
            onSeeWhy={handleSeeWhy}
            onPracticeThis={handlePracticeThis}
            onTryAnotherApproach={() => setShowExplain(true)}
          />

          {errorResult && <ErrorDeconstructionView result={errorResult} />}
          {showExplain && (
            <ExplainDifferentlyPanel
              onRequestExplanation={(prev) =>
                outcome.intervention ? api.explainDifferently(auth, outcome.intervention.id, prev) : Promise.reject('no intervention')
              }
            />
          )}

          {outcome.recommendation && <InterventionCard recommendation={outcome.recommendation} />}

          {started && outcome.intervention && (
            <>
              <ProgressiveHints onRequestHint={() => api.requestHint(auth, outcome.intervention!.id)} />

              <div className="rounded-md border border-line bg-surface p-5 shadow-panel">
                <p className="font-display text-[13px] font-medium uppercase tracking-[0.14em] text-muted">Reassess</p>
                <p className="mt-1 mb-3 text-[12px] text-muted">Simulate the student's next attempt after practising.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleReassess(true)}
                    disabled={busy}
                    className="rounded-sm bg-signal-teal px-3.5 py-2 font-body text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    Got it right
                  </button>
                  <button
                    onClick={() => handleReassess(false)}
                    disabled={busy}
                    className="rounded-sm border border-line bg-surface px-3.5 py-2 font-body text-[13px] font-medium text-ink transition hover:border-ink/30 hover:bg-porcelain disabled:opacity-50"
                  >
                    Still wrong
                  </button>
                </div>

                {reassessResult && (
                  <div className="mt-4 space-y-2 border-t border-line pt-4">
                    <p className="text-[13px] leading-relaxed text-ink-soft">{reassessResult.effectiveness.note}</p>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-signal-tealSoft px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-signal-teal">
                        Mastery: {reassessResult.masteryUpdate.masteryState}
                      </span>
                      <span className="rounded-full bg-line/70 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-ink-soft">
                        Journey: {reassessResult.journeyUpdate.status}
                      </span>
                    </div>
                    {reassessResult.nextRecommendation && (
                      <div className="pt-2">
                        <p className="mb-2 text-[12px] text-muted">Not resolved — here's the next approach:</p>
                        <InterventionCard recommendation={reassessResult.nextRecommendation} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {!recovery && (
            <button
              onClick={handleStartRecovery}
              className="rounded-sm border border-line bg-surface px-3.5 py-2 font-body text-[13px] font-medium text-ink transition hover:border-ink/30 hover:bg-porcelain"
            >
              Start a recovery session for this pattern
            </button>
          )}
          {recovery && <RecoverySessionView session={recovery} onCompleteStep={handleCompleteRecoveryStep} />}
        </>
      )}

      <InterventionHistoryList rows={history} />
    </div>
  );
}
