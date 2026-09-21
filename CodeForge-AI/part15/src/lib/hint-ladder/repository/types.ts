import {
  AssistanceLevel,
  DeliveredHintRecord,
  HintEventType,
  HintLadderState,
  HintType,
  ProductMode,
} from "../types";
import { ConcurrencyConflictError } from "../errors";

export interface NewHintEventInput {
  eventType: HintEventType;
  assistanceLevel: AssistanceLevel | null;
  hintType: HintType | null;
  payload: Record<string, unknown>;
  requestId: string | null;
  provider: string | null;
  model: string | null;
  latencyMs: number | null;
}

export interface ApplyTransitionInput {
  sessionId: string;
  /** Optimistic concurrency: must match the row's current version or an ConcurrencyConflictError is thrown. */
  expectedVersion: number;
  patch: Partial<
    Pick<
      HintLadderState,
      "status" | "currentLevel" | "consecutiveIneffectiveCount" | "lastKnownExecution" | "executionAtLastHint" | "codeAtLastHint" | "rootIssue"
    >
  >;
  appendHistory?: DeliveredHintRecord;
  events: NewHintEventInput[];
}

/**
 * Every method that mutates state is keyed by (studentId, problemId) or a
 * sessionId that was ALREADY resolved from an authenticated studentId —
 * callers (service.ts) are responsible for never accepting a raw
 * client-supplied sessionId without having first verified it belongs to
 * the authenticated user. See supabase-repository.ts, which additionally
 * relies on RLS as a second, independent enforcement layer for that.
 */
export interface HintLadderRepository {
  getOrCreateSession(params: { studentId: string; problemId: string; mode: ProductMode; now: string }): Promise<HintLadderState>;
  getSession(params: { studentId: string; problemId: string }): Promise<HintLadderState | null>;
  getHistory(sessionId: string): Promise<DeliveredHintRecord[]>;

  /** Idempotency: has this requestId already produced a cached response for this session? */
  getCachedResponse(sessionId: string, requestId: string): Promise<unknown | null>;
  cacheResponse(sessionId: string, requestId: string, response: unknown): Promise<void>;

  /** Atomic write with optimistic concurrency control. Throws ConcurrencyConflictError on version mismatch. */
  applyTransition(input: ApplyTransitionInput): Promise<HintLadderState>;
}

export { ConcurrencyConflictError };
