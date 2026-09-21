/**
 * Supabase-backed HintLadderRepository.
 *
 * Security note: every method here takes a `SupabaseClient` that the
 * CALLER constructed already scoped to the authenticated user (via
 * createSupabaseServerClient() — see server-client.ts), so every query
 * below is ALSO subject to the RLS policies in
 * supabase/migrations/0001_hint_ladder_schema.sql. That's intentional
 * defense in depth: even if a bug in service.ts ever let a mismatched
 * studentId slip through application-level checks, RLS independently
 * blocks the row.
 *
 * Not exercised against a live Supabase project in this sandbox (no
 * project/keys are configured — see README "Known limitations"). Its
 * logic mirrors InMemoryHintLadderRepository closely enough that the
 * unit/integration tests exercising that repository are strong evidence
 * this one is structurally correct; what they cannot verify is the live
 * network/SQL round-trip, which needs a real Supabase project.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ConcurrencyConflictError } from "../errors";
import { DeliveredHintRecord, HintLadderState } from "../types";
import { ApplyTransitionInput, HintLadderRepository } from "./types";

interface HintSessionRow {
  id: string;
  student_id: string;
  problem_id: string;
  mode: HintLadderState["mode"];
  status: HintLadderState["status"];
  current_level: HintLadderState["currentLevel"];
  consecutive_ineffective_count: number;
  root_issue: HintLadderState["rootIssue"];
  execution_at_last_hint: HintLadderState["executionAtLastHint"];
  code_at_last_hint: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface HintEventRow {
  id: string;
  hint_session_id: string;
  student_id: string;
  event_type: string;
  assistance_level: string | null;
  hint_type: string | null;
  payload: Record<string, unknown>;
  request_id: string | null;
  provider: string | null;
  model: string | null;
  latency_ms: number | null;
  created_at: string;
}

function rowToState(row: HintSessionRow, history: DeliveredHintRecord[]): HintLadderState {
  return {
    sessionId: row.id,
    studentId: row.student_id,
    problemId: row.problem_id,
    mode: row.mode,
    status: row.status,
    currentLevel: row.current_level,
    consecutiveIneffectiveCount: row.consecutive_ineffective_count,
    lastKnownExecution: null, // derived by the caller from the live execution system, not stored redundantly here
    executionAtLastHint: row.execution_at_last_hint,
    codeAtLastHint: row.code_at_last_hint,
    rootIssue: row.root_issue,
    history,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function eventToDeliveredHint(row: HintEventRow): DeliveredHintRecord | null {
  if (row.event_type !== "HINT_DELIVERED") return null;
  const p = row.payload as Partial<DeliveredHintRecord> & Record<string, unknown>;
  return {
    eventId: row.id,
    level: (row.assistance_level as DeliveredHintRecord["level"]) ?? "DIRECTION",
    hintType: (row.hint_type as DeliveredHintRecord["hintType"]) ?? "DIRECTION",
    concept: (p.concept as DeliveredHintRecord["concept"]) ?? "OTHER",
    targetSignature: (p.targetSignature as string) ?? "OTHER:unscoped",
    text: (p.text as string) ?? "",
    observation: (p.observation as string) ?? "",
    confidence: (p.confidence as DeliveredHintRecord["confidence"]) ?? "LOW",
    codeLocation: (p.codeLocation as DeliveredHintRecord["codeLocation"]) ?? null,
    createdAt: row.created_at,
    executionSnapshotAtDelivery: (p.executionSnapshotAtDelivery as DeliveredHintRecord["executionSnapshotAtDelivery"]) ?? null,
    studentResponse: (p.studentResponse as DeliveredHintRecord["studentResponse"]) ?? null,
    effectiveness: (p.effectiveness as DeliveredHintRecord["effectiveness"]) ?? "PENDING",
    source: (p.source as DeliveredHintRecord["source"]) ?? "AI_GENERATED",
  };
}

export class SupabaseHintLadderRepository implements HintLadderRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getOrCreateSession(params: { studentId: string; problemId: string; mode: HintLadderState["mode"]; now: string }): Promise<HintLadderState> {
    const existing = await this.getSession({ studentId: params.studentId, problemId: params.problemId });
    if (existing) return existing;

    const { data, error } = await this.client
      .from("hint_sessions")
      .insert({ student_id: params.studentId, problem_id: params.problemId, mode: params.mode })
      .select()
      .single<HintSessionRow>();

    if (error || !data) throw new Error(`Failed to create hint session: ${error?.message}`);
    return rowToState(data, []);
  }

  async getSession(params: { studentId: string; problemId: string }): Promise<HintLadderState | null> {
    const { data, error } = await this.client
      .from("hint_sessions")
      .select()
      .eq("student_id", params.studentId)
      .eq("problem_id", params.problemId)
      .maybeSingle<HintSessionRow>();

    if (error) throw new Error(`Failed to load hint session: ${error.message}`);
    if (!data) return null;

    const history = await this.getHistory(data.id);
    return rowToState(data, history);
  }

  async getHistory(sessionId: string): Promise<DeliveredHintRecord[]> {
    const { data, error } = await this.client
      .from("hint_events")
      .select()
      .eq("hint_session_id", sessionId)
      .eq("event_type", "HINT_DELIVERED")
      .order("created_at", { ascending: true })
      .returns<HintEventRow[]>();

    if (error) throw new Error(`Failed to load hint history: ${error.message}`);
    return (data ?? []).map(eventToDeliveredHint).filter((r): r is DeliveredHintRecord => r !== null);
  }

  async getCachedResponse(sessionId: string, requestId: string): Promise<unknown | null> {
    const { data, error } = await this.client
      .from("hint_events")
      .select("payload")
      .eq("hint_session_id", sessionId)
      .eq("request_id", requestId)
      .limit(1)
      .maybeSingle<{ payload: { cachedResponse?: unknown } }>();

    if (error) throw new Error(`Failed to check idempotency: ${error.message}`);
    return data?.payload?.cachedResponse ?? null;
  }

  async cacheResponse(sessionId: string, requestId: string, response: unknown): Promise<void> {
    // Cached alongside the event that produced it via a dedicated
    // HINT_GENERATED marker row rather than a separate table — keeps the
    // idempotency key (hint_session_id, request_id) unique constraint
    // (see migration) doing double duty for both purposes.
    const sessionLookup = await this.client.from("hint_sessions").select("student_id").eq("id", sessionId).single();
    await this.client.from("hint_events").insert({
      hint_session_id: sessionId,
      student_id: sessionLookup.data?.student_id,
      event_type: "HINT_GENERATED",
      request_id: requestId,
      payload: { cachedResponse: response },
    });
  }

  async applyTransition(input: ApplyTransitionInput): Promise<HintLadderState> {
    // Optimistic concurrency: the UPDATE only succeeds if version still
    // matches what the caller last read. Postgres/PostgREST returns zero
    // affected rows (not an error) on a stale version, which we detect
    // via .select() + checking the result is empty.
    const patch: Record<string, unknown> = { version: input.expectedVersion + 1, updated_at: new Date().toISOString() };
    if (input.patch.status !== undefined) patch.status = input.patch.status;
    if (input.patch.currentLevel !== undefined) patch.current_level = input.patch.currentLevel;
    if (input.patch.consecutiveIneffectiveCount !== undefined) patch.consecutive_ineffective_count = input.patch.consecutiveIneffectiveCount;
    if (input.patch.executionAtLastHint !== undefined) patch.execution_at_last_hint = input.patch.executionAtLastHint;
    if (input.patch.codeAtLastHint !== undefined) patch.code_at_last_hint = input.patch.codeAtLastHint;
    if (input.patch.rootIssue !== undefined) patch.root_issue = input.patch.rootIssue;

    const { data: updatedRows, error: updateError } = await this.client
      .from("hint_sessions")
      .update(patch)
      .eq("id", input.sessionId)
      .eq("version", input.expectedVersion)
      .select()
      .returns<HintSessionRow[]>();

    if (updateError) throw new Error(`Failed to update hint session: ${updateError.message}`);
    if (!updatedRows || updatedRows.length === 0) {
      throw new ConcurrencyConflictError(`Session ${input.sessionId} was modified elsewhere (expected version ${input.expectedVersion}).`);
    }
    const updatedRow = updatedRows[0]!;

    if (input.events.length > 0) {
      const { error: eventsError } = await this.client.from("hint_events").insert(
        input.events.map((e) => ({
          hint_session_id: input.sessionId,
          student_id: updatedRow.student_id,
          event_type: e.eventType,
          assistance_level: e.assistanceLevel,
          hint_type: e.hintType,
          payload: e.payload,
          request_id: e.requestId,
          provider: e.provider,
          model: e.model,
          latency_ms: e.latencyMs,
        }))
      );
      if (eventsError) throw new Error(`Failed to record hint events: ${eventsError.message}`);
    }

    const history = await this.getHistory(input.sessionId);
    return rowToState(updatedRow, history);
  }
}
