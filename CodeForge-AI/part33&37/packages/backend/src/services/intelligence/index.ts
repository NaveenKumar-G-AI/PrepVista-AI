/**
 * Intelligence Engine - Core brain of PrepVista.
 * Orchestrates signal extraction, skill analysis, weakness detection, recommendations, and readiness calculation.
 */
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { aiService } from '../ai';
import { integrationService, eventDelivery, syncEngine } from '../services/integration';
import {
  ExplainableScore,
  DimensionScore,
  SkillNode,
  Weakness,
  Recommendation,
  ReadinessSnapshot,
  EvidenceConfidence,
  SCORE_DIMENSIONS,
  SCORE_WEIGHTS,
  AADEPT_MIN_EVIDENCE_COUNT,
  EventType,
} from '@prepvista/shared';

export class IntelligenceEngine {
  /* ============================================================
     PUBLIC API
     ============================================================ */

  /** Process a completed assessment end-to-end */
  async processAssessment(assessmentId: string): Promise<void> {
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        questions: true,
        student: { include: { user: true } },
      },
    });

    if (!assessment) {
      throw new Error(`Assessment ${assessmentId} not found`);
    }

    logger.info({ assessmentId }, 'Starting assessment processing');

    try {
      // 1. Compute explainable score
      const score = await this.computeExplainableScore(assessment);
      if (!score) {
        throw new Error('Scoring failed');
      }

      // 2. Extract skill evidence from answers
      await this.extractSkillEvidence(assessment, score);

      // 3. Analyze weaknesses
      const weaknesses = await this.analyzeWeaknesses(assessment.studentId);

      // 4. Generate recommendations
      const recommendations = await this.generateRecommendations(assessment.studentId, weaknesses);

      // 5. Calculate readiness snapshot
      await this.calculateAndStoreReadiness(assessment.studentId);

      // 6. Mark assessment complete
      await prisma.assessment.update({
        where: { id: assessmentId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          overallScore: score.overall,
          dimensionScores: score as any,
        },
      });

      logger.info({ assessmentId, overallScore: score.overall }, 'Assessment processing complete');

      // Trigger integration sync events for active integrations
      await this.triggerIntegrationEvents(assessment.studentId, 'technical.assessment.completed', {
        assessmentId,
        overallScore: score.overall,
      });
    } catch (error) {
      logger.error({ err: error, assessmentId }, 'Assessment processing failed');
      await prisma.assessment.update({
        where: { id: assessmentId },
        data: { status: 'FAILED' },
      });
      throw error;
    }
  }

  /**
   * Trigger integration events for student intelligence changes
   */
  private async triggerIntegrationEvents(
    studentId: string,
    eventType: EventType,
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      // Find all active integrations for this student's college
      const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { collegeId: true },
      });

      if (!student?.collegeId) return;

      const integrations = await prisma.integration.findMany({
        where: {
          collegeId: student.collegeId,
          status: 'ACTIVE',
        },
        include: {
          sharingPolicy: true,
          identityMappings: {
            where: {
              codeforgeStudentId: studentId,
              status: 'VERIFIED',
            },
          },
        },
      });

      for (const integration of integrations) {
        const identityMapping = integration.identityMappings[0];
        if (!identityMapping) continue;

        // Create integration event
        const event = await prisma.integrationEvent.create({
          data: {
            integrationId: integration.id,
            eventType,
            schemaVersion: 'v1',
            eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            source: 'CODEFORGE',
            occurredAt: new Date(),
            organizationRef: integration.collegeId,
            externalStudentRef: identityMapping.externalStudentId,
            dataVersion: '1.0',
            payload,
            idempotencyKey: `${integration.id}_${studentId}_${eventType}_${Date.now()}`,
            status: 'QUEUED',
          },
        });

        // Queue for delivery
        await eventDelivery.deliverEvent(event.eventId).catch(err => {
          logger.error({ err, eventId: event.eventId }, 'Event delivery failed');
        });
      }
    } catch (error) {
      // Log but don't fail the main operation
      logger.error({ err: error, studentId, eventType }, 'Failed to trigger integration events');
    }
  }

  /** Get current readiness snapshot for a student */
  async getReadinessSnapshot(studentId: string): Promise<ReadinessSnapshot> {
    const latest = await prisma.progressSnapshot.findFirst({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
    });

    if (!latest) {
      return this.getEmptyReadiness(studentId);
    }

    const student = await prisma.student.findUnique({ where: { id: studentId } });
    const assessmentsCompleted = await prisma.assessment.count({
      where: { studentId, status: 'COMPLETED' },
    });

    return {
      studentId,
      overallReadiness: latest.overallReadiness,
      dimensionScores: latest.dimensionScores as DimensionScore[],
      topWeaknesses: latest.topWeaknesses as Weakness[],
      recommendedActions: latest.recommendedActions as Recommendation[],
      evidenceConfidence: latest.evidenceConfidence,
      assessmentsCompleted,
      lastAssessmentDate: latest.lastAssessmentDate?.toISOString() || null,
      trendDirection: latest.trendDirection,
    };
  }

  /** Get skill graph with proficiency levels */
  async getSkillGraph(studentId: string): Promise<SkillNode[]> {
    // Get all skills
    const allSkills = await prisma.skill.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    // Get student's evidence
    const evidence = await prisma.skillEvidence.findMany({
      where: { studentId },
      include: { skill: true },
    });

    // Aggregate evidence per skill
    const evidenceBySkill = new Map<string, typeof evidence>();
    evidence.forEach(e => {
      const arr = evidenceBySkill.get(e.skillId) || [];
      arr.push(e);
      evidenceBySkill.set(e.skillId, arr);
    });

    // Compute proficiency for each skill
    const skillNodes: SkillNode[] = allSkills.map(skill => {
      const skillEvidence = evidenceBySkill.get(skill.id) || [];
      const { proficiency, confidence, evidenceCount } = this.computeProficiency(skillEvidence);

      return {
        id: skill.id,
        name: skill.name,
        parentId: skill.parentId,
        category: skill.category,
        proficiency,
        confidence,
        evidenceCount,
      };
    });

    // Build hierarchy
    return this.buildSkillHierarchy(skillNodes);
  }

  /** Get weaknesses for a student */
  async getWeaknesses(studentId: string): Promise<Weakness[]> {
    return this.analyzeWeaknesses(studentId);
  }

  /** Generate recommendations for a student */
  async generateRecommendationsForStudent(studentId: string): Promise<Recommendation[]> {
    const weaknesses = await this.analyzeWeaknesses(studentId);
    return this.generateRecommendations(studentId, weaknesses);
  }

  /* ============================================================
     SCORING
     ============================================================ */

  private async computeExplainableScore(assessment: any): Promise<ExplainableScore | null> {
    const questionsWithAnswers = assessment.questions.filter((q: any) => q.answer);

    if (questionsWithAnswers.length === 0) return null;

    // Prepare input for AI scoring
    const input = {
      assessmentId: assessment.id,
      type: assessment.type,
      questions: questionsWithAnswers.map((q: any) => ({
        category: q.category,
        difficulty: q.difficulty,
        score: q.score,
        answer: q.answer,
        feedback: q.feedback,
        expectedSkills: q.expectedSkills,
      })),
      targetRole: assessment.targetRole,
    };

    const score = await aiService.computeScore(input);

    if (!score) {
      // Fallback: compute basic score from question scores
      return this.fallbackScore(questionsWithAnswers);
    }

    return score;
  }

  private fallbackScore(questions: any[]): ExplainableScore {
    const avgScore = questions.reduce((sum, q) => sum + (q.score || 0), 0) / questions.length;

    // Distribute across dimensions based on question categories
    const dimensionScores: DimensionScore[] = SCORE_DIMENSIONS.map(dim => ({
      dimension: dim,
      score: Math.round(avgScore),
      evidence: [`Based on ${questions.length} answered questions`],
    }));

    return {
      overall: Math.round(avgScore),
      dimensions: dimensionScores,
      summary: `Overall performance based on ${questions.length} questions. Automated fallback scoring used.`,
      confidence: 'LOW',
      improvementAreas: ['Complete more assessments for accurate scoring'],
    };
  }

  /* ============================================================
     SIGNAL EXTRACTION & EVIDENCE
     ============================================================ */

  private async extractSkillEvidence(assessment: any, score: ExplainableScore): Promise<void> {
    const studentId = assessment.studentId;

    // Extract signals from each question
    for (const question of assessment.questions) {
      if (!question.answer || question.score === null) continue;

      for (const skillName of question.expectedSkills) {
        const skill = await prisma.skill.findFirst({
          where: { name: skillName, isActive: true },
        });

        if (!skill) continue;

        // Determine signal direction and strength
        const normalizedScore = (question.score || 0) / 100; // 0-1
        const signalStrength = (normalizedScore - 0.5) * 2; // -1 to 1

        let signal: string;
        let confidence: EvidenceConfidence = 'LOW';

        if (normalizedScore >= 0.8) {
          signal = `Strong performance in ${skillName}: "${question.answer.slice(0, 100)}..."`;
          confidence = 'HIGH';
        } else if (normalizedScore >= 0.6) {
          signal = `Adequate performance in ${skillName}: "${question.answer.slice(0, 100)}..."`;
          confidence = 'MEDIUM';
        } else if (normalizedScore >= 0.4) {
          signal = `Partial understanding of ${skillName}: "${question.answer.slice(0, 100)}..."`;
          confidence = 'MEDIUM';
        } else {
          signal = `Weakness in ${skillName}: "${question.answer.slice(0, 100)}..."`;
          confidence = 'HIGH';
        }

        await prisma.skillEvidence.create({
          data: {
            studentId,
            skillId: skill.id,
            assessmentId: assessment.id,
            source: 'AI_ASSESSMENT',
            signal,
            score: signalStrength,
            confidence,
            weight: this.getDifficultyWeight(question.difficulty),
            metadata: {
              questionId: question.id,
              category: question.category,
              difficulty: question.difficulty,
              questionScore: question.score,
            },
          },
        });
      }
    }

    // Also create evidence from dimension scores
    for (const dim of score.dimensions) {
      const categorySkill = await prisma.skill.findFirst({
        where: { category: dim.dimension, parentId: null, isActive: true },
      });

      if (categorySkill) {
        const normalizedScore = dim.score / 100;
        const signalStrength = (normalizedScore - 0.5) * 2;

        await prisma.skillEvidence.create({
          data: {
            studentId,
            skillId: categorySkill.id,
            assessmentId: assessment.id,
            source: 'AI_ASSESSMENT',
            signal: `${dim.dimension} dimension: ${dim.evidence.join('; ')}`,
            score: signalStrength,
            confidence: score.confidence,
            weight: 1.5,
            metadata: { dimension: dim.dimension, dimensionScore: dim.score },
          },
        });
      }
    }

    // Trigger integration sync events for skill updates
    await this.triggerIntegrationEvents(studentId, 'technical.skill.updated', {
      skillsUpdated: true,
      assessmentId,
    });
  }

  private getDifficultyWeight(difficulty: string): number {
    switch (difficulty) {
      case 'EASY': return 0.5;
      case 'MEDIUM': return 1.0;
      case 'HARD': return 1.5;
      case 'EXPERT': return 2.0;
      default: return 1.0;
    }
  }

  private computeProficiency(evidence: any[]): { proficiency: number | null; confidence: EvidenceConfidence; evidenceCount: number } {
    if (evidence.length === 0) {
      return { proficiency: null, confidence: 'INSUFFICIENT', evidenceCount: 0 };
    }

    if (evidence.length < AADEPT_MIN_EVIDENCE_COUNT) {
      return { proficiency: null, confidence: 'INSUFFICIENT', evidenceCount: evidence.length };
    }

    // Weighted average of scores
    let weightedSum = 0;
    let totalWeight = 0;
    let highConfidenceCount = 0;

    for (const e of evidence) {
      const weight = e.weight * this.confidenceWeight(e.confidence);
      weightedSum += e.score * weight;
      totalWeight += weight;
      if (e.confidence === 'HIGH' || e.confidence === 'MEDIUM') highConfidenceCount++;
    }

    const avgScore = weightedSum / totalWeight; // -1 to 1
    const proficiency = Math.round((avgScore + 1) * 50); // 0-100

    let confidence: EvidenceConfidence = 'LOW';
    if (highConfidenceCount >= 3) confidence = 'HIGH';
    else if (highConfidenceCount >= 1) confidence = 'MEDIUM';

    return { proficiency, confidence, evidenceCount: evidence.length };
  }

  private confidenceWeight(confidence: EvidenceConfidence): number {
    switch (confidence) {
      case 'HIGH': return 1.5;
      case 'MEDIUM': return 1.0;
      case 'LOW': return 0.5;
      case 'INSUFFICIENT': return 0.1;
    }
  }

  /* ============================================================
     WEAKNESS ANALYSIS
     ============================================================ */

  private async analyzeWeaknesses(studentId: string): Promise<Weakness[]> {
    // Get all evidence for student
    const evidence = await prisma.skillEvidence.findMany({
      where: { studentId },
      include: { skill: true },
      orderBy: { createdAt: 'desc' },
    });

    // Group by skill
    const bySkill = new Map<string, typeof evidence>();
    evidence.forEach(e => {
      const arr = bySkill.get(e.skillId) || [];
      arr.push(e);
      bySkill.set(e.skillId, arr);
    });

    const weaknesses: Weakness[] = [];

    for (const [skillId, skillEvidence] of bySkill) {
      const skill = skillEvidence[0].skill;
      const { proficiency, confidence, evidenceCount } = this.computeProficiency(skillEvidence);

      // Only consider weaknesses with sufficient evidence
      if (evidenceCount < AADEPT_MIN_EVIDENCE_COUNT || confidence === 'INSUFFICIENT') continue;
      if (proficiency === null || proficiency >= 60) continue; // Not a weakness

      // Determine severity
      let severity: Weakness['severity'] = 'MILD';
      if (proficiency < 30) severity = 'CRITICAL';
      else if (proficiency < 45) severity = 'MODERATE';

      // Determine trend
      const trend = this.calculateTrend(skillEvidence);

      // Collect evidence quotes
      const evidenceQuotes = skillEvidence
        .filter(e => e.score < 0)
        .slice(0, 5)
        .map(e => e.signal);

      weaknesses.push({
        skillId,
        skillName: skill.name,
        category: skill.category,
        severity,
        confidence,
        evidence: evidenceQuotes,
        trend,
      });
    }

    // Sort by severity and confidence
    weaknesses.sort((a, b) => {
      const severityOrder = { CRITICAL: 3, MODERATE: 2, MILD: 1 };
      const confOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      const sevDiff = severityOrder[b.severity] - severityOrder[a.severity];
      if (sevDiff !== 0) return sevDiff;
      return confOrder[b.confidence] - confOrder[a.confidence];
    });

    return weaknesses.slice(0, 10); // Top 10 weaknesses
  }

  private calculateTrend(evidence: any[]): Weakness['trend'] {
    if (evidence.length < 4) return 'UNKNOWN';

    // Split into older and newer halves
    const sorted = [...evidence].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const mid = Math.floor(sorted.length / 2);
    const older = sorted.slice(0, mid);
    const newer = sorted.slice(mid);

    const olderAvg = older.reduce((sum, e) => sum + e.score, 0) / older.length;
    const newerAvg = newer.reduce((sum, e) => sum + e.score, 0) / newer.length;

    const diff = newerAvg - olderAvg;
    if (diff > 0.15) return 'IMPROVING';
    if (diff < -0.15) return 'DECLINING';
    return 'STABLE';
  }

  /* ============================================================
     RECOMMENDATION GENERATION
     ============================================================ */

  private async generateRecommendations(studentId: string, weaknesses: Weakness[]): Promise<Recommendation[]> {
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) return [];

    // Get skill graph for context
    const skillGraph = await this.getSkillGraph(studentId);

    // Get completed recommendations to avoid duplicates
    const completedRecs = await prisma.recommendation.findMany({
      where: { studentId, status: 'COMPLETED' },
      select: { type: true, targetSkillId: true },
      take: 50,
    });

    const completedTypes = new Set(completedRecs.map(r => `${r.type}:${r.targetSkillId || ''}`));

    // Prepare input for AI
    const input = {
      studentId,
      readiness: (await this.getReadinessSnapshot(studentId)).overallReadiness,
      weaknesses,
      skillGraph: skillGraph.filter(s => s.proficiency !== null).slice(0, 30),
      completedRecommendations: Array.from(completedTypes),
    };

    const recommendations = await aiService.generateRecommendations(input);

    // Store recommendations
    const stored: Recommendation[] = [];
    for (const rec of recommendations) {
      const existing = await prisma.recommendation.findFirst({
        where: {
          studentId,
          type: rec.type,
          targetSkillId: rec.targetSkillId,
          status: { in: ['PENDING', 'IN_PROGRESS'] },
        },
      });

      if (existing) continue;

      const created = await prisma.recommendation.create({
        data: {
          studentId,
          type: rec.type,
          title: rec.title,
          description: rec.description,
          reason: rec.reason,
          priority: rec.priority,
          targetSkillId: rec.targetSkillId,
          metadata: rec.metadata,
        },
      });

      stored.push({
        id: created.id,
        type: created.type,
        title: created.title,
        description: created.description,
        reason: created.reason,
        priority: created.priority,
        targetSkillId: created.targetSkillId,
        metadata: created.metadata as Record<string, unknown> | undefined,
      });
    }

    return stored;
  }

  /* ============================================================
     READINESS CALCULATION
     ============================================================ */

  private async calculateAndStoreReadiness(studentId: string): Promise<void> {
    const readiness = await this.getReadinessSnapshot(studentId);
    const weaknesses = await this.analyzeWeaknesses(studentId);
    const skillGraph = await this.getSkillGraph(studentId);

    // Get recent assessments for AI context
    const recentAssessments = await prisma.assessment.findMany({
      where: { studentId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      take: 10,
      select: {
        type: true,
        overallScore: true,
        dimensionScores: true,
        completedAt: true,
      },
    });

    const input = {
      studentId,
      dimensionScores: readiness.dimensionScores,
      weaknesses,
      history: recentAssessments.map(a => ({
        type: a.type,
        overallScore: a.overallScore,
        dimensionScores: a.dimensionScores,
        date: a.completedAt?.toISOString(),
      })),
    };

    const calculated = await aiService.calculateReadiness(input);

    if (!calculated) {
      // Fallback calculation
      await this.fallbackReadinessCalculation(studentId, readiness, weaknesses);
      return;
    }

    // Determine evidence confidence
    const totalEvidence = await prisma.skillEvidence.count({ where: { studentId } });
    const highConfEvidence = await prisma.skillEvidence.count({
      where: { studentId, confidence: { in: ['HIGH', 'MEDIUM'] } },
    });
    let evidenceConfidence: EvidenceConfidence = 'INSUFFICIENT';
    if (totalEvidence >= 10 && highConfEvidence >= 5) evidenceConfidence = 'HIGH';
    else if (totalEvidence >= 5 && highConfEvidence >= 2) evidenceConfidence = 'MEDIUM';
    else if (totalEvidence >= 2) evidenceConfidence = 'LOW';

    await prisma.progressSnapshot.create({
      data: {
        studentId,
        overallReadiness: calculated.overallReadiness,
        dimensionScores: readiness.dimensionScores as any,
        topWeaknesses: calculated.topWeaknesses as any,
        recommendedActions: calculated.recommendedActions as any,
        evidenceConfidence,
        assessmentsCompleted: readiness.assessmentsCompleted,
        lastAssessmentDate: readiness.lastAssessmentDate ? new Date(readiness.lastAssessmentDate) : null,
        trendDirection: calculated.trendDirection,
      },
    });
  }

  private async fallbackReadinessCalculation(
    studentId: string,
    readiness: ReadinessSnapshot,
    weaknesses: Weakness[]
  ): Promise<void> {
    // Simple weighted average of dimension scores
    let overall = 0;
    let totalWeight = 0;
    for (const dim of readiness.dimensionScores) {
      const weight = SCORE_WEIGHTS[dim.dimension];
      overall += dim.score * weight;
      totalWeight += weight;
    }
    overall = totalWeight > 0 ? Math.round(overall / totalWeight) : 0;

    // Determine trend from history
    const history = await prisma.progressSnapshot.findMany({
      where: { studentId },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });

    let trendDirection: ReadinessSnapshot['trendDirection'] = 'INSUFFICIENT_DATA';
    if (history.length >= 3) {
      const recent = history.slice(-3);
      const first = recent[0].overallReadiness;
      const last = recent[recent.length - 1].overallReadiness;
      const diff = last - first;
      if (diff > 5) trendDirection = 'IMPROVING';
      else if (diff < -5) trendDirection = 'DECLINING';
      else trendDirection = 'STABLE';
    }

    const totalEvidence = await prisma.skillEvidence.count({ where: { studentId } });
    let evidenceConfidence: EvidenceConfidence = 'INSUFFICIENT';
    if (totalEvidence >= 10) evidenceConfidence = 'HIGH';
    else if (totalEvidence >= 5) evidenceConfidence = 'MEDIUM';
    else if (totalEvidence >= 2) evidenceConfidence = 'LOW';

    await prisma.progressSnapshot.create({
      data: {
        studentId,
        overallReadiness: overall,
        dimensionScores: readiness.dimensionScores as any,
        topWeaknesses: weaknesses.slice(0, 5) as any,
        recommendedActions: [] as any,
        evidenceConfidence,
        assessmentsCompleted: readiness.assessmentsCompleted,
        lastAssessmentDate: readiness.lastAssessmentDate ? new Date(readiness.lastAssessmentDate) : null,
        trendDirection,
      },
    });

    // Trigger integration sync events for readiness update
    await this.triggerIntegrationEvents(studentId, 'technical.readiness.updated', {
      overallReadiness: overall,
      evidenceConfidence,
      trendDirection,
    });
  }

  /* ============================================================
     UTILITIES
     ============================================================ */

  private buildSkillHierarchy(nodes: SkillNode[]): SkillNode[] {
    const nodeMap = new Map(nodes.map(n => [n.id, { ...n, children: [] as SkillNode[] }]));
    const roots: SkillNode[] = [];

    nodes.forEach(node => {
      const n = nodeMap.get(node.id)!;
      if (node.parentId) {
        const parent = nodeMap.get(node.parentId);
        if (parent) parent.children.push(n);
      } else {
        roots.push(n);
      }
    });

    return roots;
  }

  private getEmptyReadiness(studentId: string): ReadinessSnapshot {
    return {
      studentId,
      overallReadiness: 0,
      dimensionScores: SCORE_DIMENSIONS.map(d => ({ dimension: d, score: 0, evidence: ['No assessments completed'] })),
      topWeaknesses: [],
      recommendedActions: [{
        id: 'first-assessment',
        type: 'FOCUSED_INTERVIEW',
        title: 'Take Your First Assessment',
        description: 'Complete an initial interview assessment to establish your baseline readiness.',
        reason: 'No assessment data available yet',
        priority: 10,
      }],
      evidenceConfidence: 'INSUFFICIENT',
      assessmentsCompleted: 0,
      lastAssessmentDate: null,
      trendDirection: 'INSUFFICIENT_DATA',
    };
  }
}

export const intelligenceEngine = new IntelligenceEngine();