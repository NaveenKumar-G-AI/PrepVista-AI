/**
 * DecisionInsightService (§75-76, §104-111, §127, §203-208). Turns aggregate
 * stats into DecisionInsight rows. AI is used only to phrase an already-
 * computed finding (§191) — if it's unavailable, a neutral template message
 * is used instead (§110 "no shame language", §192 "AI FALLBACK").
 */
import type { AIGateway, AnalyticsPublisher } from '../ports';
import type { DecisionEventRepository, DecisionInsightRepository } from '../repositories/types';
import { detectBottlenecks, TEMPLATE_BOTTLENECK_MESSAGES } from '../domain/bottlenecks';
import type { DecisionInsight } from '../types';

export class DecisionInsightService {
  constructor(
    private readonly events: DecisionEventRepository,
    private readonly insights: DecisionInsightRepository,
    private readonly ai: AIGateway,
    private readonly analytics: AnalyticsPublisher
  ) {}

  async generateInsights(tenantId: string, studentId: string, sinceISO?: string): Promise<DecisionInsight[]> {
    const agg = await this.events.aggregateForStudent(tenantId, studentId, { since: sinceISO });
    const findings = detectBottlenecks(agg, agg.sampleSize);

    const created: DecisionInsight[] = [];
    for (const { bottleneck, confidence } of findings) {
      const message = await this.safeExplain(bottleneck, { ...agg });
      const insight = await this.insights.create({
        tenantId,
        studentId,
        insightType: bottleneck,
        message,
        evidence: { ...agg },
        confidence,
        sampleSize: agg.sampleSize,
        periodStart: agg.periodStart,
        periodEnd: agg.periodEnd,
      });
      created.push(insight);
      await this.analytics.publish('decision_insight_generated', { tenantId, studentId, insightType: bottleneck });
    }
    return created;
  }

  private async safeExplain(bottleneck: keyof typeof TEMPLATE_BOTTLENECK_MESSAGES, agg: Record<string, unknown>): Promise<string> {
    try {
      return await this.ai.summarizePatterns({ bottleneck, stats: agg });
    } catch {
      return TEMPLATE_BOTTLENECK_MESSAGES[bottleneck];
    }
  }
}
