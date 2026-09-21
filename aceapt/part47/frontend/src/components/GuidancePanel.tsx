import type { GuidanceView, NextStepPreview } from '../api/types.js';
import './GuidancePanel.css';

export function GuidancePanel({ guidance, nextStepPreview }: { guidance: GuidanceView | null; nextStepPreview: NextStepPreview | null }) {
  if (!guidance && !nextStepPreview) return null;

  return (
    <div className="guidance-panel" role="status" aria-live="polite">
      {guidance && (
        <div className="guidance-panel__block">
          <p className="guidance-panel__message">{guidance.message}</p>
          {guidance.source === 'AI' && <span className="guidance-panel__tag">AI-generated hint</span>}
        </div>
      )}
      {nextStepPreview && (
        <div className="guidance-panel__block">
          {nextStepPreview.nextStepPreview ? (
            <p className="guidance-panel__message">
              <strong>Coming up:</strong> {nextStepPreview.nextStepPreview.objective}
            </p>
          ) : (
            <p className="guidance-panel__message">This is the final step of the problem.</p>
          )}
        </div>
      )}
    </div>
  );
}
