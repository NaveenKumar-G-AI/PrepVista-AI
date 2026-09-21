import type { SupabaseClient } from '@supabase/supabase-js';
import type { SkillEvidence, EvidenceSource, EvidenceQuality, EvidenceOutcome, TransferContext } from '../types/evidence.js';
import type { SkillState, GrowthSnapshot, SkillStateLabel, ConfidenceLevel, TrajectoryLabel, RetentionState, TransferState, RegressionSeverity } from '../types/skill-state.js';
import type { GrowthEvent, GrowthEventType } from '../types/growth-event.js';
import type { GrowthMilestone, MilestoneId } from '../types/milestone.js';
import type { GrowthInsight } from '../types/insight.js';
import type { GrowthRepository } from './growth-repository.js';
import { milestoneKey } from '../milestones/milestone-engine.js';
import { logger } from '../observability/logger.js';

/**
 * Postgres/Supabase implementation of GrowthRepository, matching
 * db/migrations/0001_growth_schema.sql column-for-column.
 *
 * IMPORTANT — this file has NOT been executed against a live database in
 * this build. There is no Supabase project connected here (no URL, no
 * service-role key — see .env.example), and this sandbox's network
 * allowlist doesn't reach a Supabase host anyway. The query shapes below
 * are correct against the migration in this package, but you should run
 * the migration against your actual project and exercise this file with
 * real credentials before trusting it in production. Everything in
 * src/orchestration and above is already fully verified against
 * InMemoryGrowthRepository (see src/__tests__/golden-scenario.integration.test.ts),
 * which implements the exact same interface — swapping repositories is
 * the only step left.
 */
export class SupabaseGrowthRepository implements GrowthRepository {
  constructor(private readonly client: SupabaseClient) {}

  async appendEvidence(evidence: SkillEvidence): Promise<{ inserted: boolean; existing: SkillEvidence | null }> {
    const row = evidenceToRow(evidence);
    const { error } = await this.client.from('skill_evidence').insert(row);

    if (error) {
      // 23505 = unique_violation on (source, source_record_id, skill_id) — idempotent re-ingestion, not a failure (section 57).
      if (error.code === '23505') {
        const { data, error: fetchError } = await this.client
          .from('skill_evidence')
          .select('*')
          .eq('source', evidence.source)
          .eq('source_record_id', evidence.sourceRecordId)
          .eq('skill_id', evidence.skillId)
          .maybeSingle();
        if (fetchError) throw fetchError;
        return { inserted: false, existing: data ? rowToEvidence(data) : null };
      }
      logger.error('appendEvidence failed', { error: error.message });
      throw error;
    }

    return { inserted: true, existing: null };
  }

  async getEvidenceForSkill(studentId: string, skillId: string): Promise<SkillEvidence[]> {
    const { data, error } = await this.client.from('skill_evidence').select('*').eq('student_id', studentId).eq('skill_id', skillId).order('timestamp', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToEvidence);
  }

  async getEvidenceForStudent(studentId: string): Promise<SkillEvidence[]> {
    const { data, error } = await this.client.from('skill_evidence').select('*').eq('student_id', studentId).order('timestamp', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToEvidence);
  }

  async appendSkillStateSnapshot(state: SkillState): Promise<void> {
    const { error } = await this.client.from('skill_snapshots').insert(skillStateToRow(state));
    if (error) throw error;
  }

