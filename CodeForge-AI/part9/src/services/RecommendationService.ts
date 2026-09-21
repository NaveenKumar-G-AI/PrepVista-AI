import { diagnoseGap } from '../domain/gapDiagnosis.js';
import { explainRecommendation } from '../domain/recommendationExplanation.js';
import { rankRecommendations, type SkillCandidate } from '../domain/recommendationRanking.js';
import type { MasteryState } from '../domain/config.js';
import type { GapDiagnosis, NextActionType, Recommendation, SkillEvidence } from '../domain/types.js';
import { EvidenceRepository } from '../repositories/EvidenceRepository.js';
import { MasteryStateRepository } from '../repositories/MasteryStateRepository.js';
import { SkillGraphRepository } from '../repositories/SkillGraphRepository.js';
import { getPool } from '../repositories/db.js';
import type { AIProviderRouter } from '../ai/AIProviderRouter.js';
import { calculateMastery } from '../domain/masteryCalculation.js';

function actionForGapAndState(gap: GapDiagnosis, state: MasteryState): NextActionType {
  if (gap.category === 'PREREQUISITE_GAP') return 'REVIEW_PREREQUISITE';
  if (state === 'UNKNOWN' || state === 'EXPOSED') return 'LEARN_CONCEPT';
  if (state === 'LEARNING') return 'GUIDED_PRACTICE';
  if (state === 'STALE') return 'RETENTION_CHECK';
  if (state === 'DEVELOPING') {
    if (gap.category === 'DEBUGGING_GAP') return 'DEBUGGING_PRACTICE';
    return 'INDEPENDENT_PRACTICE';
  }
  if (state === 'FUNCTIONAL') return 'TRANSFER_PRACTICE';
  if (state === 'STRONG') return 'VERIFICATION';
  return 'INDEPENDENT_PRACTICE';
}

export class RecommendationService {
  constructor(
    private skillGraphRepo = new SkillGraphRepository(),
    private stateRepo = new MasteryStateRepository(),
    private evidenceRepo = new EvidenceRepository(),
    private aiRouter?: AIProviderRouter
  ) {}

  /**
   * PHASE 19/20/64: the central "what should this student do next" engine.
   * Returns one primary recommendation plus up to `secondaryCount` more —
   * never the full ranked list (PHASE 64: never overwhelm the student).
   */
  async getNextActions(studentId: string, roleKey: string, secondaryCount = 3): Promise<Recommendation[]> {
    const [requirements, relationships, currentStates, role] = await Promise.all([
      this.skillGraphRepo.listRoleRequirements(roleKey),
      this.skillGraphRepo.listRelationships(),
      this.stateRepo.listAllStatesForStudent(studentId),
      this.skillGraphRepo.getRoleByKey(roleKey),
    ]);
    const roleName = role?.name ?? roleKey;

    const candidates: (SkillCandidate & { gap: GapDiagnosis | null; mastery: Awaited<ReturnType<typeof calculateMastery>> })[] = [];

    for (const req of requirements) {
      const stored = currentStates.get(req.skillId);
      const currentState: MasteryState = stored?.masteryState ?? 'UNKNOWN';

      const evidence: SkillEvidence[] = await this.evidenceRepo.listForSkill(studentId, req.skillId);
      const mastery = calculateMastery(evidence);

      const prerequisites = await this.skillGraphRepo.listPrerequisiteStates(studentId, req.skillId);
      const recentFailures = evidence.filter((e) => !e.passed && e.independent).slice(-5);
      const gap = currentState !== 'MASTERED' && currentState !== 'STRONG' ? diagnoseGap(req.skillId, recentFailures, prerequisites, relationships) : null;

      const targetSkillId = gap?.category === 'PREREQUISITE_GAP' ? gap.targetSkillId : req.skillId;
      const blockingSkillId = gap?.category === 'PREREQUISITE_GAP' ? req.skillId : undefined;

      const pool = getPool();
      const { rows: overdueRows } = await pool.query(
        `select extract(day from now() - scheduled_for) as overdue_days from retention_schedule
         where student_id = $1 and skill_id = $2 and status = 'PENDING' and scheduled_for < now()`,
        [studentId, targetSkillId]
      );
      const retentionOverdueDays = overdueRows[0] ? Number(overdueRows[0].overdue_days) : 0;

      candidates.push({
        skillId: targetSkillId,
        roleImportance: req.importance,
        currentState,
        targetState: req.targetState,
        blockingSkillId,
        retentionOverdueDays,
        hasTransferEvidence: mastery.transferPassCount > 0,
        lastRecommendedDaysAgo: null, // wire to learning_recommendations.created_at when integrating
        suggestedAction: gap ? actionForGapAndState(gap, currentState) : 'RETENTION_CHECK',
        gap,
        mastery,
      });
    }

    const ranked = rankRecommendations(candidates);

    const idsNeedingNames = new Set<string>();
    for (const c of candidates) {
      idsNeedingNames.add(c.skillId);
      if (c.blockingSkillId) idsNeedingNames.add(c.blockingSkillId);
    }
    const skillNames = await this.skillGraphRepo.getSkillNamesByIds([...idsNeedingNames]);
    const humanize = (text: string): string => {
      let out = text;
      for (const [id, name] of skillNames) out = out.split(id).join(name);
      return out;
    };

    const withReasons = ranked.slice(0, 1 + secondaryCount).map((rec) => {
      const source = candidates.find((c) => c.skillId === rec.skillId);
      const explained = explainRecommendation(rec, source?.mastery ?? calculateMastery([]), source?.gap ?? null, roleName);
      return { ...explained, reasons: explained.reasons.map(humanize), expectedOutcome: humanize(explained.expectedOutcome) };
    });

    return withReasons;
  }

  /** Optional: ask the configured AI provider to smooth the prose of a reason list; falls back to the original text untouched. */
  async polishReasons(reasons: string[]): Promise<{ text: string; usedProvider: string }> {
    const deterministic = reasons.join(' ');
    if (!this.aiRouter) return { text: deterministic, usedProvider: 'deterministic-fallback' };
    const prompt = `Rewrite these bullet-point facts as 2-3 encouraging, plain-language sentences for a student. Do not invent any new facts, numbers, or claims beyond what is listed. Facts:\n- ${reasons.join('\n- ')}`;
    return this.aiRouter.generateText(prompt, { maxTokens: 200 });
  }
}
