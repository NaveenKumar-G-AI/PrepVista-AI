import { randomUUID } from 'node:crypto';
import type { DB } from '../db/client.js';
import { config } from '../config/index.js';
import { SkillGraphService } from '../skillgraph/skillGraphService.js';
import { MasteryStateService } from '../mastery/masteryStateService.js';
import { EvidenceService } from '../evidence/evidenceService.js';
import { detectGap, rankGapsBySeverity } from '../gaps/gapDetector.js';
import { PrerequisiteAnalyzer } from '../gaps/prerequisiteAnalyzer.js';
import { decideDifficulty } from '../difficulty/difficultyEngine.js';
import { CandidateRetrieval, ChallengeRepository } from './candidateRetrieval.js';
import { rankCandidates, type RankingContext } from './rankingEngine.js';
import { selectIntervention } from './interventionSelector.js';
import { shouldTargetRepetition } from './repetitionControl.js';
import { buildDeterministicExplanation, buildDeterministicObjective, polishObjectiveWithAI } from './objectiveExplanation.js';
import type { AIProvider } from '../ai/types.js';
import type { DifficultyLevel, GapAssessment, Language, Priority, Recommendation, Skill } from '../types.js';

interface RecommendationRow {
  id: string; student_id: string; challenge_id: string; skill_id: string; gap_type: string | null; intervention_type: string;
  learning_objective: string; reason: string; ranking_score: number; is_repetition: number; is_exploration: number;
  evidence_snapshot_json: string; status: string; created_at: string; accepted_at: string | null; completed_at: string | null;
}
function toRecommendation(r: RecommendationRow): Recommendation {
  return {
    id: r.id, studentId: r.student_id, challengeId: r.challenge_id, skillId: r.skill_id,
    gapType: r.gap_type as Recommendation['gapType'], interventionType: r.intervention_type as Recommendation['interventionType'],
    learningObjective: r.learning_objective, reason: r.reason, rankingScore: r.ranking_score,
    isRepetition: Boolean(r.is_repetition), isExploration: Boolean(r.is_exploration),
    evidenceSnapshot: JSON.parse(r.evidence_snapshot_json), status: r.status as Recommendation['status'],
    createdAt: r.created_at, acceptedAt: r.accepted_at, completedAt: r.completed_at,
  };
}

function scoreToDifficultyLevel(score: number): DifficultyLevel {
  if (score < 3.5) return 'EASY';
  if (score < 5.5) return 'MEDIUM';
  if (score < 7.5) return 'HARD';
  return 'ADVANCED';
}

interface StudentRow { id: string; email: string; display_name: string; target_role: string | null; goal: string; prep_deadline: string | null; daily_target_minutes: number | null; }

export class RecommendationService {
  private skillGraph: SkillGraphService;
  private masteryState: MasteryStateService;
  private evidenceService: EvidenceService;
  private prereqAnalyzer: PrerequisiteAnalyzer;
  private candidateRetrieval: CandidateRetrieval;
  private challengeRepo: ChallengeRepository;

  constructor(private db: DB, private ai: AIProvider) {
    this.skillGraph = new SkillGraphService(db);
    this.masteryState = new MasteryStateService(db);
    this.evidenceService = new EvidenceService(db);
    this.prereqAnalyzer = new PrerequisiteAnalyzer(db);
    this.candidateRetrieval = new CandidateRetrieval(db);
    this.challengeRepo = new ChallengeRepository(db);
  }

  private getStudent(studentId: string): StudentRow {
    const row = this.db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as unknown as StudentRow | undefined;
    if (!row) throw new Error(`Unknown student: ${studentId}`);
    return row;
  }

  private getRolePriority(roleId: string | null, skillId: string): Priority | null {
    if (!roleId) return null;
    const row = this.db
      .prepare('SELECT priority FROM role_skill_priority WHERE role_id = ? AND skill_id = ?')
      .get(roleId, skillId) as unknown as { priority: Priority } | undefined;
    return row?.priority ?? null;
  }

