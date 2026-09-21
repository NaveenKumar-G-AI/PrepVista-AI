/**
 * API Controllers.
 *
 * Framework-agnostic on purpose: each function takes plain data in and
 * returns plain data out, so it can be wrapped by a Next.js route handler,
 * an Express route, a queue worker, or a test — without change. See
 * api/adapters/nextjs-routes.example.ts for the thin HTTP wrapper.
 *
 * Persistence goes through the `AssessmentRepository` port defined below.
 * `InMemoryRepository` (also below) is a fully-working reference
 * implementation used by the test suite; a production deployment backs the
 * same interface with the tables in db/migrations/0001_understanding_check.sql.
 */
import { randomUUID } from "node:crypto";
import { assertNonEmpty, assertOwnership, sanitizeStudentInput, type CurrentUser } from "@/security/index.js";
import { extractMentalModel } from "@/understanding/mentalModel.js";
import { buildUnderstandingProfile } from "@/understanding/evidenceEngine.js";
import { selectNextProbe } from "@/understanding/probeEngine.js";
import { dispatchProbeGeneration } from "@/understanding/generators/index.js";
import { generateRecommendationsForProfile } from "@/understanding/recommendationEngine.js";
import { buildEvaluationPrompt } from "@/ai/prompts.js";
import { ResponseEvaluationSchema } from "@/ai/schemas.js";
import { structuredCall } from "@/ai/structuredCall.js";
import type { ProviderChain } from "@/ai/provider.js";
import { observability } from "@/observability/metrics.js";
import {
  toPublicProbe,
  type AssessmentReport,
  type AssessmentStatus,
  type EvidenceItem,
  type MentalModel,
  type Probe,
  type PublicProbe,
  type StudentSubmission,
  type UnderstandingDimension,
  type UnderstandingProfile,
} from "@/types/index.js";

const DEFAULT_MAX_PROBES = 8;

// ---------------------------------------------------------------------------
// Persistence port
// ---------------------------------------------------------------------------

export interface AssessmentRow {
  id: string;
  student_id: string;
  challenge_id: string;
  status: AssessmentStatus;
  submission: StudentSubmission;
  mentalModel: MentalModel;
  maxProbes: number;
  createdAt: string;
}

export interface AssessmentRepository {
  createAssessment(row: AssessmentRow): Promise<void>;
  getAssessment(id: string): Promise<AssessmentRow | null>;
  updateAssessmentStatus(id: string, status: AssessmentStatus): Promise<void>;
  addProbe(probe: Probe): Promise<void>;
  getProbe(assessmentId: string, probeId: string): Promise<Probe | null>;
  listProbes(assessmentId: string): Promise<Probe[]>;
  addEvidence(item: EvidenceItem): Promise<void>;
  listEvidence(assessmentId: string): Promise<EvidenceItem[]>;
  saveHistorySnapshot(profile: UnderstandingProfile): Promise<void>;
  listHistory(studentId: string, challengeId: string | undefined, limit: number, offset: number): Promise<UnderstandingProfile[]>;
}

/** Fully-working reference implementation, used by tests and safe for local
 *  prototyping. A production deployment swaps this for a Postgres/Supabase
 *  adapter implementing the same interface against the schema in
 *  db/migrations/0001_understanding_check.sql. */
export class InMemoryRepository implements AssessmentRepository {
  private assessments = new Map<string, AssessmentRow>();
  private probes = new Map<string, Probe>();
  private evidence = new Map<string, EvidenceItem[]>();
  private history: UnderstandingProfile[] = [];

