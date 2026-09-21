import { useCallback, useEffect, useState } from "react";
import { getPositioning, ApiError } from "../api/positioningClient";
import { PositioningProfile, PositioningStrength } from "../types";
import { WhyYouFit } from "./WhyYouFit";
import { BestProjectCard } from "./BestProjectCard";
import { PositioningGapList } from "./PositioningGapList";
import { EmptyState } from "./EmptyState";

interface Props {
  studentId: string;
  roleId: string | null;
}

type LoadState =
  | { status: "no-role" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; profile: PositioningProfile };

const STRENGTH_LABEL: Record<PositioningStrength, string> = {
  strong: "Strong positioning",
  moderate: "Moderate positioning",
  developing: "Developing positioning",
  "insufficient-data": "Not enough data yet",
};

export function MyProfessionalPosition({ studentId, roleId }: Props) {
  const [state, setState] = useState<LoadState>(roleId ? { status: "loading" } : { status: "no-role" });

  const load = useCallback(() => {
    if (!roleId) {
      setState({ status: "no-role" });
      return;
    }
    setState({ status: "loading" });
    getPositioning(studentId, roleId)
      .then((profile) => setState({ status: "ready", profile }))
      .catch((err: ApiError) =>
        setState({ status: "error", message: err.error || "Positioning analysis is temporarily unavailable." })
      );
  }, [studentId, roleId]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === "no-role") {
    return (
      <EmptyState
        title="Choose a career direction"
        body="Choose a career direction to build your professional position."
        cta="Choose target role"
      />
    );
  }

  if (state.status === "loading") {
    return (
      <div className="position-loading" role="status" aria-live="polite">
        Building your position…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="position-error" role="alert">
        <p>{state.message}</p>
        <button className="cta-secondary" onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  const { profile } = state;
  const hasEvidence = profile.strongestEvidence.length > 0;
  const hasProject = profile.bestProject !== null;

  return (
    <div className="position-page">
      <header className="position-header">
        <p className="position-eyebrow">Target role</p>
        <h1>{profile.targetRoleName}</h1>
        <p className="position-statement">{profile.primaryPosition}</p>
        <div className="position-badges">
          <span className={`badge badge-strength-${profile.positioningStrength}`}>
            {STRENGTH_LABEL[profile.positioningStrength]}
          </span>
          <span className="badge" title={profile.confidenceExplanation}>
            {profile.confidence} confidence
          </span>
        </div>
      </header>

      {hasEvidence ? (
        <WhyYouFit evidence={profile.strongestEvidence} gaps={profile.gaps} />
      ) : (
        <section className="position-section">
          <EmptyState
            title="Your position will get stronger"
            body="Your professional position will become stronger as you validate more capabilities."
            cta="Build your first proof"
          />
        </section>
      )}

      {profile.differentiators[0] && (
        <section className="position-section">
          <h2>Your differentiator</h2>
          <p>{profile.differentiators[0].description}</p>
        </section>
      )}

      {!hasProject ? (
        <section className="position-section">
          <EmptyState
            title="Add your first project"
            body="Add a real project to strengthen your professional evidence."
            cta="Add a project"
          />
        </section>
      ) : (
        <BestProjectCard best={profile.bestProject} second={profile.secondBestProject} story={profile.bestStory} />
      )}

      <PositioningGapList gaps={profile.gaps} />

      <button className="cta-primary" onClick={load}>
        Review my position
      </button>
    </div>
  );
}