  /** identifyGaps() + checkPrerequisites(): builds one gap assessment per skill that has evidence, redirecting to the prerequisite chain when relevant. */
  private identifyGaps(studentId: string): { skill: Skill; gap: GapAssessment }[] {
    const states = this.masteryState.getAllStates(studentId);
    const out: { skill: Skill; gap: GapAssessment }[] = [];
    for (const state of states) {
      const skill = this.skillGraph.getSkill(state.skillId);
      if (!skill) continue;
      const prereqGap = this.prereqAnalyzer.analyze(studentId, skill.id);
      if (prereqGap) {
        // prereqGap.skillId is the PREREQUISITE itself (analyzer redirects it there) — target that,
        // not the skill we started from, or the recommendation would explain "strengthen the
        // prerequisite" while still handing back a challenge for the original skill.
        const prereqSkill = this.skillGraph.getSkill(prereqGap.skillId);
        if (prereqSkill) out.push({ skill: prereqSkill, gap: prereqGap });
        continue;
      }
      const evidence = this.evidenceService.getEvidenceForSkill(studentId, skill.id);
      const gap = detectGap(state, evidence);
      if (gap) out.push({ skill, gap });
    }
    // De-duplicate by skill id (a prerequisite can be redirected to from multiple dependents) keeping the highest-severity assessment.
    const bySkill = new Map<string, { skill: Skill; gap: GapAssessment }>();
    for (const item of out) {
      const existing = bySkill.get(item.skill.id);
      if (!existing || item.gap.severity > existing.gap.severity) bySkill.set(item.skill.id, item);
    }
    return rankGapsBySeverity([...bySkill.values()].map((o) => o.gap)).map((g) => [...bySkill.values()].find((o) => o.gap === g)!);
  }

  /** Skills relevant to the student's role/goal that have essentially no evidence yet — exploration candidates (Phase 21). */
  private explorationCandidates(studentId: string, roleId: string | null): Skill[] {
    const allSkills = this.skillGraph.getAllSkills().filter((s) => s.parentSkillId !== null); // exclude the root grouping node
    // Only skills that actually have at least one challenge are viable exploration targets — a
    // grouping skill like "Python" or "Data Structures" has no challenge tagged to it directly
    // (only its leaf children do) and would otherwise be picked with zero eligible candidates.
    const contentBearingSkillIds = new Set(this.challengeRepo.getAllActive().flatMap((c) => [c.primarySkillId, ...c.secondarySkillIds]));
    const withoutEvidence = allSkills.filter((s) => {
      if (!contentBearingSkillIds.has(s.id)) return false;
      const state = this.masteryState.getState(studentId, s.id);
      return !state || state.evidenceCount === 0;
    });
    if (!roleId) return withoutEvidence;
    const priorityRank: Record<Priority, number> = { VERY_HIGH: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };
    return [...withoutEvidence].sort((a, b) => (priorityRank[this.getRolePriority(roleId, b.id) ?? 'LOW'] - priorityRank[this.getRolePriority(roleId, a.id) ?? 'LOW']));
  }

  private recentEvidenceForSkill(studentId: string, skillId: string, n: number) {
    return this.evidenceService.getEvidenceForSkill(studentId, skillId).slice(-n);
  }

