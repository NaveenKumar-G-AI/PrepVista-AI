// In-sandbox demo/dev stand-ins for ACEAPT services this feature depends on
// but does not own (Forecast/Feature 27, Adapt/Feature 26, the Mastery/
// Retention/Transfer capability model, and the existing auth layer). None of
// these talk to a real ACEAPT system — see TRUTH_TABLE.md. Swap each for a
// real adapter that satisfies the matching interface in src/domain/ports.ts;
// nothing else in the codebase needs to change.

import type {
  ForecastServiceAdapter, ForecastSignal, AdaptInterventionAdapter, AdaptInterventionRequest,
  CapabilityServiceAdapter, RawAttemptRecord, NoveltyClassifierAdapter, AuthAdapter, AuthContext,
} from '../domain/ports.js';
import type { NoveltyLevel } from '../domain/types.js';

export class DemoForecastAdapter implements ForecastServiceAdapter {
  constructor(private readonly fixtures: Map<string, ForecastSignal>) {}
  async getForecast(studentId: string, targetId: string): Promise<ForecastSignal> {
    const key = `${studentId}|${targetId}`;
    return this.fixtures.get(key) ?? {
      studentId, targetId, readinessForecastPct: 0.7, targetPct: 0.8, mainUncertainty: null,
    };
  }
  setFixture(studentId: string, targetId: string, signal: ForecastSignal): void {
    this.fixtures.set(`${studentId}|${targetId}`, signal);
  }
}

export class DemoAdaptAdapter implements AdaptInterventionAdapter {
  public received: AdaptInterventionRequest[] = [];
  async sendFailureSignature(request: AdaptInterventionRequest) {
    this.received.push(request);
    return { interventionId: `intervention_${this.received.length}`, accepted: true };
  }
}

export class DemoCapabilityAdapter implements CapabilityServiceAdapter {
  constructor(private byStudent: Map<string, RawAttemptRecord[]>) {}
  async getRecentAttempts(studentId: string, capability: string, limit: number): Promise<RawAttemptRecord[]> {
    const all = this.byStudent.get(studentId) ?? [];
    return all.filter((a) => a.capability === capability).slice(-limit);
  }
  setAttempts(studentId: string, attempts: RawAttemptRecord[]): void {
    this.byStudent.set(studentId, attempts);
  }
}

/** Documented naive fallback (Section 10): first sighting of a topic is
 *  NOVEL, repeats of the same topic are RELATED, repeats of the exact same
 *  signature are FAMILIAR. A real implementation should defer to Transfer
 *  intelligence instead of this heuristic. */
export class HeuristicNoveltyAdapter implements NoveltyClassifierAdapter {
  private seenSignatures = new Set<string>();
  private seenTopics = new Set<string>();
  async classify(studentId: string, topic: string, questionSignature: string): Promise<NoveltyLevel> {
    const sigKey = `${studentId}|${topic}|${questionSignature}`;
    const topicKey = `${studentId}|${topic}`;
    if (this.seenSignatures.has(sigKey)) return 'FAMILIAR';
    const result: NoveltyLevel = this.seenTopics.has(topicKey) ? 'RELATED' : 'NOVEL';
    this.seenSignatures.add(sigKey);
    this.seenTopics.add(topicKey);
    return result;
  }
}

/** Dev-only auth: trusts an `Authorization: Dev <studentId>:<role>` header.
 *  Real JWT verification against the existing auth system is NOT
 *  implemented — see TRUTH_TABLE.md. */
export class DevAuthAdapter implements AuthAdapter {
  async verify(authorizationHeader: string | undefined): Promise<AuthContext | null> {
    if (!authorizationHeader?.startsWith('Dev ')) return null;
    const [studentId, role] = authorizationHeader.slice(4).split(':');
    if (!studentId) return null;
    return { studentId, role: (role as AuthContext['role']) ?? 'STUDENT' };
  }
}
