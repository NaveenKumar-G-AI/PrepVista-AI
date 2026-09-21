import {
  ActionLogRow,
  ActionValidity,
  CategoryScores,
  HypothesisRow,
  IncidentEventRow,
  IncidentInstance,
  IncidentTemplate,
  IndependenceSummary,
  MessageRow,
  OutboundMessageBody,
  PostmortemRow,
} from "./types";

const VALIDITY_SCORE: Record<ActionValidity, number> = {
  OPTIMAL: 100,
  ACCEPTABLE: 75,
  RISKY: 40,
  INVALID: 10,
};

const INVESTIGATIVE_ACTION_TYPES = [
  "INSPECT_LOGS",
  "INSPECT_METRICS",
  "INSPECT_TRACES",
  "INSPECT_DEPLOYMENT",
  "RUN_DIAGNOSTIC",
] as const;

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function actionDefFor(template: IncidentTemplate, log: ActionLogRow) {
  return template.actionDefs.find(
    (a) => a.actionType === log.actionType && (a.targetServiceKey ?? undefined) === (log.targetServiceKey ?? undefined)
  );
}

// ---------------------------------------------------------------
// Detection: how promptly the student moved from CREATED to actively
// investigating, measured in simulated minutes (not wall-clock — see
// the brief's "TIME MODEL": real-world waiting is never required).
// ---------------------------------------------------------------
function scoreDetection(events: IncidentEventRow[]): number {
  const firstInvestigative = events.find((e) =>
    (INVESTIGATIVE_ACTION_TYPES as readonly string[]).includes(e.eventType)
  );
  if (!firstInvestigative) return 20; // incident opened but never actually investigated
  const minutes = firstInvestigative.simMinutesAt;
  if (minutes <= 3) return 100;
  if (minutes <= 8) return 88;
  if (minutes <= 15) return 70;
  if (minutes <= 30) return 50;
  return 30;
}

// ---------------------------------------------------------------
// Investigation: breadth of *distinct* evidence sources consulted
// before the incident was mitigated, and whether investigation
// preceded action (vs. guessing then backfilling). Repeating the
// same action type doesn't add score past the first use — this is
// the direct implementation of "do not reward random clicking".
// ---------------------------------------------------------------
function scoreInvestigation(events: IncidentEventRow[], mitigatedAtMinutes: number | null): number {
  const beforeMitigation = mitigatedAtMinutes === null ? events : events.filter((e) => e.simMinutesAt <= mitigatedAtMinutes);
  const distinctTypesUsed = new Set(
    beforeMitigation
      .map((e) => e.eventType)
      .filter((t) => (INVESTIGATIVE_ACTION_TYPES as readonly string[]).includes(t))
  );
  const breadth = (distinctTypesUsed.size / INVESTIGATIVE_ACTION_TYPES.length) * 100;

  const firstMitigatingOrFix = events.find((e) => e.eventType === "ROLLBACK" || e.eventType === "DEPLOY_FIX");
  const firstInvestigative = events.find((e) =>
    (INVESTIGATIVE_ACTION_TYPES as readonly string[]).includes(e.eventType)
  );
  const investigatedFirst =
    !firstMitigatingOrFix || (firstInvestigative && firstInvestigative.simMinutesAt <= firstMitigatingOrFix.simMinutesAt);

  return clamp(breadth * (investigatedFirst ? 1 : 0.6));
}