  private recentlyTargetedSkillIds(studentId: string, limit = 3): string[] {
    const rows = this.db
      .prepare('SELECT skill_id FROM recommendations WHERE student_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(studentId, limit) as unknown as { skill_id: string }[];
    return rows.map((r) => r.skill_id);
  }

  /**
   * The full pipeline (Phase 42): produces and PERSISTS one recommendation.
   * Language defaults to the student's most recently used language.
   */
  async generateRecommendation(studentId: string, language?: Language): Promise<Recommendation> {
    const student = this.getStudent(studentId);
    const lang: Language = language ?? this.mostRecentLanguage(studentId) ?? 'javascript';

    // 1. Spaced review has top priority.
    const due = this.masteryState.getDueReviews(studentId);
    // 2. Mastery verification: high score, not yet verified, enough evidence, but not already scheduled via due-review.
    const states = this.masteryState.getAllStates(studentId);
    const nearMastery = states.find((s) =>
      !s.masteryVerified && s.masteryScore >= config.mastery.stateScoreThresholds.ADVANCED &&
      s.evidenceCount >= config.mastery.stateGates.MASTERED.minEvidenceCount - 1 && !due.some((d) => d.skillId === s.skillId));

    // 3. Targeted repetition: same mistake recurring.
    let repetitionTarget: { skillId: string; challengeId: string; mistakeCategory: string } | null = null;
    for (const s of states) {
      const evidence = this.evidenceService.getEvidenceForSkill(studentId, s.skillId);
      const rep = shouldTargetRepetition(evidence);
      if (rep.target && rep.lastChallengeId) { repetitionTarget = { skillId: s.skillId, challengeId: rep.lastChallengeId, mistakeCategory: rep.mistakeCategory! }; break; }
    }

    // 4. Ordinary gap-driven picks.
    const gaps = this.identifyGaps(studentId);

    // 5. Exploration roll (Phase 20): even with real gaps available, sometimes deliberately probe an unknown skill.
    const explorationRoll = Math.random() < config.exploration.baseExplorationRate;

    let targetSkill: Skill;
    let gapType: GapAssessment['gapType'] | null = null;
    let gapSeverity = 0;
    let gapExplanation: string | null = null;
    let isExplorationPick = false;
    let isDueReview = false;
    let nearMasteryPick = false;
    let deliberateRepetitionChallengeId: string | null = null;

    if (due.length > 0) {
      targetSkill = this.skillGraph.getSkill(due[0].skillId)!;
      isDueReview = true;
    } else if (nearMastery) {
      targetSkill = this.skillGraph.getSkill(nearMastery.skillId)!;
      nearMasteryPick = true;
    } else if (repetitionTarget) {
      targetSkill = this.skillGraph.getSkill(repetitionTarget.skillId)!;
      deliberateRepetitionChallengeId = repetitionTarget.challengeId;
      gapType = 'DEBUGGING_GAP';
      gapSeverity = 0.75;
      gapExplanation = `The same mistake pattern (${repetitionTarget.mistakeCategory.toLowerCase().replace(/_/g, ' ')}) has now shown up repeatedly on this skill.`;
    } else if ((explorationRoll || gaps.length === 0)) {
      const candidates = this.explorationCandidates(studentId, student.target_role);
      if (candidates.length > 0) {
        targetSkill = candidates[0];
        isExplorationPick = true;
        gapType = 'INSUFFICIENT_EVIDENCE';
        gapSeverity = 0.2;
      } else if (gaps.length > 0) {
        targetSkill = gaps[0].skill; gapType = gaps[0].gap.gapType; gapSeverity = gaps[0].gap.severity; gapExplanation = gaps[0].gap.explanation;
      } else {
        const anyContentBearingSkill = this.skillGraph.getAllSkills().find(
          (s) => s.parentSkillId !== null && this.challengeRepo.getAllActive().some((c) => c.primarySkillId === s.id || c.secondarySkillIds.includes(s.id)),
        );
        if (!anyContentBearingSkill) throw new Error('No content-bearing skills exist in the catalog at all — this is a genuine content-coverage failure, not a recoverable recommendation case.');
        targetSkill = anyContentBearingSkill;
        isExplorationPick = true; gapType = 'INSUFFICIENT_EVIDENCE'; gapSeverity = 0.2;
      }
    } else {
      targetSkill = gaps[0].skill; gapType = gaps[0].gap.gapType; gapSeverity = gaps[0].gap.severity; gapExplanation = gaps[0].gap.explanation;
    }

    const skillEvidence = this.evidenceService.getEvidenceForSkill(studentId, targetSkill.id);
    const skillState = this.masteryState.getState(studentId, targetSkill.id);

    // Difficulty decision.
    const currentLevel = skillEvidence.length > 0 ? scoreToDifficultyLevel(skillEvidence[skillEvidence.length - 1].difficultyScore) : 'EASY';
    const difficultyDecision = decideDifficulty(skillEvidence, currentLevel);

    const rolePriority = this.getRolePriority(student.target_role, targetSkill.id);
    const goalBoostsSkillGap = ['DSA_MASTERY', 'PLACEMENT_PREPARATION', 'ROLE_PREPARATION'].includes(student.goal);
    const goalIsInterviewPrep = student.goal === 'INTERVIEW_PREPARATION';

    const { type: interventionType, reason: interventionReason } = selectIntervention({
      gapType, masteryState: skillState?.masteryState ?? 'UNKNOWN', isDueForReview: isDueReview,
      isExplorationPick, isDeliberateRepetition: Boolean(deliberateRepetitionChallengeId),
      goalIsInterviewPrep, roleFlagsSkillAsPriority: rolePriority === 'HIGH' || rolePriority === 'VERY_HIGH',
      nearMasteryThreshold: nearMasteryPick,
    });

    // 6. Retrieve + 7. Rank candidates.
    const recentlyAttempted = this.candidateRetrieval.recentlyAttemptedChallengeIds(studentId);
    const contextType = gapType === 'TRANSFER_GAP' ? undefined : undefined; // don't over-filter; let ranking's mistakeRelevance prefer NOVEL instead of hard-filtering it out
    let candidates = this.candidateRetrieval.retrieve({
      skillId: targetSkill.id, language: lang,
      excludeChallengeIds: deliberateRepetitionChallengeId ? [] : undefined,
    });
    if (candidates.length === 0) {
      // fall back to any active challenge for the skill in any supported language
      candidates = this.candidateRetrieval.retrieve({ skillId: targetSkill.id });
    }

    const ctx: RankingContext = {
      targetSkillId: targetSkill.id, gapType, gapSeverity, targetDifficultyLevel: difficultyDecision.targetLevel,
      rolePriority, goalBoostsSkillGap, goalPrefersInterviewStyle: goalIsInterviewPrep,
      recentlyAttemptedChallengeIds: recentlyAttempted, deliberateRepetitionChallengeId,
      skillHasDueReview: isDueReview, isTransferTarget: gapType === 'TRANSFER_GAP',
      recentlyTargetedSkillIds: this.recentlyTargetedSkillIds(studentId),
    };
    const ranked = rankCandidates(candidates, ctx);
    if (ranked.length === 0) {
      throw new Error(`No eligible candidate challenges found for skill ${targetSkill.name} (language=${lang}). This is a genuine content-coverage gap — see CODEFORGE_FINAL_REPORT.md known limitations.`);
    }
    const top = ranked[0];

    // 8. Learning objective + explanation (deterministic, optional AI polish).
    const recentMistake = skillEvidence.length > 0 ? skillEvidence[skillEvidence.length - 1].mistakeCategory : null;
    const deterministicObjective = buildDeterministicObjective(targetSkill, gapType ? { skillId: targetSkill.id, gapType, severity: gapSeverity, explanation: '' } : null, recentMistake);
    const { text: learningObjective, aiUsed } = await polishObjectiveWithAI(deterministicObjective, this.ai);
    const explanation = buildDeterministicExplanation({
      skill: targetSkill, state: skillState, gap: gapType ? { skillId: targetSkill.id, gapType, severity: gapSeverity, explanation: gapExplanation ?? interventionReason } : null,
      interventionType, recentEvidence: this.recentEvidenceForSkill(studentId, targetSkill.id, config.mastery.repeatedMistakeWindow),
    });

    // 9. Persist (Phase 43) with a frozen evidence snapshot for traceability (Phase 44).
    const id = randomUUID();
    const evidenceSnapshot = {
      skillState, gapType, gapSeverity, difficultyDecision, interventionReason, aiPolishUsed: aiUsed,
      candidateCount: candidates.length, topScore: top.score, scoreBreakdown: top.breakdown,
      recentEvidence: skillEvidence.slice(-5).map((e) => ({ rawScore: e.rawScore, mistakeCategory: e.mistakeCategory, independent: e.independent, createdAt: e.createdAt, contextType: e.contextType })),
    };

    this.db
      .prepare(`
        INSERT INTO recommendations (id, student_id, challenge_id, skill_id, gap_type, intervention_type, learning_objective, reason, ranking_score, is_repetition, is_exploration, evidence_snapshot_json, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `)
      .run(id, studentId, top.challenge.id, targetSkill.id, gapType, interventionType, learningObjective, explanation, top.score, deliberateRepetitionChallengeId ? 1 : 0, isExplorationPick ? 1 : 0, JSON.stringify(evidenceSnapshot));

    const row = this.db.prepare('SELECT * FROM recommendations WHERE id = ?').get(id) as unknown as RecommendationRow;
    return toRecommendation(row);
  }

  private mostRecentLanguage(studentId: string): Language | null {
    const row = this.db.prepare('SELECT language FROM attempts WHERE student_id = ? ORDER BY submitted_at DESC LIMIT 1').get(studentId) as unknown as { language: Language } | undefined;
    return row?.language ?? null;
  }

  getPendingRecommendation(studentId: string): Recommendation | null {
    const row = this.db
      .prepare("SELECT * FROM recommendations WHERE student_id = ? AND status = 'PENDING' ORDER BY created_at DESC LIMIT 1")
      .get(studentId) as unknown as RecommendationRow | undefined;
    return row ? toRecommendation(row) : null;
  }

  getRecommendation(id: string): Recommendation | null {
    const row = this.db.prepare('SELECT * FROM recommendations WHERE id = ?').get(id) as unknown as RecommendationRow | undefined;
    return row ? toRecommendation(row) : null;
  }

  markAccepted(id: string): void {
    this.db.prepare("UPDATE recommendations SET status = 'ACCEPTED', accepted_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  }

  markCompleted(id: string): void {
    this.db.prepare("UPDATE recommendations SET status = 'COMPLETED', completed_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  }

  getHistory(studentId: string, limit = 50): Recommendation[] {
    const rows = this.db.prepare('SELECT * FROM recommendations WHERE student_id = ? ORDER BY created_at DESC LIMIT ?').all(studentId, limit) as unknown as RecommendationRow[];
    return rows.map(toRecommendation);
  }
}