  async createAssessment(row: AssessmentRow): Promise<void> {
    this.assessments.set(row.id, row);
    this.evidence.set(row.id, []);
  }
  async getAssessment(id: string): Promise<AssessmentRow | null> {
    return this.assessments.get(id) ?? null;
  }
  async updateAssessmentStatus(id: string, status: AssessmentStatus): Promise<void> {
    const row = this.assessments.get(id);
    if (row) row.status = status;
  }
  async addProbe(probe: Probe): Promise<void> {
    this.probes.set(probe.id, probe);
  }
  async getProbe(assessmentId: string, probeId: string): Promise<Probe | null> {
    const probe = this.probes.get(probeId);
    return probe && probe.assessment_id === assessmentId ? probe : null;
  }
  async listProbes(assessmentId: string): Promise<Probe[]> {
    return [...this.probes.values()].filter((p) => p.assessment_id === assessmentId);
  }
  async addEvidence(item: EvidenceItem): Promise<void> {
    const list = this.evidence.get(item.assessment_id) ?? [];
    list.push(item);
    this.evidence.set(item.assessment_id, list);
  }
  async listEvidence(assessmentId: string): Promise<EvidenceItem[]> {
    return this.evidence.get(assessmentId) ?? [];
  }
  async saveHistorySnapshot(profile: UnderstandingProfile): Promise<void> {
    this.history.push(profile);
  }
  async listHistory(studentId: string, challengeId: string | undefined, limit: number, offset: number): Promise<UnderstandingProfile[]> {
    const filtered = this.history
      .filter((p) => p.student_id === studentId && (!challengeId || p.challenge_id === challengeId))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return filtered.slice(offset, offset + limit);
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function summarizePriorEvidence(items: EvidenceItem[]): string {
  if (items.length === 0) return "(none yet)";
  return items
    .slice(-6)
    .map((i) => `- [${i.dimension}/${i.probe_type}] "${i.concept}" -> ${i.result} (confidence ${i.confidence})`)
    .join("\n");
}

function groupEvidenceByDimension(items: EvidenceItem[]): Record<UnderstandingDimension, EvidenceItem[]> {
  const out: Partial<Record<UnderstandingDimension, EvidenceItem[]>> = {};
  for (const item of items) {
    (out[item.dimension] ??= []).push(item);
  }
  return out as Record<UnderstandingDimension, EvidenceItem[]>;
}

async function computeProfile(row: AssessmentRow, evidence: EvidenceItem[]): Promise<UnderstandingProfile> {
  return buildUnderstandingProfile({
    assessmentId: row.id,
    studentId: row.student_id,
    challengeId: row.challenge_id,
    status: row.status,
    evidence,
    execution: row.submission.execution,
    role: row.submission.role,
    probesAsked: evidence.length,
    maxProbes: row.maxProbes,
    createdAt: row.createdAt,
  });
}

/** Deterministic fallback used only when every configured AI provider fails
 *  for a given call. Never presented as if AI-generated; always grounded in
 *  whatever deterministic facts we actually have. */
function fallbackProbeContent(dimension: UnderstandingDimension, concept: string, mentalModel: MentalModel) {
  const fallbackExpected: Partial<Record<UnderstandingDimension, string>> = {
    problem: mentalModel.problem_objective,
    algorithm: mentalModel.algorithm,
    correctness: mentalModel.correctness_argument,
    complexity: mentalModel.complexity.justification,
    invariant: mentalModel.candidate_invariants[0] ?? "",
  };
  return {
    purpose: `Assess ${dimension} understanding of "${concept}" (fallback template — AI probe generation was unavailable).`,
    question: `In your own words, explain "${concept}" in your solution: what it does, why it's necessary, and what would break if it were removed or wrong.`,
    expected_reasoning: "A causal explanation referencing the actual code, not a restatement of the question.",
    evaluation_criteria: ["References the actual code", "Explains causal necessity, not just what it does"],
    expected_evidence: fallbackExpected[dimension] || `A correct, causal explanation of ${concept}.`,
  };
}

async function selectAndGenerateNextProbe(
  row: AssessmentRow,
  repo: AssessmentRepository,
  chain: ProviderChain,
  evidence: EvidenceItem[]
): Promise<{ probe: PublicProbe | null; terminated: boolean; profile: UnderstandingProfile }> {
  const profile = await computeProfile(row, evidence);

  if (row.status !== "in_progress") {
    return { probe: null, terminated: true, profile };
  }

  const evidenceByDimension = groupEvidenceByDimension(evidence);
  const lastEvidence = evidence[evidence.length - 1];

  const spec = selectNextProbe({
    dimensions: profile.dimensions,
    evidenceByDimension,
    mentalModel: row.mentalModel,
    probesAsked: evidence.length,
    maxProbes: row.maxProbes,
    role: row.submission.role,
    lastEvidence,
  });

  if (!spec) {
    await repo.updateAssessmentStatus(row.id, "completed");
    row.status = "completed";
    const finalProfile = await computeProfile(row, evidence);
    observability.emit({
      type: "assessment_completed",
      assessmentId: row.id,
      classification: finalProfile.classification,
      probesAsked: evidence.length,
      overallConfidence: finalProfile.overall_confidence,
    });
    return { probe: null, terminated: true, profile: finalProfile };
  }

  const priorEvidenceSummary = summarizePriorEvidence(evidenceByDimension[spec.dimension] ?? []);
  const debuggingAttemptIndex = (evidenceByDimension["debugging"] ?? []).length;

  const genStart = Date.now();
  const result = await dispatchProbeGeneration(
    row.submission,
    row.mentalModel,
    spec,
    priorEvidenceSummary,
    chain,
    debuggingAttemptIndex
  ).catch((err: unknown) => ({ outcome: { ok: false as const, reason: String(err) }, grounding: {} }));

  let probe: Probe;
  if (result.outcome.ok) {
    const ai = result.outcome.data as {
      target_dimension: UnderstandingDimension;
      target_concept: string;
      purpose: string;
      question: string;
      expected_reasoning: string;
      evaluation_criteria: string[];
      expected_evidence: string;
    };
    let expectedEvidence = ai.expected_evidence;
    const mutationInfo = (result as { mutationOutcome?: { ok: boolean; data?: { mutation_kind: string; mutation_description: string } } })
      .mutationOutcome;
    if (mutationInfo?.ok && mutationInfo.data) {
      expectedEvidence += ` | Ground truth mutation: ${mutationInfo.data.mutation_kind} — ${mutationInfo.data.mutation_description}`;
    }
    probe = {
      id: randomUUID(),
      assessment_id: row.id,
      target_dimension: spec.dimension,
      target_concept: ai.target_concept || spec.concept,
      probe_type: spec.probeType,
      difficulty: spec.difficulty,
      purpose: ai.purpose,
      question: ai.question,
      grounding: result.grounding,
      expected_reasoning: ai.expected_reasoning,
      evaluation_criteria: ai.evaluation_criteria,
      expected_evidence: expectedEvidence,
      created_at: new Date().toISOString(),
    };
  } else {
    observability.emit({ type: "provider_failure", provider: "chain", context: `probe_generation:${spec.probeType}` });
    const fallback = fallbackProbeContent(spec.dimension, spec.concept, row.mentalModel);
    probe = {
      id: randomUUID(),
      assessment_id: row.id,
      target_dimension: spec.dimension,
      target_concept: spec.concept,
      probe_type: spec.probeType,
      difficulty: spec.difficulty,
      purpose: fallback.purpose,
      question: fallback.question,
      grounding: result.grounding ?? {},
      expected_reasoning: fallback.expected_reasoning,
      evaluation_criteria: fallback.evaluation_criteria,
      expected_evidence: fallback.expected_evidence,
      created_at: new Date().toISOString(),
    };
  }

  await repo.addProbe(probe);
  observability.emit({
    type: "probe_generated",
    assessmentId: row.id,
    dimension: spec.dimension,
    probeType: spec.probeType,
    provider: result.outcome.ok ? result.outcome.provider : null,
    latencyMs: Date.now() - genStart,
    degraded: !result.outcome.ok,
  });

  return { probe: toPublicProbe(probe), terminated: false, profile };
}

// ---------------------------------------------------------------------------
// Controllers
// ---------------------------------------------------------------------------

export interface CreateAssessmentInput {
  submission: StudentSubmission;
  user: CurrentUser;
  chain: ProviderChain;
  repo: AssessmentRepository;
  maxProbes?: number;
}

export async function createAssessment(input: CreateAssessmentInput) {
  assertNonEmpty(input.submission.source_code, "source_code");
  assertNonEmpty(input.submission.problem_statement, "problem_statement");
  if (input.submission.student_id !== input.user.id && input.user.role !== "staff" && input.user.role !== "admin") {
    throw new Error("Cannot create an assessment for another student.");
  }

  const genStart = Date.now();
  const { mentalModel, outcome } = await extractMentalModel(input.submission, input.chain, (provider, err) =>
    observability.emit({ type: "provider_failure", provider, context: `mental_model:${String(err)}` })
  );

  const resolvedModel: MentalModel =
    mentalModel ??
    ({
      problem_objective: input.submission.problem_statement.slice(0, 300),
      constraints: [],
      algorithm: "Unavailable — AI extraction failed; deterministic fallback in use.",
      algorithm_steps: [],
      important_variables: [],
      data_structures: [],
      state_transitions: [],
      control_flow_summary: "Unavailable — AI extraction failed.",
      candidate_invariants: [],
      correctness_argument: "Unavailable — AI extraction failed.",
      complexity: input.submission.existingAnalysis?.complexity
        ? { ...input.submission.existingAnalysis.complexity, justification: "From CodeForge's existing analyzer." }
        : { time: "unknown", space: "unknown", justification: "Unavailable." },
      tradeoffs: [],
      relevant_edge_cases: [],
      assumptions: [],
      derivedFromExistingAnalysis: Boolean(input.submission.existingAnalysis?.complexity),
    } satisfies MentalModel);

  observability.emit({
    type: "mental_model_extracted",
    assessmentId: "pending",
    provider: outcome.ok ? outcome.provider : null,
    latencyMs: Date.now() - genStart,
    degraded: !outcome.ok,
  });

  const row: AssessmentRow = {
    id: randomUUID(),
    student_id: input.submission.student_id,
    challenge_id: input.submission.challenge_id,
    status: "in_progress",
    submission: input.submission,
    mentalModel: resolvedModel,
    maxProbes: input.maxProbes ?? DEFAULT_MAX_PROBES,
    createdAt: new Date().toISOString(),
  };
  await input.repo.createAssessment(row);
  observability.emit({ type: "assessment_created", assessmentId: row.id, challengeId: row.challenge_id });

  const { probe, terminated, profile } = await selectAndGenerateNextProbe(row, input.repo, input.chain, []);
  return { assessmentId: row.id, profile, firstProbe: probe, terminated };
}

export interface GenerateProbeInput {
  assessmentId: string;
  user: CurrentUser;
  chain: ProviderChain;
  repo: AssessmentRepository;
}

export async function generateProbe(input: GenerateProbeInput) {
  const row = await input.repo.getAssessment(input.assessmentId);
  if (!row) throw new Error("Assessment not found.");
  assertOwnership({ student_id: row.student_id }, input.user);

  const evidence = await input.repo.listEvidence(row.id);
  return selectAndGenerateNextProbe(row, input.repo, input.chain, evidence);
}

export interface SubmitResponseInput {
  assessmentId: string;
  probeId: string;
  studentResponseRaw: string;
  user: CurrentUser;
  chain: ProviderChain;
  repo: AssessmentRepository;
}

export async function submitResponse(input: SubmitResponseInput) {
  const row = await input.repo.getAssessment(input.assessmentId);
  if (!row) throw new Error("Assessment not found.");
  assertOwnership({ student_id: row.student_id }, input.user);

  const probe = await input.repo.getProbe(input.assessmentId, input.probeId);
  if (!probe) throw new Error("Probe not found for this assessment.");

  const { clean, flaggedPatterns } = sanitizeStudentInput(input.studentResponseRaw);
  if (flaggedPatterns.length > 0) {
    observability.emit({ type: "injection_pattern_flagged", assessmentId: row.id, probeId: probe.id, patterns: flaggedPatterns });
  }

  const evalStart = Date.now();
  const { systemPrompt, userContent } = buildEvaluationPrompt({
    probe,
    studentResponseClean: clean,
    executionFact: probe.grounding.execution_fact,
  });
  const outcome = await structuredCall({ chain: input.chain, schema: ResponseEvaluationSchema, systemPrompt, userContent });

  let result: EvidenceItem["result"];
  let observed: string;
  let confidence: number;
  let providerUsed: string | null;

  if (outcome.ok) {
    result = outcome.data.needs_clarification ? "ambiguous" : outcome.data.result;
    observed = outcome.data.gap_if_any || outcome.data.observed_evidence;
    confidence = outcome.data.confidence;
    providerUsed = outcome.provider;

    // Defense-in-depth damping (see security/index.ts) — a manipulation
    // attempt can never purchase a higher score than genuine evidence would.
    if (flaggedPatterns.length > 0) confidence = Math.round(confidence * 0.7);
    // Missing execution ground truth for execution-grounded probe types ->
    // reduced confidence rather than fabricated certainty.
    const executionGrounded: Array<Probe["probe_type"]> = ["prediction", "state_trace", "edge_case"];
    if (!probe.grounding.execution_fact && executionGrounded.includes(probe.probe_type)) {
      confidence = Math.round(confidence * 0.85);
    }
  } else {
    observability.emit({ type: "provider_failure", provider: "chain", context: "response_evaluation" });
    result = "ambiguous";
    observed = "Automatic evaluation unavailable for this response; recorded with minimal confidence rather than a fabricated verdict.";
    confidence = 10;
    providerUsed = null;
  }

  const evidenceItem: EvidenceItem = {
    id: randomUUID(),
    assessment_id: row.id,
    dimension: probe.target_dimension,
    concept: probe.target_concept,
    probe_id: probe.id,
    probe_type: probe.probe_type,
    question: probe.question,
    student_response: clean,
    expected_evidence: probe.expected_evidence,
    observed_evidence: observed,
    result,
    confidence,
    ai_provider_used: providerUsed,
    created_at: new Date().toISOString(),
  };
  await input.repo.addEvidence(evidenceItem);
  observability.emit({
    type: "response_evaluated",
    assessmentId: row.id,
    probeId: probe.id,
    result,
    provider: providerUsed,
    latencyMs: Date.now() - evalStart,
    degraded: !outcome.ok,
  });

  const evidence = await input.repo.listEvidence(row.id);
  const next = await selectAndGenerateNextProbe(row, input.repo, input.chain, evidence);

  return { evidence: evidenceItem, nextProbe: next.probe, terminated: next.terminated, profile: next.profile };
}

export interface GetResultInput {
  assessmentId: string;
  user: CurrentUser;
  chain: ProviderChain;
  repo: AssessmentRepository;
}

export async function getResult(input: GetResultInput): Promise<AssessmentReport> {
  const row = await input.repo.getAssessment(input.assessmentId);
  if (!row) throw new Error("Assessment not found.");
  assertOwnership({ student_id: row.student_id }, input.user);

  const evidence = await input.repo.listEvidence(row.id);
  const profile = await computeProfile(row, evidence);

  const demonstrated: string[] = [];
  const uncertain: string[] = [];
  for (const dim of Object.values(profile.dimensions)) {
    if (dim.status === "strong" || dim.status === "demonstrated") {
      demonstrated.push(`${dim.dimension.replace(/_/g, " ")}`);
    } else if (dim.status === "gap_identified" || dim.status === "developing" || dim.status === "insufficient_evidence") {
      uncertain.push(`${dim.dimension.replace(/_/g, " ")}`);
    }
  }

  const recommendations = await generateRecommendationsForProfile(profile.dimensions, input.chain);

  if (row.status === "completed") {
    await input.repo.saveHistorySnapshot(profile);
  }

  return { profile, summary: { demonstrated, uncertain }, evidence, recommendations };
}

export interface GetHistoryInput {
  studentId: string;
  challengeId?: string;
  user: CurrentUser;
  repo: AssessmentRepository;
  limit?: number;
  offset?: number;
}

export async function getHistory(input: GetHistoryInput): Promise<UnderstandingProfile[]> {
  assertOwnership({ student_id: input.studentId }, input.user);
  return input.repo.listHistory(input.studentId, input.challengeId, input.limit ?? 20, input.offset ?? 0);
}