// ---------------------------------------------------------------
// Evidence quality: overlap between evidence the student actually
// *attached to a hypothesis* and the template's expected evidence
// keys — restricted to evidence they can prove they inspected (i.e.
// it also appears as a matching event), so quoting an evidence key
// without ever opening it doesn't count.
// ---------------------------------------------------------------
function scoreEvidenceQuality(
  template: IncidentTemplate,
  hypotheses: HypothesisRow[],
  events: IncidentEventRow[]
): number {
  if (template.expectedEvidenceKeys.length === 0) return 100;
  const inspectedKeys = new Set(
    events
      .map((e) => (typeof e.payload?.evidenceKey === "string" ? (e.payload.evidenceKey as string) : null))
      .filter((k): k is string => Boolean(k))
  );
  const citedAndInspected = new Set<string>();
  for (const h of hypotheses) {
    for (const ref of h.evidenceRefs) {
      if (inspectedKeys.has(ref) && template.expectedEvidenceKeys.includes(ref)) {
        citedAndInspected.add(ref);
      }
    }
  }
  return clamp((citedAndInspected.size / template.expectedEvidenceKeys.length) * 100);
}

// ---------------------------------------------------------------
// Root cause: distinguishes "never found it", "found the immediate
// cause but stopped there", "correctly confirmed the true root
// cause", and penalizes confidently confirming the *wrong* cause
// (false confidence is worse than an open hypothesis).
// ---------------------------------------------------------------
function isOnCausalChain(template: IncidentTemplate, causeKey: string): boolean {
  return template.candidateCauseKeys.find((c) => c.key === causeKey)?.onCausalChain ?? false;
}

function scoreRootCause(template: IncidentTemplate, hypotheses: HypothesisRow[]): number {
  // Tier 1: confirmed the exact root cause, tagged as ROOT_CAUSE.
  const confirmedRoot = hypotheses.find(
    (h) => h.status === "CONFIRMED" && h.category === "ROOT_CAUSE" && h.implicatedCauseKey === template.rootCauseKey
  );
  if (confirmedRoot) {
    const wellEvidenced = confirmedRoot.evidenceRefs.some((r) => template.expectedEvidenceKeys.includes(r));
    return wellEvidenced ? 100 : 78;
  }

  // Tier 2 (bad): confidently confirmed something wrong. False confidence
  // is worse than staying open — and confirming a pure red herring is
  // worse than confirming a real-but-imprecise cause.
  const confirmedWrong = hypotheses.find(
    (h) => h.status === "CONFIRMED" && h.implicatedCauseKey !== template.rootCauseKey
  );
  if (confirmedWrong) {
    return isOnCausalChain(template, confirmedWrong.implicatedCauseKey) ? 20 : 5;
  }

  // Tier 3: found the exact root-cause key but under-categorized it
  // (e.g. tagged IMMEDIATE_CAUSE instead of escalating to ROOT_CAUSE).
  const rightKeyWrongCategory = hypotheses.find(
    (h) => h.implicatedCauseKey === template.rootCauseKey && h.category !== "ROOT_CAUSE"
  );
  if (rightKeyWrongCategory) return 55;

  // Tier 4: exploring something real (on the causal chain) but hasn't
  // landed on the precise root cause yet.
  const onChain = hypotheses.find((h) => isOnCausalChain(template, h.implicatedCauseKey));
  if (onChain) return 35;

  // Tier 5: only explored red herrings, or no hypotheses at all.
  return hypotheses.length > 0 ? 15 : 10;
}

function firstTimestampFor(events: IncidentEventRow[], predicate: (e: IncidentEventRow) => boolean): number | null {
  const e = events.find(predicate);
  return e ? e.simMinutesAt : null;
}

function scoreMitigation(template: IncidentTemplate, instance: IncidentInstance, actionLog: ActionLogRow[]): number {
  if (!instance.mitigated) return 0;
  const mitigatingAction = actionLog.find((a) => actionDefFor(template, a)?.isMitigation);
  if (!mitigatingAction) return 30; // state says mitigated but we can't find the action — be conservative
  const validity = actionDefFor(template, mitigatingAction)?.validity ?? "RISKY";
  return VALIDITY_SCORE[validity];
}

