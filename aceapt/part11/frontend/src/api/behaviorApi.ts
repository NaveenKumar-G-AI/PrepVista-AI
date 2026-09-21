export type BehaviorLevel = 'LOW' | 'MODERATE' | 'STRONG' | 'DEVELOPING';

export interface BehaviorDimension {
  level: BehaviorLevel;
  explanation: string;
  confidence: number;
  evidenceCount: number;
}

export interface LearningBehaviorProfile {
  studentId: string;
  generatedAt: string;
  isColdStart: boolean;
  dimensions: {
    consistency: BehaviorDimension;
    sessionPattern: BehaviorDimension;
    challengeExposure: BehaviorDimension;
    persistence: BehaviorDimension;
    recovery: BehaviorDimension;
    assistanceDependency: BehaviorDimension;
    confidenceCalibration: BehaviorDimension;
    planAdherence: BehaviorDimension;
  };
}

export interface PlanChangeRecommendation {
  changed: boolean;
  previousSessionMinutes: number;
  recommendedSessionMinutes?: number;
  reasons: string[];
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

async function get<T>(path: string, studentId: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'x-student-id': studentId },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export function fetchBehaviorProfile(studentId: string): Promise<LearningBehaviorProfile> {
  return get(`/student/${studentId}/behavior-profile`, studentId);
}

export function fetchSamplePlanChange(studentId: string, currentPlannedMinutes: number): Promise<PlanChangeRecommendation> {
  return get(`/student/${studentId}/sample-plan-change-explanation?currentPlannedMinutes=${currentPlannedMinutes}`, studentId);
}