  async getLatestSkillState(studentId: string, skillId: string): Promise<SkillState | null> {
    const { data, error } = await this.client
      .from('skill_snapshots')
      .select('*')
      .eq('student_id', studentId)
      .eq('skill_id', skillId)
      .order('computed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToSkillState(data) : null;
  }

  async getAllLatestSkillStates(studentId: string): Promise<SkillState[]> {
    // Latest-per-skill via a Postgres DISTINCT ON would be ideal here; that
    // requires an RPC/view (see db/migrations/0001_growth_schema.sql,
    // `latest_skill_snapshots` view) rather than the JS client's query
    // builder, which cannot express DISTINCT ON directly.
    const { data, error } = await this.client.from('latest_skill_snapshots').select('*').eq('student_id', studentId);
    if (error) throw error;
    return (data ?? []).map(rowToSkillState);
  }

  async getSkillStateHistory(studentId: string, skillId: string): Promise<SkillState[]> {
    const { data, error } = await this.client.from('skill_snapshots').select('*').eq('student_id', studentId).eq('skill_id', skillId).order('computed_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToSkillState);
  }

  async appendGrowthEvent(event: GrowthEvent): Promise<void> {
    const { error } = await this.client.from('growth_events').insert(growthEventToRow(event));
    if (error) throw error;
  }

  async getGrowthEvents(studentId: string, options?: { skillId?: string; since?: string }): Promise<GrowthEvent[]> {
    let query = this.client.from('growth_events').select('*').eq('student_id', studentId).order('timestamp', { ascending: true });
    if (options?.skillId) query = query.eq('skill_id', options.skillId);
    if (options?.since) query = query.gte('timestamp', options.since);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(rowToGrowthEvent);
  }

  async appendMilestone(milestone: GrowthMilestone): Promise<void> {
    const { error } = await this.client.from('growth_milestones').insert(milestoneToRow(milestone));
    if (error && error.code !== '23505') throw error; // 23505 = already awarded, treated as a no-op (idempotent)
  }

  async getMilestones(studentId: string): Promise<GrowthMilestone[]> {
    const { data, error } = await this.client.from('growth_milestones').select('*').eq('student_id', studentId).order('timestamp', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToMilestone);
  }

  async getAwardedMilestoneKeys(studentId: string): Promise<Set<string>> {
    const milestones = await this.getMilestones(studentId);
    return new Set(milestones.map((m) => milestoneKey(m.definitionId as MilestoneId, m.skillId)));
  }

  async appendGrowthSnapshot(snapshot: GrowthSnapshot): Promise<void> {
    const { error } = await this.client.from('growth_snapshots').insert(growthSnapshotToRow(snapshot));
    if (error) throw error;
  }

  async getLatestGrowthSnapshot(studentId: string): Promise<GrowthSnapshot | null> {
    const { data, error } = await this.client.from('growth_snapshots').select('*').eq('student_id', studentId).order('timestamp', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? rowToGrowthSnapshot(data) : null;
  }

  async appendInsight(studentId: string, insight: GrowthInsight): Promise<void> {
    const { error } = await this.client.from('growth_insights').insert(insightToRow(studentId, insight));
    if (error) throw error;
  }

  async getRecentInsights(studentId: string, limit = 10): Promise<GrowthInsight[]> {
    const { data, error } = await this.client.from('growth_insights').select('*').eq('student_id', studentId).order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).map(rowToInsight);
  }
}

// --- row <-> domain-object mapping -----------------------------------------
// Kept in one place, at the bottom of the file that owns the schema, so a
// migration change and its mapping update never drift apart silently.

function evidenceToRow(e: SkillEvidence) {
  return {
    evidence_id: e.evidenceId,
    student_id: e.studentId,
    source: e.source,
    source_record_id: e.sourceRecordId,
    skill_id: e.skillId,
    evidence_type: e.evidenceType,
    outcome: e.outcome,
    strength: e.strength,
    confidence: e.confidence,
    timestamp: e.timestamp,
    challenge_context: e.challengeContext ?? null,
    role_context: e.roleContext ?? null,
    transfer_context: e.transferContext ?? null,
    metadata: e.metadata ?? null,
    evidence_model_version: e.evidenceModelVersion,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToEvidence(row: any): SkillEvidence {
  return {
    evidenceId: row.evidence_id,
    studentId: row.student_id,
    source: row.source as EvidenceSource,
    sourceRecordId: row.source_record_id,
    skillId: row.skill_id,
    evidenceType: row.evidence_type as EvidenceQuality,
    outcome: row.outcome as EvidenceOutcome,
    strength: row.strength,
    confidence: row.confidence,
    timestamp: row.timestamp,
    challengeContext: row.challenge_context ?? undefined,
    roleContext: row.role_context ?? undefined,
    transferContext: (row.transfer_context as TransferContext) ?? undefined,
    metadata: row.metadata ?? undefined,
    evidenceModelVersion: row.evidence_model_version,
  };
}

function skillStateToRow(s: SkillState) {
  return {
    student_id: s.studentId,
    skill_id: s.skillId,
    state: s.state,
    performance_score: s.performanceScore,
    confidence_level: s.confidence.level,
    confidence_score: s.confidence.score,
    confidence_evidence_count: s.confidence.evidenceCount,
    confidence_distinct_sources: s.confidence.distinctSources,
    trajectory: s.trajectory,
    retention: s.retention,
    transfer: s.transfer,
    regression_severity: s.regressionSeverity,
    first_demonstrated: s.firstDemonstrated,
    last_demonstrated: s.lastDemonstrated,
    last_strong_evidence: s.lastStrongEvidence,
    evidence_refs: s.evidenceRefs,
    evidence_count: s.evidenceCount,
    growth_model_version: s.growthModelVersion,
    rules_version: s.rulesVersion,
    computed_at: s.computedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSkillState(row: any): SkillState {
  return {
    studentId: row.student_id,
    skillId: row.skill_id,
    state: row.state as SkillStateLabel,
    performanceScore: row.performance_score,
    confidence: {
      level: row.confidence_level as ConfidenceLevel,
      score: row.confidence_score,
      evidenceCount: row.confidence_evidence_count,
      distinctSources: row.confidence_distinct_sources,
    },
    trajectory: row.trajectory as TrajectoryLabel,
    retention: row.retention as RetentionState,
    transfer: row.transfer as TransferState,
    regressionSeverity: (row.regression_severity as RegressionSeverity) ?? null,
    firstDemonstrated: row.first_demonstrated,
    lastDemonstrated: row.last_demonstrated,
    lastStrongEvidence: row.last_strong_evidence,
    evidenceRefs: row.evidence_refs ?? [],
    evidenceCount: row.evidence_count,
    growthModelVersion: row.growth_model_version,
    rulesVersion: row.rules_version,
    computedAt: row.computed_at,
  };
}

function growthEventToRow(e: GrowthEvent) {
  return {
    event_id: e.eventId,
    student_id: e.studentId,
    skill_id: e.skillId,
    event_type: e.eventType,
    timestamp: e.timestamp,
    evidence_refs: e.evidenceRefs,
    confidence: e.confidence,
    previous_state: e.previousState,
    new_state: e.newState,
    explanation: e.explanation,
    model_version: e.modelVersion,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToGrowthEvent(row: any): GrowthEvent {
  return {
    eventId: row.event_id,
    studentId: row.student_id,
    skillId: row.skill_id,
    eventType: row.event_type as GrowthEventType,
    timestamp: row.timestamp,
    evidenceRefs: row.evidence_refs ?? [],
    confidence: row.confidence as ConfidenceLevel,
    previousState: row.previous_state as SkillStateLabel | null,
    newState: row.new_state as SkillStateLabel | null,
    explanation: row.explanation,
    modelVersion: row.model_version,
  };
}

function milestoneToRow(m: GrowthMilestone) {
  return {
    milestone_id: m.milestoneId,
    definition_id: m.definitionId,
    student_id: m.studentId,
    skill_id: m.skillId,
    title: m.title,
    description: m.description,
    timestamp: m.timestamp,
    evidence_refs: m.evidenceRefs,
    confidence: m.confidence,
    definition_version: m.definitionVersion,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToMilestone(row: any): GrowthMilestone {
  return {
    milestoneId: row.milestone_id,
    definitionId: row.definition_id,
    studentId: row.student_id,
    skillId: row.skill_id,
    title: row.title,
    description: row.description,
    timestamp: row.timestamp,
    evidenceRefs: row.evidence_refs ?? [],
    confidence: row.confidence as ConfidenceLevel,
    definitionVersion: row.definition_version,
  };
}

function growthSnapshotToRow(s: GrowthSnapshot) {
  return {
    snapshot_id: s.snapshotId,
    student_id: s.studentId,
    timestamp: s.timestamp,
    skill_model_version: s.skillModelVersion,
    evidence_model_version: s.evidenceModelVersion,
    growth_model_version: s.growthModelVersion,
    skills: s.skills,
    role_context: s.roleContext ?? null,
    source_event: s.sourceEvent,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToGrowthSnapshot(row: any): GrowthSnapshot {
  return {
    snapshotId: row.snapshot_id,
    studentId: row.student_id,
    timestamp: row.timestamp,
    skillModelVersion: row.skill_model_version,
    evidenceModelVersion: row.evidence_model_version,
    growthModelVersion: row.growth_model_version,
    skills: row.skills ?? [],
    roleContext: row.role_context ?? undefined,
    sourceEvent: row.source_event,
  };
}

function insightToRow(studentId: string, i: GrowthInsight) {
  return {
    student_id: studentId,
    type: i.type,
    title: i.title,
    summary: i.summary,
    evidence_refs: i.evidenceRefs,
    skills: i.skills,
    confidence: i.confidence,
    time_window: i.timeWindow,
    generated_by: i.generatedBy,
    model_version: i.modelVersion,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToInsight(row: any): GrowthInsight {
  return {
    type: 'growth_insight',
    title: row.title,
    summary: row.summary,
    evidenceRefs: row.evidence_refs ?? [],
    skills: row.skills ?? [],
    confidence: row.confidence as ConfidenceLevel,
    timeWindow: row.time_window,
    generatedBy: row.generated_by,
    modelVersion: row.model_version,
  };
}
