import type { SkillEstimate } from "../../src/types/domain.js";

function SkillGauge({ skill }: { skill: SkillEstimate }) {
  const pct = Math.round(skill.pointEstimate * 100);
  return (
    <div className="diag-skill-row">
      <div>
        <div className="diag-skill-label">{skill.nodeLabel}</div>
        <div className="diag-skill-meta">
          {pct}% · {skill.evidenceCount} independent response{skill.evidenceCount === 1 ? "" : "s"}
        </div>
      </div>
      <div className="diag-skill-meta">{skill.confidenceState.replace(/^\w/, (c) => c.toUpperCase())}</div>
      <div className="diag-gauge-track">
        <div className="diag-gauge-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function StrengthsAndOpportunities({ strengths, weaknesses }: { strengths: SkillEstimate[]; weaknesses: SkillEstimate[] }) {
  return (
    <>
      {strengths.length > 0 && (
        <section className="diag-section">
          <h2 className="diag-h2">Your strengths</h2>
          {strengths.map((s) => (
            <SkillGauge key={s.skillNodeId} skill={s} />
          ))}
        </section>
      )}

      {weaknesses.length > 0 && (
        <section className="diag-section">
          <h2 className="diag-h2">Your biggest opportunities</h2>
          {weaknesses.map((s) => (
            <SkillGauge key={s.skillNodeId} skill={s} />
          ))}
        </section>
      )}
    </>
  );
}
