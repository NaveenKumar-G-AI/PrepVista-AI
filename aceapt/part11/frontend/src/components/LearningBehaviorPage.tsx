import { useEffect, useState } from 'react';
import { fetchBehaviorProfile, LearningBehaviorProfile, BehaviorDimension, BehaviorLevel } from '../api/behaviorApi';
import { PlanChangeExplanation } from './PlanChangeExplanation';

const DIMENSION_LABELS: Record<keyof LearningBehaviorProfile['dimensions'], string> = {
  consistency: 'Consistency',
  sessionPattern: 'Session Pattern',
  challengeExposure: 'Challenge Exposure',
  persistence: 'Persistence',
  recovery: 'Recovery',
  assistanceDependency: 'Assistance Dependency',
  confidenceCalibration: 'Confidence Calibration',
  planAdherence: 'Plan Adherence',
};

// Mirrors the exact convention in the brief's own UI mock (section 38):
// levels are named in plain, non-judgmental language, never a raw score.
const LEVEL_TEXT: Record<BehaviorLevel, string> = {
  STRONG: 'Strong',
  MODERATE: 'Moderate',
  LOW: 'Needs improvement',
  DEVELOPING: 'Still developing',
};

interface Props {
  studentId?: string;
}

export function LearningBehaviorPage({ studentId = 'demo-arjun' }: Props) {
  const [profile, setProfile] = useState<LearningBehaviorProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBehaviorProfile(studentId)
      .then((p) => { if (!cancelled) setProfile(p); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [studentId]);

  if (error) {
    return (
      <div className="abi-page">
        <p className="abi-error">Couldn't load your behavior profile ({error}). Is the backend running on VITE_API_BASE_URL?</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="abi-page">
        <p className="abi-loading">Loading your learning behavior profile…</p>
      </div>
    );
  }

  return (
    <div className="abi-page">
      <div className="abi-eyebrow">Learning Behavior</div>
      <h1 className="abi-title">How you learn</h1>
      <p className="abi-summary">
        Built from your actual practice activity - not a test score. Every line below is grounded in evidence you can trace; anything without
        enough evidence yet says so plainly, rather than guessing.
      </p>

      {profile.isColdStart && (
        <div className="abi-cold-start">
          <p>Your learning behavior profile is still developing. Keep practicing, and this page will fill in with real patterns from your activity.</p>
        </div>
      )}

      {(Object.keys(DIMENSION_LABELS) as (keyof LearningBehaviorProfile['dimensions'])[]).map((key) => (
        <DimensionRow key={key} name={DIMENSION_LABELS[key]} dimension={profile.dimensions[key]} />
      ))}

      <PlanChangeExplanation studentId={profile.studentId} currentPlannedMinutes={60} />
    </div>
  );
}

function DimensionRow({ name, dimension }: { name: string; dimension: BehaviorDimension }) {
  const totalTicks = 10;
  const filledTicks = Math.round(dimension.confidence * totalTicks);

  return (
    <div className="abi-dimension" data-level={dimension.level}>
      <div className="abi-dimension-head">
        <span className="abi-dimension-name">{name}</span>
        <span className="abi-dimension-level">{LEVEL_TEXT[dimension.level]}</span>
      </div>
      <p className="abi-dimension-explanation">{dimension.explanation}</p>
      {dimension.level !== 'DEVELOPING' && (
        <>
          <div className="abi-evidence-ruler" aria-hidden="true">
            {Array.from({ length: totalTicks }).map((_, i) => (
              <div key={i} className="abi-evidence-tick" data-filled={i < filledTicks} />
            ))}
          </div>
          <div className="abi-evidence-caption">
            {dimension.evidenceCount} observation{dimension.evidenceCount === 1 ? '' : 's'} · confidence {Math.round(dimension.confidence * 100)}%
          </div>
        </>
      )}
    </div>
  );
}
