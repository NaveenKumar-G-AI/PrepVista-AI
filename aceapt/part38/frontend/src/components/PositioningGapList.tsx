import { PositioningGap } from "../types";

interface Props {
  gaps: PositioningGap[];
}

// Evidence gaps are already shown inline in WhyYouFit, so they're not repeated here.
const VISIBLE_TYPES = new Set(["skill", "relevance", "story", "consistency", "communication"]);

export function PositioningGapList({ gaps }: Props) {
  const visible = gaps.filter((g) => VISIBLE_TYPES.has(g.type));

  if (visible.length === 0) {
    return (
      <section className="position-section">
        <h2>Positioning gaps</h2>
        <p style={{ color: "var(--muted)" }}>No positioning gaps found for this role right now.</p>
      </section>
    );
  }

  return (
    <section className="position-section" aria-labelledby="gaps-heading">
      <h2 id="gaps-heading">Positioning gaps</h2>
      <ul className="gap-list">
        {visible.map((gap) => (
          <li key={gap.title} className="gap-item">
            <span className="stamp" aria-hidden="true">
              —
            </span>
            <span>
              <span className="gap-title">{gap.title}</span>
              <span className="gap-explanation">{gap.explanation}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
