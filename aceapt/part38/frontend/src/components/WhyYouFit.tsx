import { Capability, PositioningGap } from "../types";

interface Props {
  evidence: Capability[];
  gaps: PositioningGap[];
}

export function WhyYouFit({ evidence, gaps }: Props) {
  const evidenceGaps = gaps.filter((g) => g.type === "evidence");

  return (
    <section className="position-section" aria-labelledby="why-you-fit-heading">
      <h2 id="why-you-fit-heading">Why you fit</h2>
      <ul className="evidence-list">
        {evidence.map((c) => (
          <li key={c.id} className="evidence-item evidence-strong">
            <span className="stamp" aria-hidden="true">
              ✓
            </span>
            <span>
              {c.name} — {c.evidenceStrength}
            </span>
          </li>
        ))}
        {evidenceGaps.map((g) => (
          <li key={g.title} className="evidence-item evidence-gap">
            <span className="stamp" aria-hidden="true">
              △
            </span>
            <span>{g.explanation}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
