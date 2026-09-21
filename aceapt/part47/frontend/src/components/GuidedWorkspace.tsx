import { useGuidedSession } from '../state/useGuidedSession.js';
import { ProblemPanel } from './ProblemPanel.js';
import { SolvingPath } from './SolvingPath.js';
import { CurrentStepCard } from './CurrentStepCard.js';
import { HelpBar } from './HelpBar.js';
import { FullSolutionPanel } from './FullSolutionPanel.js';
import { SessionSummaryCard } from './SessionSummaryCard.js';
import { VerificationBanner } from './VerificationBanner.js';
import './GuidedWorkspace.css';

export function GuidedWorkspace({
  session: hook,
  onExit,
}: {
  session: ReturnType<typeof useGuidedSession>;
  onExit: () => void;
}) {
  const { session, currentStep, lastAttempt, guidance, nextStepPreview, fullSolution, reconstructionResult, summary, loading, error, actions } =
    hook;

  if (!session) return null;

  const allStepsDone = session.currentStepIndex >= session.totalSteps && !session.solutionRevealed;

  return (
    <div className="guided-workspace">
      <aside className="guided-workspace__rail">
        <SolvingPath steps={session.solvingPath} />
      </aside>

      <div className="guided-workspace__main">
        <ProblemPanel session={session} />

        {error && (
          <div className="guided-workspace__error" role="alert">
            {error}
          </div>
        )}

        {session.mode === 'VERIFICATION' && !summary && <VerificationBanner />}

        {summary && (
          <SessionSummaryCard
            summary={summary}
            canVerify={session.mode === 'GUIDED'}
            onStartVerification={actions.startVerification}
            onNewProblem={onExit}
            onFeedback={actions.submitFeedback}
            loading={loading}
          />
        )}

        {!summary && fullSolution && (
          <FullSolutionPanel
            solution={fullSolution}
            reconstructionResult={reconstructionResult}
            onSubmitReconstruction={actions.submitReconstruction}
            loading={loading}
          />
        )}

        {!summary && !fullSolution && currentStep && (
          <>
            <CurrentStepCard
              step={currentStep}
              lastAttempt={lastAttempt}
              guidance={guidance}
              nextStepPreview={nextStepPreview}
              loading={loading}
              onSubmit={actions.submit}
              onRetry={actions.retry}
              onSkip={actions.skip}
            />
            {session.allowsGuidance && (
              <HelpBar
                onHint={actions.requestHint}
                onExplain={actions.requestExplain}
                onShowNext={actions.showNext}
                onShowSolution={actions.revealSolution}
                disabled={loading}
              />
            )}
          </>
        )}

        {!summary && !fullSolution && !currentStep && allStepsDone && (
          <div className="guided-workspace__done">
            <p>Every step is complete.</p>
            <button type="button" className="answer-input__submit" onClick={actions.complete} disabled={loading}>
              See summary
            </button>
          </div>
        )}

        {!summary && !fullSolution && !currentStep && session.solutionRevealed && (
          <div className="guided-workspace__done">
            <p>Ready to close this out?</p>
            <button type="button" className="answer-input__submit" onClick={actions.complete} disabled={loading}>
              See summary
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
