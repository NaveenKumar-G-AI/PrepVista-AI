// Ports standing in for ACEAPT systems this feature depends on but does not
// own: Feature 27 (Forecast), Feature 26 (Adapt), the Mastery/Retention/
// Transfer capability model, Transfer's novelty classification, and the
// existing auth layer. No reachable ACEAPT/PrepVista repository was
// available in this build session (consistent with every prior part of this
// project — see TRUTH_TABLE.md), so each port below is a documented
// contract plus a deterministic dev/demo implementation in
// src/adapters/demoAdapters.ts. Replace the demo implementation with a real
// adapter that calls the real service, without changing anything that
// depends on the interface.

import type { DifficultyLevel, NoveltyLevel } from './types.js';

/** What Feature 27 (Forecast) is assumed to expose. */
export interface ForecastSignal {
  studentId: string;
  targetId: string;
  readinessForecastPct: number;
  targetPct: number;
  mainUncertainty: {
    capability: string;
    condition: 'TIME_PRESSURE' | 'NOVELTY' | 'STANDARD' | 'CONSISTENCY';
  } | null;
}

export interface ForecastServiceAdapter {
  getForecast(studentId: string, targetId: string): Promise<ForecastSignal>;
}

/** What Feature 26 (Adapt) is assumed to accept. PROOF only classifies and
 *  forwards the failure signature; it must not duplicate intervention logic
 *  (Section 35). */
export interface AdaptInterventionRequest {
  studentId: string;
  targetId: string;
  resultId: string;
  failureSignatures: { type: string; explanation: string }[];
}

export interface AdaptInterventionAdapter {
  sendFailureSignature(
    request: AdaptInterventionRequest,
  ): Promise<{ interventionId: string; accepted: boolean }>;
}

/** What the Mastery/Retention/Transfer capability model is assumed to
 *  expose — raw practice/retention/transfer history that PROOF turns into
 *  evidence, rather than generating its own attempts. */
export interface RawAttemptRecord {
  attemptId: string;
  studentId: string;
  capability: string;
  difficulty: DifficultyLevel;
  isCorrect: boolean;
  performance: number; // 0..1, partial-credit aware
  timeTakenMs: number;
  expectedTimeMs: number;
  noveltyHint: NoveltyLevel | null; // null → PROOF falls back to its own heuristic
  topic: string;
  occurredAt: string;
  sourceEvidenceType: 'PRACTICE' | 'RETENTION' | 'TRANSFER' | 'SIMULATION';
}

export interface CapabilityServiceAdapter {
  getRecentAttempts(studentId: string, capability: string, limit: number): Promise<RawAttemptRecord[]>;
}

/** Transfer intelligence is assumed to already classify novelty for a given
 *  item relative to a student's history (Section 10). PROOF reuses it
 *  rather than re-deriving novelty from scratch; the fallback is a
 *  documented heuristic, not a claim of real novelty modeling. */
export interface NoveltyClassifierAdapter {
  classify(studentId: string, topic: string, questionSignature: string): Promise<NoveltyLevel>;
}

/** Minimal contract PROOF needs from the existing auth layer. Real JWT
 *  verification is NOT implemented in this delivery (see TRUTH_TABLE.md);
 *  this port exists so the API layer has exactly one place to swap in the
 *  real implementation. */
export interface AuthContext {
  studentId: string;
  role: 'STUDENT' | 'TPO' | 'MANAGEMENT';
}

export interface AuthAdapter {
  verify(authorizationHeader: string | undefined): Promise<AuthContext | null>;
}