function scorePermanentFix(
  template: IncidentTemplate,
  instance: IncidentInstance,
  actionLog: ActionLogRow[]
): number {
  if (!instance.permanentFixApplied) return instance.mitigated ? 25 : 0;
  const fixAction = actionLog.find((a) => actionDefFor(template, a)?.isPermanentFix);
  if (!fixAction) return 40;
  const validity = actionDefFor(template, fixAction)?.validity ?? "RISKY";
  return VALIDITY_SCORE[validity];
}

// ---------------------------------------------------------------
// Communication: checks structural completeness (all required fields
// present with substantive content) and timeliness relative to the
// stakeholder ask. Deliberately does NOT attempt to verify the prose
// is *factually* accurate — see README "Known limitations" for why
// that's left to the AI coaching layer instead of claimed here.
// ---------------------------------------------------------------
function scoreCommunication(template: IncidentTemplate, messages: MessageRow[]): number {
  if (template.stakeholderTriggers.length === 0) return 100;
  let total = 0;
  for (const trig of template.stakeholderTriggers) {
    const inbound = messages.find((m) => m.direction === "INBOUND" && m.sender === trig.persona);
    if (!inbound) {
      total += 50; // trigger never fired yet in this run; neutral, not penalized
      continue;
    }
    const reply = messages.find(
      (m) => m.direction === "OUTBOUND" && m.simMinutesAt >= inbound.simMinutesAt
    );
    if (!reply) {
      total += 0;
      continue;
    }
    const body = reply.body as unknown as OutboundMessageBody;
    const requiredOk = trig.requiresFields.every((f) => {
      const v = (body as unknown as Record<string, unknown>)[f];
      return typeof v === "string" && v.trim().length >= 10;
    });
    const timely = reply.simMinutesAt - inbound.simMinutesAt <= 15;
    total += requiredOk ? (timely ? 100 : 80) : 35;
  }
  return clamp(total / template.stakeholderTriggers.length);
}

function scorePrevention(template: IncidentTemplate, postmortem: PostmortemRow | null): number {
  if (!postmortem) return 0;
  if (template.preventiveActionKeys.length === 0) return 100;
  const matched = postmortem.preventiveActionKeys.filter((k) => template.preventiveActionKeys.includes(k));
  const coverage = (matched.length / template.preventiveActionKeys.length) * 100;
  const fiveWhysComplete = postmortem.fiveWhys.filter((w) => w.trim().length > 0).length;
  const fiveWhysBonus = fiveWhysComplete >= 5 ? 10 : fiveWhysComplete * 2;
  return clamp(coverage * 0.85 + fiveWhysBonus);
}

export function computeCategoryScores(
  template: IncidentTemplate,
  instance: IncidentInstance,
  events: IncidentEventRow[],
  hypotheses: HypothesisRow[],
  actionLog: ActionLogRow[],
  messages: MessageRow[],
  postmortem: PostmortemRow | null
): CategoryScores {
  const mitigatedAt = firstTimestampFor(events, (e) => e.eventType === "ROLLBACK" || e.payload?.isMitigation === true);

  return {
    detection: scoreDetection(events),
    investigation: scoreInvestigation(events, mitigatedAt),
    evidenceQuality: scoreEvidenceQuality(template, hypotheses, events),
    rootCause: scoreRootCause(template, hypotheses),
    mitigation: scoreMitigation(template, instance, actionLog),
    permanentFix: scorePermanentFix(template, instance, actionLog),
    communication: scoreCommunication(template, messages),
    prevention: scorePrevention(template, postmortem),
  };
}

export function computeOverall(rubric: IncidentTemplate["scoringRubric"], scores: CategoryScores): number {
  const weights = rubric as unknown as Record<keyof CategoryScores, number>;
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  let sum = 0;
  (Object.keys(scores) as (keyof CategoryScores)[]).forEach((k) => {
    sum += scores[k] * (weights[k] ?? 0);
  });
  return clamp(sum / totalWeight);
}

