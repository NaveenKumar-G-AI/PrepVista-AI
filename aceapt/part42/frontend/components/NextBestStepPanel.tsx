import type { RecommendedAction } from "../../src/types/domain.js";

const ACTION_COPY: Record<string, string> = {
  guided_practice: "Work through guided practice on this skill",
  practice_mixed_problems: "Practice mixed problems that combine this with related skills",
  reinforcement_practice: "A short round of reinforcement practice",
  advance_to_harder_material: "Move on to harder material in this area",
  verification_assessment: "A short verification check to confirm this reading",
};

export function NextBestStepPanel({ recommendations, onStart }: { recommendations: RecommendedAction[]; onStart?: () => void }) {
  return (
    <section className="diag-section">
      <h2 className="diag-h2">Your next best step</h2>
      {recommendations.length === 0 ? (
        <p className="diag-lede">Nothing urgent stands out yet — keep building evidence and we'll sharpen this.</p>
      ) : (
        <ol className="diag-step-list">
          {recommendations.map((rec) => (
            <li key={rec.skillNodeId} className="diag-step-item">
              <p className="diag-step-action">{ACTION_COPY[rec.recommendedAction] ?? rec.recommendedAction}</p>
              <p className="diag-step-rationale">{rec.rationale}</p>
            </li>
          ))}
        </ol>
      )}
      <button type="button" className="diag-cta" style={{ marginTop: "1.5rem" }} onClick={onStart}>
        Start my personalized path
      </button>
    </section>
  );
}
