import { RankedProject, RankedStory } from "../types";

interface Props {
  best: RankedProject | null;
  second: RankedProject | null;
  story: RankedStory | null;
}

export function BestProjectCard({ best, second, story }: Props) {
  if (!best) {
    return (
      <section className="position-section">
        <h2>Best project</h2>
        <p>Add a real project to strengthen your professional evidence.</p>
      </section>
    );
  }

  return (
    <section className="position-section project-card" aria-labelledby="best-project-heading">
      <h2 id="best-project-heading">Best project for this role</h2>
      <p className="project-title">{best.project.title}</p>
      <p>{best.project.description}</p>
      <ul className="project-reasons">
        {best.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>

      {story && (
        <div className="story-block">
          <p className="project-title" style={{ fontSize: 15 }}>
            Best story to tell
          </p>
          <ul className="project-reasons">
            {story.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {second && (
        <p style={{ marginTop: 16, color: "var(--muted)", fontSize: 14 }}>
          Second best: <strong style={{ color: "var(--ink)" }}>{second.project.title}</strong>
        </p>
      )}
    </section>
  );
}