export function computeEngineeringJudgment(
  template: IncidentTemplate,
  events: IncidentEventRow[],
  actionLog: ActionLogRow[]
): number {
  // Only consequential actions count toward judgment — read-only
  // investigation (INSPECT_*, RUN_DIAGNOSTIC) is already its own rubric
  // category, so including it here would let "look at everything" inflate
  // judgment for free instead of reflecting the quality of real decisions.
  const consequential = actionLog.filter(
    (a) => !(INVESTIGATIVE_ACTION_TYPES as readonly string[]).includes(a.actionType)
  );
  if (consequential.length === 0) return 30;

  const validityScores = consequential.map((a) => {
    const def = actionDefFor(template, a);
    return def ? VALIDITY_SCORE[def.validity] : 40;
  });
  const avgValidity = validityScores.reduce((a, b) => a + b, 0) / validityScores.length;

  const firstConsequential = consequential[0]!;
  const firstInvestigative = events.find((e) =>
    (INVESTIGATIVE_ACTION_TYPES as readonly string[]).includes(e.eventType)
  );
  const actedBeforeInvestigating = Boolean(
    !firstInvestigative || firstConsequential.simMinutesAt < firstInvestigative.simMinutesAt
  );

  return clamp(avgValidity * (actedBeforeInvestigating ? 0.85 : 1));
}

const CATEGORY_LABELS: Record<keyof CategoryScores, string> = {
  detection: "Fast, deliberate incident acknowledgment",
  investigation: "Evidence-driven investigation",
  evidenceQuality: "High-quality, well-attached evidence",
  rootCause: "Root-cause identification",
  mitigation: "Safe, effective mitigation",
  permanentFix: "Durable permanent fix",
  communication: "Stakeholder communication",
  prevention: "Preventive engineering",
};

const NEXT_RECOMMENDATION_BY_WEAKNESS: Record<keyof CategoryScores, string> = {
  detection: "Latency-spike triage drill (SEV-2, tight time budget)",
  investigation: "Multi-service distributed-system failure simulation",
  evidenceQuality: "Log/trace correlation exercise",
  rootCause: "Five-whys root cause deep dive",
  mitigation: "Safe-rollback judgment simulation",
  permanentFix: "Database performance regression simulation",
  communication: "Incident communication drill with multiple stakeholders",
  prevention: "Postmortem and prevention-engineering workshop",
};

export function topStrengthAndGap(scores: CategoryScores): { topStrength: string; topGap: string; nextRecommendation: string } {
  const entries = Object.entries(scores) as [keyof CategoryScores, number][];
  const best = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const worst = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
  return {
    topStrength: CATEGORY_LABELS[best[0]],
    topGap: CATEGORY_LABELS[worst[0]],
    nextRecommendation: NEXT_RECOMMENDATION_BY_WEAKNESS[worst[0]],
  };
}

export function computeIndependence(events: IncidentEventRow[]): IndependenceSummary {
  const assistanceEvents = events.filter((e) => e.eventType === "ASSISTANCE_USED");
  const aiEvents = events.filter((e) => e.eventType === "AI_COACH_REQUESTED");
  const investigativeEvents = events.filter((e) =>
    (INVESTIGATIVE_ACTION_TYPES as readonly string[]).includes(e.eventType)
  );
  const modes = Array.from(
    new Set(assistanceEvents.map((e) => (typeof e.payload?.mode === "string" ? (e.payload.mode as string) : "UNKNOWN")))
  );
  const rootCauseRevealed = assistanceEvents.some(
    (e) => e.payload?.mode === "STRONG_GUIDANCE" && e.payload?.revealedRootCause === true
  );
  const denominator = investigativeEvents.length + assistanceEvents.length;
  const ratio = denominator === 0 ? 1 : investigativeEvents.length / denominator;

  return {
    hintsUsed: assistanceEvents.length,
    assistanceModesUsed: modes,
    rootCauseRevealed,
    aiCallsMade: aiEvents.length,
    independentInvestigationRatio: Math.round(ratio * 100) / 100,
  };
}
